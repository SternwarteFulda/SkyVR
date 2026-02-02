/* global AFRAME, THREE, NAF, luxon, syncSky, updateSimulationTime, updateScene, syncIdentifiedLabels, syncStampedShapes, window, performance, updateLoadingIndicator */

AFRAME.registerComponent('sky-state', {
    schema: {
        time: { type: 'string', default: '' },
        latitude: { type: 'number', default: 50.5741312 },
        longitude: { type: 'number', default: 9.6927744 },
        showMeridian: { type: 'boolean', default: false },
        showEquator: { type: 'boolean', default: false },
        showEcliptic: { type: 'boolean', default: false },
        showCardinalPoints: { type: 'boolean', default: true },
        showCelestialPoles: { type: 'boolean', default: false },
        showConstellationLines: { type: 'boolean', default: false },
        showBoundaries: { type: 'boolean', default: false },
        activeConstellations: { type: 'string', default: 'INIT' },
        identifiedLabels: { type: 'string', default: '[]' },
        stampedShapes: { type: 'string', default: '[]' },
        velocity: { type: 'number', default: 0 },
        heartbeat: { type: 'number', default: 0 }
    },
    init: function () {
        // Watchdog interval (same logic as constellations)
        this.checkInterval = setInterval(() => this.checkSharedState(), 2000);
        console.log("sky-state: Watchdog started (2s interval).");

        this.targetTime = null;
        this.targetLatitude = null;
        this.targetLongitude = null;
        this.lerpSpeed = 5.0; // Moderate speed (catch up in ~200ms)

        // Velocity tracking for predictive interpolation
        this.lastReceivedTime = null;
        this.lastReceivedTimestamp = 0;
        this.timeVelocity = 0; // seconds per second

        // Cache for guide and switch elements
        this.cache = {
            guides: {},
            switches: {},
            constellationRenderer: null,
            nsToggleVr: null,
            ewToggleVr: null
        };
    },
    remove: function () {
        if (this.checkInterval) clearInterval(this.checkInterval);
    },
    checkSharedState: function () {
        if (typeof NAF === 'undefined' || !NAF.connection.isConnected()) return;

        // Proactively check if we can graduate to Master (handles solitary master case)
        if (typeof window.canUpdateSkyState === 'function') {
            window.canUpdateSkyState();
        }

        const isOwner = NAF.utils.isMine(this.el);
        if (isOwner) {
            // Master PUSH logic: Periodically refresh the broadcast to catch up any joining players
            if (window.skyStateInitialized) {
                if (typeof syncSky === 'function') syncSky(true);
            }
        } else {
            // Client PULL logic: If we see data in the component that we haven't applied yet, pull it.
            if (this.data.activeConstellations === 'INIT') {
                if (window.skyStateInitialized) {
                    console.warn("sky-state: Shared state is INIT but local is NOT. Taking ownership to restore room.");
                    NAF.utils.takeOwnership(this.el);
                    if (typeof syncSky === 'function') syncSky();
                }
                return;
            }

            const sharedTime = luxon.DateTime.fromISO(this.data.time);
            const timeDrift = Math.abs(window.simulationTime.diff(sharedTime, 'seconds').seconds);
            const latDrift = Math.abs(window.latitude - this.data.latitude);

            const driftThreshold = (Math.abs(this.data.velocity) > 10) ? 60 : 1;
            if ((timeDrift > driftThreshold || latDrift > 0.01) && !this.targetTime) {
                console.log("sky-state: Watchdog detected drift from master (and no interpolation active). Pulling state...");
                if (typeof updateSimulationTime === 'function') updateSimulationTime(sharedTime);
                if (typeof updateScene === 'function') updateScene();

                if (this.data.activeConstellations !== 'INIT') {
                    window.skyStateInitialized = true;
                    if (typeof updateLoadingIndicator === 'function') {
                        updateLoadingIndicator('sync', true);
                        if (!window.localPlayerSpawned) {
                            updateLoadingIndicator('spawn', false, true);
                        }
                    }
                }
            }
        }
    },
    tick: function (t, dt) {
        if (!window.interpolationEnabled) {
            if (!NAF.utils.isMine(this.el) && this.targetTime) {
                if (typeof updateSimulationTime === 'function') updateSimulationTime(this.targetTime);
                this.targetTime = null;
                if (typeof throttledUpdateScene === 'function') throttledUpdateScene();
            }
            return;
        }

        if (!NAF.utils.isMine(this.el) && this.targetTime && window.simulationTime) {
            const dtSec = dt / 1000;
            const currentTimeSecs = window.simTimeMs / 1000;
            const targetTimeSecs = this.targetTime.toMillis() / 1000;
            const diffSeconds = targetTimeSecs - currentTimeSecs;

            // 1. Snappy matching
            this.timeVelocity += (this.data.velocity - this.timeVelocity) * 10.0 * dtSec;

            const snapThreshold = 86000;
            const isOwnerMovingFast = Math.abs(this.data.velocity) > 10;

            if (Math.abs(diffSeconds) > snapThreshold && !isOwnerMovingFast) {
                if (typeof updateSimulationTime === 'function') updateSimulationTime(this.targetTime, false, true);
                this.targetTime = null;
                this.timeVelocity = 0;
                if (typeof throttledUpdateScene === 'function') throttledUpdateScene();
                return;
            }

            // 2. Integration + Gap correction
            let effectiveVel = this.timeVelocity + (diffSeconds * 3.0);

            // 3. Anti-Overshoot
            if (this.data.velocity === 0 && Math.abs(diffSeconds) < 0.5) {
                if ((diffSeconds < 0 && this.timeVelocity > -0.1) || (diffSeconds > 0 && this.timeVelocity < 0.1)) {
                    effectiveVel = 0;
                }
            }

            if (Math.abs(effectiveVel) > 0.001 || Math.abs(diffSeconds) > 0.001) {
                const step = effectiveVel * dtSec;
                if (typeof updateSimulationTime === 'function') updateSimulationTime(luxon.DateTime.fromMillis((currentTimeSecs + step) * 1000), false);
                if (typeof throttledUpdateScene === 'function') throttledUpdateScene();
            } else {
                if (this.data.velocity === 0 && Math.abs(diffSeconds) < 0.1) {
                    this.timeVelocity = 0;
                }
            }

            if (window.targetSimulationTime && !isOwnerMovingFast) {
                window.targetSimulationTime = window.simulationTime;
            }
        }
    },
    update: function (oldData) {
        if (typeof luxon === 'undefined') return;

        const isRemote = !NAF.utils.isMine(this.el);
        const incomingIsInit = (this.data.activeConstellations === 'INIT');

        if (isRemote && incomingIsInit && window.skyStateInitialized) {
            console.warn("sky-state: Ignoring 'INIT' state from remote.");
            return;
        }

        const isInitialSync = !window.skyStateInitialized;

        if (isRemote && !incomingIsInit && this.data.heartbeat > 0) {
            if (isInitialSync) {
                if (this.data.time) {
                    if (typeof updateSimulationTime === 'function') updateSimulationTime(luxon.DateTime.fromISO(this.data.time), true, true);
                }
                if (this.data.latitude !== undefined) window.latitude = this.data.latitude;
                if (this.data.longitude !== undefined) window.longitude = this.data.longitude;
                if (typeof updateScene === 'function') updateScene();
            }
            window.skyStateInitialized = true;
            if (typeof updateLoadingIndicator === 'function') {
                updateLoadingIndicator('sync', true);
                if (!window.localPlayerSpawned) {
                    updateLoadingIndicator('spawn', false, true);
                }
            }
        }

        if (isRemote) {
            if (this.data.time && this.data.time !== oldData.time) {
                if (!incomingIsInit) {
                    const rawTargetTime = luxon.DateTime.fromISO(this.data.time);
                    this.targetTime = rawTargetTime;
                    this.lastReceivedTimestamp = performance.now();

                    if (isInitialSync || !window.simulationTime || Math.abs(this.targetTime.toMillis() - window.simTimeMs) >= 86000000) {
                        if (typeof updateSimulationTime === 'function') updateSimulationTime(this.targetTime, true, true);
                        this.targetTime = null;
                        this.timeVelocity = 0;
                        if (typeof updateScene === 'function') updateScene();
                    }
                }
            }

            let needsRender = false;
            if (this.data.latitude !== undefined && this.data.latitude !== oldData.latitude) {
                if (!incomingIsInit) {
                    window.latitude = this.data.latitude;
                    needsRender = true;
                }
            }
            if (this.data.longitude !== undefined && this.data.longitude !== oldData.longitude) {
                if (!incomingIsInit) {
                    window.longitude = this.data.longitude;
                    needsRender = true;
                }
            }
            if (needsRender && typeof updateScene === 'function') updateScene();
        }

        if (this.data.activeConstellations !== oldData.activeConstellations) {
            if (this.data.activeConstellations !== 'INIT' && this.data.activeConstellations !== 'undefined') {
                if (!this.cache.constellationRenderer) this.cache.constellationRenderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (this.cache.constellationRenderer) {
                    try {
                        const activeItems = JSON.parse(this.data.activeConstellations);
                        this.cache.constellationRenderer.syncConstellations(activeItems);
                    } catch (e) {
                        console.error('Sky State: Error parsing activeConstellations:', e);
                    }
                }
            }
        }

        // Labels and Shapes
        if (this.data.identifiedLabels !== oldData.identifiedLabels && this.data.identifiedLabels !== 'INIT') {
            try { syncIdentifiedLabels(JSON.parse(this.data.identifiedLabels)); } catch (e) { }
        }
        if (this.data.stampedShapes !== oldData.stampedShapes && this.data.stampedShapes !== 'INIT') {
            try { syncStampedShapes(JSON.parse(this.data.stampedShapes)); } catch (e) { }
        }

        const guideIds = ['meridian', 'equator', 'ecliptic', 'cardinal-points', 'ncp', 'ncp_glow', 'scp', 'scp_glow'];
        const guideKeys = ['showMeridian', 'showEquator', 'showEcliptic', 'showCardinalPoints', 'showCelestialPoles', 'showCelestialPoles', 'showCelestialPoles', 'showCelestialPoles'];

        for (let i = 0; i < guideIds.length; i++) {
            const id = guideIds[i];
            const key = guideKeys[i];
            if (this.data[key] !== oldData[key] || !window.skyStateInitialized) {
                if (!this.cache.guides[id]) this.cache.guides[id] = document.getElementById(id);
                const el = this.cache.guides[id];
                if (el) {
                    if (!el.hasAttribute('fader')) el.setAttribute('fader', { active: this.data[key] });
                    else el.setAttribute('fader', 'active', this.data[key]);
                }
            }
        }

        if (this.data.showConstellationLines !== oldData.showConstellationLines ||
            this.data.showBoundaries !== oldData.showBoundaries ||
            !window.skyStateInitialized) {
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl) {
                rendererEl.setAttribute('constellation-renderer', {
                    showLines: this.data.showConstellationLines,
                    showBoundaries: this.data.showBoundaries
                });
            }
        }

        const switchIds = ['switch-meridian', 'switch-equator', 'switch-ecliptic', 'switch-cardinal-points', 'switch-ncp', 'switch-boundaries', 'switch-hints'];
        const switchKeys = ['showMeridian', 'showEquator', 'showEcliptic', 'showCardinalPoints', 'showCelestialPoles', 'showBoundaries', 'showHints'];

        for (let i = 0; i < switchIds.length; i++) {
            const id = switchIds[i];
            const key = switchKeys[i];
            if (this.data[key] !== oldData[key] || !window.skyStateInitialized) {
                if (!this.cache.switches[id]) this.cache.switches[id] = document.getElementById(id);
                const el = this.cache.switches[id];
                if (el && el.components.switch) el.setAttribute('switch', 'toggled', this.data[key]);
            }
        }

        if (this.data.latitude !== oldData.latitude || !window.skyStateInitialized) {
            if (!this.cache.nsToggleVr) this.cache.nsToggleVr = document.getElementById('toggle-2d-ns-vr');
            if (this.cache.nsToggleVr) this.cache.nsToggleVr.setAttribute('text', 'value', window.latitude >= 0 ? 'N' : 'S');
        }
        if (this.data.longitude !== oldData.longitude || !window.skyStateInitialized) {
            if (!this.cache.ewToggleVr) this.cache.ewToggleVr = document.getElementById('toggle-2d-ew-vr');
            if (this.cache.ewToggleVr) this.cache.ewToggleVr.setAttribute('text', 'value', window.longitude >= 0 ? 'E' : 'W');
        }

        const physChanged = this.data.time !== oldData.time || this.data.latitude !== oldData.latitude || this.data.longitude !== oldData.longitude;
        if (physChanged && typeof updateScene === 'function') {
            const isMine = (typeof NAF !== 'undefined' && NAF.utils.isMine(this.el));
            if (!window.interpolationEnabled || isMine) updateScene();
        }
    }
});
