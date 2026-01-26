/* global NAF, easyrtc, window, document, performance, location, URLSearchParams, alert, THREE */

// Initialize loading status immediately to prevent race conditions
window.loadingStatus = {
    assets: false,
    network: false,
    stars: false,
    sync: false
};
if (typeof window.localPlayerSpawned === 'undefined') {
    window.localPlayerSpawned = false;
}
// Track if we have received a valid sky state from the network or if we are the room creator
window.skyStateInitialized = false;
window.skyStateLastSync = 0;
window.nafConnectTime = 0; // Track when NAF actually connected
window.reverseMouse = true; // Move sky (Default) vs Move camera

// Helper to determine if we are safe to broadcast changes to the room
window.canUpdateSkyState = function (forceAuthoritative = false) {
    if (new URLSearchParams(window.location.search).get('room') === 'none') {
        return true;
    }
    if (typeof NAF === 'undefined' || !NAF.connection || !NAF.connection.adapter || !NAF.connection.isConnected()) return false;

    // If we've already synced with the room, or we are explicitly forcing an authoritative action (scrubbing), we are safe.
    if (window.skyStateInitialized || forceAuthoritative) return true;

    const skyMaster = document.getElementById('sky-master');
    const isOwner = skyMaster && NAF.utils.isMine(skyMaster);
    const connectedClients = NAF.connection.getConnectedClients();
    const isAlone = Object.keys(connectedClients).length === 0;

    if (!window.nafConnectTime) window.nafConnectTime = performance.now();

    // GRADUATION: We graduate to Master if:
    // 1. We are alone in the room (immediate).
    // 2. We are the owner of the sky-master entity.
    // 3. We've been connected for at least 5 seconds (safety fallback).
    if (isAlone || isOwner || (performance.now() - window.nafConnectTime > 5000)) {
        if (!window.skyStateInitialized) {
            console.log("canUpdateSkyState: Graduating to Master (Owner, Alone, or Fallback).");
            window.skyStateInitialized = true;
            if (typeof window.updateLoadingIndicator === 'function') {
                window.updateLoadingIndicator('sync', true);
            }
        }
        return true;
    }
    return false;
};

// Global Label Syncer (Reconciles DOM with desired state)
window.syncIdentifiedLabels = function (targetLabels) {
    const container = document.getElementById('stars-point-cloud') || document.querySelector('a-scene');
    if (!container) return;

    // Current labels identifying as 'local-identified-info'
    const currentEls = Array.from(document.querySelectorAll('.local-identified-info'));

    // 1. Mark all for potential removal
    const toKeep = new Set();

    targetLabels.forEach(labelData => {
        // Find if exists (match by unique ID if possible, or name/position)
        // We'll use a composite key of name + position for uniqueness if no ID
        const existing = currentEls.find(el => {
            const d = el.getAttribute('identified-info');
            // Use close-enough position matching since floats vary
            const pos = el.object3D.position;
            const dist = pos.distanceTo(new THREE.Vector3(labelData.position.x, labelData.position.y, labelData.position.z));
            return d.name === labelData.name && dist < 1.0;
        });

        if (existing) {
            // It exists, keep it alive
            toKeep.add(existing);
            // Ensure it's not removing
            existing.setAttribute('identified-info', 'isRemoving', false);
            existing.setAttribute('identified-info', 'targetTextOpacity', 0.5);
            existing.setAttribute('identified-info', 'targetMarkerOpacity', 0.6);
        } else {
            // Create New
            const el = document.createElement('a-entity');
            el.classList.add('local-identified-info');
            el.setAttribute('identified-info', {
                name: labelData.name,
                info: labelData.info,
                type: labelData.type,
                targetTextOpacity: 0.5,
                targetMarkerOpacity: 0.6,
                isRemoving: false
            });
            el.setAttribute('position', labelData.position);
            container.appendChild(el);
        }
    });

    // 2. Fade out and remove extras
    currentEls.forEach(el => {
        if (!toKeep.has(el)) {
            // Set to remove (component handles fade out then self-destruct)
            el.setAttribute('identified-info', 'isRemoving', true);
            el.setAttribute('identified-info', 'targetTextOpacity', 0);
            el.setAttribute('identified-info', 'targetMarkerOpacity', 0);
        }
    });
};

// Global Shape Syncer
window.syncStampedShapes = function (targetShapes) {
    const container = document.getElementById('stars-point-cloud') || document.querySelector('a-scene');
    if (!container) return;

    const currentEls = Array.from(document.querySelectorAll('.local-stamped-shape'));
    const toKeep = new Set();

    targetShapes.forEach(shapeData => {
        const existing = currentEls.find(el => {
            const d = el.getAttribute('stamped-shape');
            const pos = el.object3D.position;
            const dist = pos.distanceTo(new THREE.Vector3(shapeData.position.x, shapeData.position.y, shapeData.position.z));
            return d && d.shape === shapeData.shape && dist < 1.0;
        });

        if (existing) {
            toKeep.add(existing);
            existing.setAttribute('stamped-shape', 'isRemoving', false);
        } else {
            const el = document.createElement('a-entity');
            el.classList.add('local-stamped-shape');
            const finalOpacity = (shapeData.shape === 'star') ? 0.2 : 0.4;
            el.setAttribute('stamped-shape', {
                shape: shapeData.shape,
                color: shapeData.color || '#FFFF00',
                opacity: finalOpacity,
                isRemoving: false
            });
            el.setAttribute('position', shapeData.position);
            container.appendChild(el);
        }
    });

    currentEls.forEach(el => {
        if (!toKeep.has(el)) {
            el.setAttribute('stamped-shape', 'isRemoving', true);
        }
    });
};

window.checkLoadingComplete = function () {
    if (performance.now() % 5000 < 100) { // Log every ~5s
        console.log("Loading Status:", JSON.parse(JSON.stringify(window.loadingStatus)), "PlayerSpawned:", window.localPlayerSpawned);
    }

    const isSolo = new URLSearchParams(window.location.search).get('room') === 'none';
    if (isSolo) {
        window.loadingStatus.network = true;
        window.loadingStatus.sync = true;
    }

    if (window.loadingStatus.assets &&
        window.loadingStatus.network &&
        window.loadingStatus.stars &&
        window.loadingStatus.sync &&
        window.loadingStatus.spawn &&
        window.localPlayerSpawned) {
        const overlay = document.getElementById('loading-overlay');
        if (overlay && overlay.style.display !== 'none') {
            overlay.classList.add('fade-out');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 1000);
        }
    }
}

window.updateLoadingIndicator = function (type, status, subStatus) {
    window.loadingStatus[type] = status;
    const item = document.getElementById(`status-${type}`);
    const subItem = document.getElementById(`status-${type}-sub`);
    const isSolo = new URLSearchParams(window.location.search).get('room') === 'none';

    if (item) {
        // Hide network/sync steps in solo mode
        if (isSolo && (type === 'network' || type === 'sync')) {
            item.style.display = 'none';
            if (subItem) subItem.style.display = 'none';
            return;
        }

        if (status) {
            item.classList.remove('active');
            item.classList.add('complete');
            item.querySelector('.icon').textContent = '✓';

            // Hide sub-item when complete
            if (subItem) {
                subItem.style.display = 'none';
            }

            if (type === 'network') {
                const urlParams = new URLSearchParams(window.location.search);
                const room = urlParams.get('room') || 'default';
                item.querySelector('.label').textContent = i18next.t('loading.connected_to', { room: room });
            } else if (type === 'assets') {
                item.querySelector('.label').textContent = i18next.t('loading.init_complete');
                // Hide progress bar
                const progressItem = document.getElementById('status-assets-progress');
                if (progressItem) progressItem.style.display = 'none';
            } else if (type === 'stars') {
                item.querySelector('.label').textContent = i18next.t('loading.stars_complete');
                // Hide progress bar
                const progressItem = document.getElementById('status-stars-progress');
                if (progressItem) progressItem.style.display = 'none';
            } else if (type === 'sync') {
                item.querySelector('.label').textContent = i18next.t('loading.sync_complete');
            } else if (type === 'spawn') {
                item.querySelector('.label').textContent = i18next.t('loading.arrival_complete');
            }
        } else {
            item.classList.add('active');
            item.querySelector('.icon').textContent = '○';

            // Show sub-item when active
            if (subItem && subStatus) {
                subItem.style.display = 'flex';
            }
        }
    }
    window.checkLoadingComplete();
}

// Function to update progress bar for star data
window.updateStarProgress = function (percent) {
    const progressBar = document.getElementById('stars-progress-bar');
    const progressText = document.getElementById('stars-progress-text');
    const progressItem = document.getElementById('status-stars-progress');

    percent = Math.min(Math.max(0, percent), 100);

    if (progressItem) {
        progressItem.style.display = 'flex';
    }

    if (progressBar) {
        progressBar.style.width = percent + '%';
    }

    if (progressText) {
        progressText.textContent = Math.floor(percent) + '%';
    }
}

// Function to update progress bar for assets
window.updateAssetProgress = function (percent) {
    const progressBar = document.getElementById('assets-progress-bar');
    const progressText = document.getElementById('assets-progress-text');
    const progressItem = document.getElementById('status-assets-progress');

    // Cap at 100%
    percent = Math.min(percent, 100);

    if (progressItem) {
        progressItem.style.display = 'flex';
    }

    if (progressBar) {
        progressBar.style.width = percent + '%';
    }

    if (progressText) {
        progressText.textContent = Math.floor(percent) + '%';
    }
}

// Track asset loading
window.assetTracker = {
    total: 0,
    loaded: 0,
    init: function () {
        // Count all assets in a-assets
        const assetsEl = document.querySelector('a-assets');
        if (assetsEl) {
            const images = assetsEl.querySelectorAll('img');
            const scripts = assetsEl.querySelectorAll('script');
            this.total = images.length + scripts.length;

            // Show progress bar
            window.updateAssetProgress(0);

            // Track images
            images.forEach(img => {
                if (img.complete) {
                    this.onAssetLoaded();
                } else {
                    img.addEventListener('load', () => this.onAssetLoaded());
                    img.addEventListener('error', () => this.onAssetLoaded());
                }
            });

            // Track scripts
            scripts.forEach(script => {
                script.addEventListener('load', () => this.onAssetLoaded());
                script.addEventListener('error', () => this.onAssetLoaded());
            });
        }
    },
    onAssetLoaded: function () {
        this.loaded++;
        const percent = (this.loaded / this.total) * 100;
        window.updateAssetProgress(percent);

        if (this.loaded >= this.total) {
            // Show sub-item when assets are loading
            const assetsSubItem = document.getElementById('status-assets-sub');
            if (assetsSubItem) {
                assetsSubItem.style.display = 'flex';
            }
        }
    }
};


window.onLocalPlayerSpawned = function () {
    console.log("Local player spawned and positioned. Fading loading screen.");
    window.localPlayerSpawned = true;
    window.updateLoadingIndicator('spawn', true);
    window.checkLoadingComplete();
};

// Safety fallback
setInterval(window.checkLoadingComplete, 1000);

// Network connection timeout fallback
setTimeout(() => {
    if (!window.loadingStatus.network) {
        const fallbackMsg = document.getElementById('network-fallback');
        const urlParams = new URLSearchParams(window.location.search);
        if (fallbackMsg) {
            const micDisabled = urlParams.get('mic') === 'false';
            const p = fallbackMsg.querySelector('p');
            const btn = fallbackMsg.querySelector('button');
            if (p && micDisabled) {
                p.textContent = i18next.t('loading.unstable_connection');
            }
            if (btn && micDisabled) {
                btn.textContent = i18next.t('loading.enter_solo');
            }
            fallbackMsg.style.display = 'block';
        }
    }
}, 10000); // Show after 10 seconds of waiting for network

window.joinWithoutAudio = function () {
    const url = new URL(window.location.href);
    if (url.searchParams.get('mic') === 'false') {
        // If we already tried without mic and it still fails, offer Solo Mode
        url.searchParams.set('room', 'none');
    } else {
        url.searchParams.set('mic', 'false');
    }
    window.location.href = url.toString();
};

// Sanitization functions for security
function sanitizeRoomName(value) {
    if (!value) return null;
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '').substring(0, 16);
}

function sanitizePlayerName(value) {
    if (!value) return null;
    return value.replace(/[^a-zA-Z0-9- ]/g, '').substring(0, 20);
}

// Parse URL parameters for room, name, and color
const urlParams = new URLSearchParams(window.location.search);
const roomParamRaw = urlParams.get('room');
const nameParamRaw = urlParams.get('name');
const roomParam = roomParamRaw === 'none' ? 'none' : sanitizeRoomName(roomParamRaw);
const nameParam = sanitizePlayerName(nameParamRaw);
const colorParam = urlParams.get('color');
const presenceParamRaw = urlParams.get('presence') || 'avatar';
const presenceParam = presenceParamRaw.split(':')[0].trim();
const debugParam = urlParams.get('debug') === 'true';

// Enable stats if debug=true is present
if (debugParam) {
    document.addEventListener('DOMContentLoaded', () => {
        const scene = document.querySelector('a-scene');
        if (scene) {
            scene.setAttribute('stats', '');
        }
    });
}

// Check if URL parameters were modified by sanitization
if (!window.location.search.includes('no-redirect')) {
    let hasInvalidParams = false;
    let errorMessages = [];

    if (roomParamRaw && roomParam !== roomParamRaw) {
        errorMessages.push('Room name contains invalid characters.');
        hasInvalidParams = true;
    }

    if (nameParamRaw && nameParam !== nameParamRaw) {
        errorMessages.push('Player name contains invalid characters.');
        hasInvalidParams = true;
    }

    // Check length restrictions
    if (roomParamRaw && roomParamRaw.length > 16) {
        errorMessages.push('Room name exceeds 16 character limit.');
        hasInvalidParams = true;
    }

    if (nameParamRaw && nameParamRaw.length > 20) {
        errorMessages.push('Player name exceeds 20 character limit.');
        hasInvalidParams = true;
    }

    if (hasInvalidParams) {
        const errorMsg = 'Invalid URL Parameters:\n\n' +
            errorMessages.join('\n') +
            '\n\nRoom names: lowercase letters (a-z), numbers (0-9), and hyphens (-), max 16 chars.\n' +
            'Player names: letters (A-Z, a-z), numbers (0-9), hyphens (-), and spaces, max 20 chars.\n\n' +
            'You will be redirected to the lobby.';
        alert(errorMsg);
        window.location.href = 'lobby.html';
    }
}

window.getLobbyParams = function () {
    const camera = document.getElementById('camera');
    const room = roomParam || '';
    let name = nameParam || '';
    let color = colorParam || '';

    if (camera && camera.components['player-info']) {
        const data = camera.components['player-info'].data;
        name = data.name || name;
        color = data.color || color;
    }

    let params = `?room=${room}`;
    if (name) params += `&name=${encodeURIComponent(name)}`;
    if (color) params += `&color=${encodeURIComponent(color)}`;
    return params;
};

// If no room is specified, redirect to lobby (unless it's 'none' for solo)
if (!roomParam && !window.location.search.includes('no-redirect')) {
    window.location.href = 'lobby.html' + window.getLobbyParams();
}

// --- CRITICAL MEDIA HOOKS ---
// These hooks prevent EasyRTC from requesting local media based on the user's choices.
// This allows the user to JOIN with 'audio: true' and 'video: true' (to see/hear others)
// without being prompted for their own media if they don't want to share it.
if (typeof easyrtc !== 'undefined') {
    // Audio Hook
    const originalEnableAudio = easyrtc.enableAudio;
    easyrtc.enableAudio = function (val) {
        const micEnabled = urlParams.get('mic') !== 'false';
        if (!micEnabled && val === true) {
            console.log("NAF-Hook: Blocking local audio capture request (Mic was unchecked in lobby).");
            return originalEnableAudio.call(easyrtc, false);
        }
        return originalEnableAudio.apply(easyrtc, arguments);
    };

    // Video Hook
    const originalEnableVideo = easyrtc.enableVideo;
    easyrtc.enableVideo = function (val) {
        if (presenceParam !== 'webcam' && val === true) {
            console.log("NAF-Hook: Blocking local video capture request (Avatar Mode).");
            return originalEnableVideo.call(easyrtc, false);
        }
        return originalEnableVideo.apply(easyrtc, arguments);
    };
}

document.addEventListener('DOMContentLoaded', () => {
    const sceneEl = document.querySelector('a-scene');
    const cameraEl = document.getElementById('camera');
    const micEnabled = urlParams.get('mic') !== 'false';

    if (sceneEl) {
        if (roomParam && roomParam !== 'none') {
            // Sanitized global 'presenceParam' is already available
            // CRITICAL FIX: We set both audio and video to true ALWAYS.
            // This ensures the PeerConnection is configured to receive both from others.
            const audioEnabledForScene = true;
            const videoEnabledForScene = true;

            // Show network sub-item
            const networkSubItem = document.getElementById('status-network-sub');
            if (networkSubItem) {
                networkSubItem.style.display = 'flex';
            }

            // CRITICAL: We must rebuild the attribute string because multiple setAttributes might fail with NAF's parser
            const config = `
        room: ${roomParam};
        adapter: easyrtc;
        audio: ${audioEnabledForScene};
        video: ${videoEnabledForScene};
        onConnect: onConnect;
      `;
            console.log("DEBUG: networked-scene config:", config);
            sceneEl.setAttribute('networked-scene', config);
        } else if (roomParam === 'none') {
            console.log("Standalone mode: Disabling NAF and auto-completing network syncing.");
            sceneEl.removeAttribute('networked-scene');
            window.loadingStatus.network = true;
            window.loadingStatus.sync = true;
            window.skyStateInitialized = true;

            // Re-update indicators for UI
            setTimeout(() => {
                window.updateLoadingIndicator('network', true);
                window.updateLoadingIndicator('sync', true);
                window.updateLoadingIndicator('spawn', false, true); // Show "Selecting seat and spawning..."
            }, 100);
        }

        // If mic is explicitly disabled or in solo mode, update the UI immediately
        if (!micEnabled || roomParam === 'none') {
            // No-op: mic-btn removed
        }
    }

    const rightControllerEl = document.getElementById('right-controller');

    const leftControllerEl = document.getElementById('left-controller');

    if (cameraEl) {
        if (nameParam) cameraEl.setAttribute('player-info', 'name', nameParam);
        if (presenceParam) cameraEl.setAttribute('player-info', 'presence', presenceParam);
        if (colorParam) {
            const color = colorParam.startsWith('#') ? colorParam : '#' + colorParam;
            cameraEl.setAttribute('player-info', 'color', color);
        }
    }

    if (rightControllerEl) {
        if (nameParam) rightControllerEl.setAttribute('player-info', 'name', nameParam);
        if (colorParam) {
            const color = colorParam.startsWith('#') ? colorParam : '#' + colorParam;
            rightControllerEl.setAttribute('player-info', 'color', color);
        }
        if (presenceParam) rightControllerEl.setAttribute('player-info', 'presence', presenceParam);
    }

    if (leftControllerEl) {
        if (nameParam) leftControllerEl.setAttribute('player-info', 'name', nameParam);
        if (colorParam) {
            const color = colorParam.startsWith('#') ? colorParam : '#' + colorParam;
            leftControllerEl.setAttribute('player-info', 'color', color);
        }
        if (presenceParam) leftControllerEl.setAttribute('player-info', 'presence', presenceParam);
    }
});


window.onConnect = function () {
    console.log('onConnect', new Date());
    window.updateLoadingIndicator('network', true);
    window.loadingStatus.network = true;

    // Hide the fallback message if it was shown
    const fallbackMsg = document.getElementById('network-fallback');
    if (fallbackMsg) {
        fallbackMsg.style.display = 'none';
    }

    // Show sync sub-item as we start synchronizing
    const syncSubItem = document.getElementById('status-sync-sub');
    if (syncSubItem && !window.skyStateInitialized) {
        syncSubItem.style.display = 'flex';
    }

    const urlParams = new URL(window.location.href).searchParams;
    const micEnabledParam = urlParams.get('mic') !== 'false';

    // --- Pre-Connect Stream Management ---
    if (typeof easyrtc !== 'undefined') {
        // If the user isn't in webcam mode, tell EasyRTC not to capture local video.
        // This prevents the camera prompt while still allowing the scene to receive video.
        if (presenceParam !== 'webcam') {
            console.log("NAF: Presence is 'avatar'. Disabling local video capture (to avoid prompt) but keeping scene video-capable.");
            easyrtc.enableVideo(false);
        } else {
            easyrtc.enableVideo(true);
        }
    }

    if (NAF && NAF.connection && NAF.connection.adapter) {
        // --- Microphone Logic ---
        if (typeof NAF.connection.adapter.enableMicrophone === 'function') {
            if (micEnabledParam) {
                // Join Muted (standard privacy default)
                NAF.connection.adapter.enableMicrophone(false);
                window.micEnabled = false;
                console.log("NAF: Join Muted - mic checkbox was checked, but starting muted.");
            } else {
                window.micEnabled = false;
                console.log("NAF: Microphone disabled (lobby choice).");
            }
        }

        // --- Camera / Webcam Logic ---
        if (presenceParam === 'webcam') {
            window.cameraEnabled = true;
            console.log("NAF: Webcam mode active.");

            // Explicitly tell NAF adapter to enable camera
            if (typeof NAF.connection.adapter.enableCamera === 'function') {
                console.log("NAF: Calling enableCamera(true)...");
                NAF.connection.adapter.enableCamera(true);
            }

            // --- Local Mirror Feedback ---
            // Since templates aren't usually applied to the local player rig/camera,
            // we attach a visual feedback plane manually.
            setTimeout(() => {
                const cameraEl = document.querySelector('#camera');
                if (cameraEl && typeof easyrtc !== 'undefined' && easyrtc.getLocalStream) {
                    const stream = easyrtc.getLocalStream();
                    if (stream && stream.getVideoTracks().length > 0) {
                        console.log("Found local video stream for mirror.");

                        let mirror = document.querySelector('#local-mirror');
                        if (!mirror) {
                            const rig = document.querySelector('#camera-rig');
                            if (rig) {
                                console.log("Creating circular local mirror below infobar...");
                                mirror = document.createElement('a-circle');
                                mirror.setAttribute('id', 'local-mirror');
                                mirror.setAttribute('radius', '0.15');
                                mirror.setAttribute('position', '0 0.5 -0.6');
                                mirror.setAttribute('rotation', '-40 0 0');
                                mirror.setAttribute('scale', '-1 1 1'); // Mirrored for self
                                mirror.setAttribute('material', 'shader: flat; side: double');
                                rig.appendChild(mirror);
                            }
                        }

                        const video = document.createElement('video');
                        video.setAttribute('autoplay', '');
                        video.setAttribute('muted', 'true'); // Explicit attribute
                        video.setAttribute('playsinline', '');
                        video.muted = true;  // Explicit property
                        video.volume = 0;    // Absolute silence
                        video.srcObject = stream;

                        // Play immediately
                        video.play().catch(e => console.warn("Mirror play error:", e));

                        const updateMirror = () => {
                            console.log("Applying local mirror texture...");
                            const texture = new THREE.VideoTexture(video);
                            const mesh = mirror.getObject3D('mesh');
                            if (mesh) {
                                mesh.material.map = texture;
                                mesh.material.needsUpdate = true;
                                // Mirror visibility follows cameraEnabled state
                                mirror.setAttribute('visible', window.cameraEnabled);
                            }
                        };

                        // Watch for camera toggle to hide/show mirror
                        window.addEventListener('camera-toggled', () => {
                            if (mirror) mirror.setAttribute('visible', window.cameraEnabled);
                        });

                        if (video.readyState >= 2) {
                            updateMirror();
                        } else {
                            video.onloadedmetadata = updateMirror;
                        }
                    } else {
                        console.warn("No local video tracks found for mirror.");
                    }
                }
            }, 3000); // 3s delay to ensure EasyRTC has fully initialized the local stream
        }
    }
};


// Dynamically align the visual pointer with the controller's rayOrigin
document.addEventListener('controllermodelready', (evt) => {
    const el = evt.target;
    const rayOrigin = evt.detail.rayOrigin;
    if (!rayOrigin) return;

    const pointerEl = el.querySelector('.pointer');
    if (pointerEl) {
        console.log(`Aligning pointer for ${el.id} using rayOrigin`, rayOrigin);

        // Update position
        pointerEl.setAttribute('position', rayOrigin.origin);

        // Calculate rotation for the bottom-origin-cylinder component
        // The cylinder points -Y. We need to find the Euler angles (X, Y) to match rayOrigin.direction
        const dir = rayOrigin.direction;
        const pitch = Math.acos(-dir.y) * (180 / Math.PI);
        const yaw = Math.atan2(-dir.x, -dir.z) * (180 / Math.PI);

        pointerEl.setAttribute('bottom-origin-cylinder', 'rotation', { x: pitch, y: yaw, z: 0 });
    }
});
