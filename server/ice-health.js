const dgram = require("dgram");
const net = require("net");
const tls = require("tls");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

/**
 * Parse a STUN or TURN URL into components.
 * Examples:
 *   stun:stun.example.com:3478
 *   turn:turn.example.com:3478?transport=tcp
 *   turns:turn.example.com:443?transport=tcp
 */
function parseIceUrl(iceUrl) {
	if (typeof iceUrl !== "string") return null;
	const trimmed = iceUrl.trim();
	const match = trimmed.match(/^([^:]+):([^:?]+)(?::(\d+))?(?:\?(.*))?$/);
	if (!match) return null;

	const protocol = match[1].toLowerCase();
	const host = match[2];
	let port = match[3] ? parseInt(match[3], 10) : (protocol === "turns" ? 5349 : 3478);
	const query = match[4] || "";
	const queryParams = new URLSearchParams(query);
	let transport = (queryParams.get("transport") || "").toLowerCase();
	if (!transport) {
		transport = protocol === "turns" ? "tcp" : "udp";
	}

	return { protocol, host, port, transport, rawUrl: trimmed };
}

/**
 * Probe a UDP STUN/TURN server using RFC 5389 STUN Binding Request.
 */
function checkUdpStun(host, port, timeoutMs = 3000) {
	return new Promise((resolve) => {
		const socket = dgram.createSocket("udp4");
		let finished = false;
		const startTime = Date.now();

		const cleanup = () => {
			if (!finished) {
				finished = true;
				clearTimeout(timer);
				try {
					socket.close();
				} catch (e) {}
			}
		};

		const timer = setTimeout(() => {
			cleanup();
			resolve({ status: "down", error: "timeout", latencyMs: Date.now() - startTime });
		}, timeoutMs);

		socket.on("error", (err) => {
			cleanup();
			resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
		});

		socket.on("message", (msg) => {
			const latency = Date.now() - startTime;
			// STUN response: at least 20 bytes, magic cookie 0x2112A442
			if (msg.length >= 20) {
				const magicCookie = msg.readUInt32BE(4);
				const msgType = msg.readUInt16BE(0);
				// 0x0101 = Binding Success Response, 0x0111 = Binding Error Response
				if (magicCookie === 0x2112a442 && (msgType === 0x0101 || msgType === 0x0111)) {
					cleanup();
					resolve({ status: "up", latencyMs: latency });
					return;
				}
			}
			cleanup();
			resolve({ status: "up", latencyMs: latency });
		});

		try {
			// Construct STUN Binding Request (20 bytes)
			const req = Buffer.alloc(20);
			req.writeUInt16BE(0x0001, 0); // Binding Request
			req.writeUInt16BE(0x0000, 2); // Message length = 0
			req.writeUInt32BE(0x2112a442, 4); // Magic Cookie
			const txId = crypto.randomBytes(12);
			txId.copy(req, 8); // Transaction ID

			socket.send(req, 0, req.length, port, host, (err) => {
				if (err) {
					cleanup();
					resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
				}
			});
		} catch (err) {
			cleanup();
			resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
		}
	});
}

/**
 * Probe a TCP connection for TURN over TCP.
 */
function checkTcp(host, port, timeoutMs = 3000) {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const socket = new net.Socket();
		let finished = false;

		const cleanup = () => {
			if (!finished) {
				finished = true;
				socket.destroy();
			}
		};

		socket.setTimeout(timeoutMs);

		socket.on("connect", () => {
			const latency = Date.now() - startTime;
			cleanup();
			resolve({ status: "up", latencyMs: latency });
		});

		socket.on("timeout", () => {
			cleanup();
			resolve({ status: "down", error: "timeout", latencyMs: Date.now() - startTime });
		});

		socket.on("error", (err) => {
			cleanup();
			resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
		});

		try {
			socket.connect(port, host);
		} catch (err) {
			cleanup();
			resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
		}
	});
}

/**
 * Probe a TLS connection for TURNS over TLS.
 */
function checkTls(host, port, timeoutMs = 3000) {
	return new Promise((resolve) => {
		const startTime = Date.now();
		let finished = false;

		const socket = tls.connect({ host, port, timeout: timeoutMs, rejectUnauthorized: false }, () => {
			const latency = Date.now() - startTime;
			if (!finished) {
				finished = true;
				socket.destroy();
				resolve({ status: "up", latencyMs: latency });
			}
		});

		socket.setTimeout(timeoutMs);

		socket.on("timeout", () => {
			if (!finished) {
				finished = true;
				socket.destroy();
				resolve({ status: "down", error: "timeout", latencyMs: Date.now() - startTime });
			}
		});

		socket.on("error", (err) => {
			if (!finished) {
				finished = true;
				socket.destroy();
				resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
			}
		});
	});
}

/**
 * Probe an HTTP/HTTPS URL (e.g. imprint or privacy policy) with redirect support.
 */
function checkHttpUrl(targetUrl, timeoutMs = 5000, maxRedirects = 3) {
	return new Promise((resolve) => {
		let urlObj;
		try {
			urlObj = new URL(targetUrl);
		} catch (e) {
			return resolve({ status: "down", error: "Invalid URL", latencyMs: 0 });
		}

		const startTime = Date.now();
		const lib = urlObj.protocol === "https:" ? https : http;

		const requestOptions = {
			method: "HEAD",
			timeout: timeoutMs,
			headers: {
				"User-Agent": "SkyVR-HealthCheck/1.0"
			}
		};

		const req = lib.request(urlObj, requestOptions, (res) => {
			// If 405 Method Not Allowed, retry with GET
			if (res.statusCode === 405) {
				res.resume();
				const getOptions = { ...requestOptions, method: "GET" };
				const getReq = lib.request(urlObj, getOptions, (getRes) => {
					getRes.resume();
					const latency = Date.now() - startTime;
					const isUp = getRes.statusCode >= 200 && getRes.statusCode < 400;
					resolve({
						status: isUp ? "up" : "down",
						statusCode: getRes.statusCode,
						latencyMs: latency,
						...(isUp ? {} : { error: `HTTP ${getRes.statusCode}` })
					});
				});
				getReq.on("error", (err) => {
					resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
				});
				getReq.on("timeout", () => {
					getReq.destroy();
					resolve({ status: "down", error: "timeout", latencyMs: Date.now() - startTime });
				});
				getReq.end();
				return;
			}

			// Follow redirects (301, 302, 307, 308)
			if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && maxRedirects > 0) {
				res.resume();
				const nextUrl = new URL(res.headers.location, urlObj).toString();
				return checkHttpUrl(nextUrl, timeoutMs, maxRedirects - 1).then((redirectResult) => {
					resolve({
						...redirectResult,
						latencyMs: Date.now() - startTime
					});
				});
			}

			res.resume();
			const latency = Date.now() - startTime;
			const isUp = res.statusCode >= 200 && res.statusCode < 400;
			resolve({
				status: isUp ? "up" : "down",
				statusCode: res.statusCode,
				latencyMs: latency,
				...(isUp ? {} : { error: `HTTP ${res.statusCode}` })
			});
		});

		req.on("error", (err) => {
			resolve({ status: "down", error: err.message, latencyMs: Date.now() - startTime });
		});

		req.on("timeout", () => {
			req.destroy();
			resolve({ status: "down", error: "timeout", latencyMs: Date.now() - startTime });
		});

		req.end();
	});
}

/**
 * Probe a single STUN or TURN server.
 */
async function probeServer(serverConfig) {
	const rawUrl = typeof serverConfig === "string" ? serverConfig : serverConfig.urls;
	const parsed = parseIceUrl(rawUrl);

	if (!parsed) {
		return {
			url: rawUrl,
			status: "error",
			error: "Invalid ICE URL format"
		};
	}

	let probeResult;
	if (parsed.protocol === "turns") {
		probeResult = await checkTls(parsed.host, parsed.port);
	} else if (parsed.transport === "tcp") {
		probeResult = await checkTcp(parsed.host, parsed.port);
	} else {
		probeResult = await checkUdpStun(parsed.host, parsed.port);
	}

	return {
		url: parsed.rawUrl,
		protocol: parsed.protocol,
		transport: parsed.transport,
		status: probeResult.status,
		latencyMs: probeResult.latencyMs,
		...(probeResult.error ? { error: probeResult.error } : {})
	};
}

class IceHealthMonitor {
	constructor(iceServers = [], legalLinks = {}, options = {}) {
		this.iceServers = iceServers;
		this.legalLinks = legalLinks; // { imprintUrl, privacyPolicyUrl }
		this.checkIntervalMs = options.checkIntervalMs || 60000; // 60 seconds
		this.cache = {
			lastChecked: null,
			isChecking: false,
			summary: {
				stunAvailable: false,
				turnAvailable: false,
				legalAvailable: true,
				total: 0,
				up: 0,
				down: 0
			},
			servers: [],
			legalLinks: {
				configured: false
			}
		};
		this.intervalTimer = null;
		this.initialCheckPromise = null;
	}

	start() {
		this.initialCheckPromise = this.checkAll();
		this.intervalTimer = setInterval(() => {
			this.checkAll().catch((err) => {
				console.error("Error during scheduled ICE/legal health check:", err);
			});
		}, this.checkIntervalMs);
		if (this.intervalTimer.unref) {
			this.intervalTimer.unref();
		}
	}

	stop() {
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}
	}

	async checkAll() {
		if (this.cache.isChecking) return this.cache;
		this.cache.isChecking = true;

		try {
			const urlsToProbe = [];
			for (const server of this.iceServers) {
				const urls = typeof server === "string" ? [server] : (Array.isArray(server.urls) ? server.urls : [server.urls]);
				for (const u of urls) {
					if (u) urlsToProbe.push(u);
				}
			}

			// Probe ICE servers and configured legal links concurrently
			const icePromises = urlsToProbe.map((url) => probeServer(url));

			const hasImprint = Boolean(this.legalLinks.imprintUrl && this.legalLinks.imprintUrl.trim());
			const hasPrivacy = Boolean(this.legalLinks.privacyPolicyUrl && this.legalLinks.privacyPolicyUrl.trim());

			const imprintPromise = hasImprint
				? checkHttpUrl(this.legalLinks.imprintUrl.trim())
				: Promise.resolve(null);

			const privacyPromise = hasPrivacy
				? checkHttpUrl(this.legalLinks.privacyPolicyUrl.trim())
				: Promise.resolve(null);

			const [iceResults, imprintResult, privacyResult] = await Promise.all([
				Promise.all(icePromises),
				imprintPromise,
				privacyPromise
			]);

			let stunUp = 0;
			let turnUp = 0;
			let totalUp = 0;

			for (const r of iceResults) {
				if (r.status === "up") {
					totalUp++;
					if (r.protocol === "stun") stunUp++;
					if (r.protocol === "turn" || r.protocol === "turns") turnUp++;
				}
			}

			const total = iceResults.length;
			const stunTotal = iceResults.filter((r) => r.protocol === "stun").length;
			const turnTotal = iceResults.filter((r) => r.protocol === "turn" || r.protocol === "turns").length;

			// Legal links evaluation
			const legalLinksOutput = {
				configured: hasImprint || hasPrivacy
			};

			let legalHealthy = true;

			if (hasImprint) {
				legalLinksOutput.imprint = {
					url: this.legalLinks.imprintUrl.trim(),
					...imprintResult
				};
				if (imprintResult.status !== "up") {
					legalHealthy = false;
				}
			}

			if (hasPrivacy) {
				legalLinksOutput.privacyPolicy = {
					url: this.legalLinks.privacyPolicyUrl.trim(),
					...privacyResult
				};
				if (privacyResult.status !== "up") {
					legalHealthy = false;
				}
			}

			if (legalLinksOutput.configured) {
				legalLinksOutput.status = legalHealthy ? "healthy" : "degraded";
			}

			this.cache.lastChecked = new Date().toISOString();
			this.cache.summary = {
				stunAvailable: stunTotal === 0 || stunUp > 0,
				turnAvailable: turnTotal === 0 || turnUp > 0,
				legalAvailable: legalHealthy,
				stunUp,
				stunTotal,
				turnUp,
				turnTotal,
				total,
				up: totalUp,
				down: total - totalUp
			};
			this.cache.servers = iceResults;
			this.cache.legalLinks = legalLinksOutput;
		} catch (err) {
			console.error("Failed to run health checks:", err);
		} finally {
			this.cache.isChecking = false;
		}

		return this.cache;
	}

	async getStatus() {
		// If initial check is still running, wait for it
		if (!this.cache.lastChecked && this.initialCheckPromise) {
			await this.initialCheckPromise;
		}
		return this.cache;
	}
}

module.exports = {
	IceHealthMonitor,
	parseIceUrl,
	probeServer,
	checkHttpUrl
};
