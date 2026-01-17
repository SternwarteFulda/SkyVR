/* global AFRAME, THREE, NAF, luxon, syncSky, updateSimulationTime, updateScene, syncIdentifiedLabels, syncStampedShapes, window */

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
            // RESURRECTION: If shared state is null (INIT) but we have a valid local state, 
            // it means the state was wiped (likely by a new master). We must fix it.
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

            const driftThreshold = (Math.abs(this.data.velocity) > 10) ? 60 : 1; // 1s threshold for steady state, 60s for high-speed scrubbing
            if ((timeDrift > driftThreshold || latDrift > 0.01) && !this.targetTime) {
                console.log("sky-state: Watchdog detected drift from master (and no interpolation active). Pulling state...");
                // Instead of just update(), let's explicitly copy the data to our locals
                if (typeof updateSimulationTime === 'function') updateSimulationTime(sharedTime);
                if (typeof updateScene === 'function') updateScene();

                const incomingIsInit = (this.data.activeConstellations === 'INIT');
                if (!incomingIsInit) {
                    window.skyStateInitialized = true;
                    if (typeof updateLoadingIndicator === 'function') {
                        updateLoadingIndicator('sync', true);
                        updateLoadingIndicator('spawn', false, true); // Show "Selecting seat and spawning..."
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
                if (typeof updateScene === 'function') updateScene();
            }
            return;
        }

        if (!NAF.utils.isMine(this.el) && this.targetTime && window.simulationTime) {
            const dtSec = dt / 1000;
            const currentTimeSecs = window.simulationTime.toMillis() / 1000;
            const targetTimeSecs = this.targetTime.toMillis() / 1000;
            const diffSeconds = targetTimeSecs - currentTimeSecs;

            // 1. Snappy matching: Receive the owner's already-smoothed velocity (k=10.0)
            // Reduced from 30.0 to dampen network jitter during high-speed scrubbing.
            this.timeVelocity += (this.data.velocity - this.timeVelocity) * 10.0 * dtSec;

            // Threshold 86000s (approx 23.88h) covers within-day moves, but snaps on Sidereal (86164s) & Solar (86400s) days.
            const snapThreshold = 86000;
            // RESILIENCY FIX: If we are drastically behind but the master IS moving (scrubbing),
            // DO NOT snap-freeze. Just increase the catch-up gain (kCorrection) below.
            const isOwnerMovingFast = Math.abs(this.data.velocity) > 10;

            if (Math.abs(diffSeconds) > snapThreshold && !isOwnerMovingFast) {
                if (typeof updateSimulationTime === 'function') updateSimulationTime(this.targetTime, false, true); // Use forceSnap for watchdog snap
                this.targetTime = null;
                this.timeVelocity = 0;
                if (typeof updateScene === 'function') updateScene();
                return;
            }

            // 1. Snappy matching: Filter the incoming master velocity
            this.timeVelocity += (this.data.velocity - this.timeVelocity) * 10.0 * dtSec;

            // 2. Integration + Gap correction
            // Follow at a moderate speed (k=3.0). It's better to be slightly behind than overshot.
            let effectiveVel = this.timeVelocity + (diffSeconds * 3.0);

            // 3. Anti-Overshoot / Anti-Creep:
            // If the master has stopped, prevent any reverse movement to correct minor overshoots.
            if (this.data.velocity === 0 && Math.abs(diffSeconds) < 0.5) {
                // If we are ahead (diffSeconds < 0) and were moving forward (timeVelocity > 0),
                // or ahead (diffSeconds > 0) and were moving backward (timeVelocity < 0)...
                if ((diffSeconds < 0 && this.timeVelocity > -0.1) || (diffSeconds > 0 && this.timeVelocity < 0.1)) {
                    effectiveVel = 0;
                }
            }

            if (Math.abs(effectiveVel) > 0.001 || Math.abs(diffSeconds) > 0.001) {
                const step = effectiveVel * dtSec;
                if (typeof updateSimulationTime === 'function') updateSimulationTime(luxon.DateTime.fromMillis((currentTimeSecs + step) * 1000), false);
                if (typeof updateScene === 'function') updateScene();
            } else {
                // Settle silently (no snaps)
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

        // PROTECTION: If we are already initialized and we receive an "INIT" state from someone else,
        // it's almost certainly a "joining-wipe" packet from a newcomer. We MUST ignore it.
        const isRemote = !NAF.utils.isMine(this.el);
        const incomingIsInit = (this.data.activeConstellations === 'INIT');

        if (isRemote && incomingIsInit && window.skyStateInitialized) {
            console.warn("sky-state: Ignoring 'INIT' state from remote. Likely a newcomer-wipe attempt.");
            return;
        }

        const isInitialSync = !window.skyStateInitialized;

        if (isRemote && !incomingIsInit && this.data.heartbeat > 0) {
            if (isInitialSync) {
                console.log("sky-state: First heartbeat received. Syncing reality...");
                // Force immediate snap on join to avoid seeing local "Now" time
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
                updateLoadingIndicator('spawn', false, true); // Show "Selecting seat and spawning..."
            }
        }

        if (isRemote) {
            if (this.data.time && this.data.time !== oldData.time) {
                if (!incomingIsInit) {
                    const rawTargetTime = luxon.DateTime.fromISO(this.data.time);

                    // Remove Look-Ahead: Accept slight lag to ensure no overshoot.
                    this.targetTime = rawTargetTime;
                    this.lastReceivedTimestamp = performance.now();

                    // If this is the FIRST update or a major jump (> 23h), snap instantly.
                    // Threshold (86000000ms) allows almost full-day glides (23.8h), 
                    // but snaps for Sidereal Day (86164090ms) and Solar Day (86400000ms).
                    if (isInitialSync || !window.simulationTime || Math.abs(this.targetTime.toMillis() - window.simulationTime.toMillis()) >= 86000000) {
                        if (typeof updateSimulationTime === 'function') updateSimulationTime(this.targetTime, true, true);
                        this.targetTime = null;
                        this.timeVelocity = 0;
                        if (typeof updateScene === 'function') updateScene(); // Ensure visual update for snap
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
            if (isRemote) console.log(`Sky State: activeConstellations changed from "${oldData.activeConstellations}" to "${this.data.activeConstellations}"`);
            if (this.data.activeConstellations === 'INIT' || this.data.activeConstellations === 'undefined') {
                return;
            }
            const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
            if (renderer) {
                try {
                    const activeItems = JSON.parse(this.data.activeConstellations);
                    console.log('Sky State: Triggering renderer sync with', activeItems.length, 'items');
                    console.log('Sky State: First 3 items:', activeItems.slice(0, 3));
                    renderer.syncConstellations(activeItems);
                } catch (e) {
                    console.error('Sky State: Error parsing activeConstellations:', e, this.data.activeConstellations);
                }
            } else {
                console.warn('Sky State: constellation-renderer not found for sync. Will rely on renderer pulling state on load.');
            }
        }

        // Sync Identified Labels (The new robust list-based approach)
        if (this.data.identifiedLabels !== oldData.identifiedLabels) {
            if (this.data.identifiedLabels && this.data.identifiedLabels !== 'INIT') {
                try {
                    const labels = JSON.parse(this.data.identifiedLabels);
                    if (typeof syncIdentifiedLabels === 'function') {
                        syncIdentifiedLabels(labels);
                    }
                } catch (e) {
                    console.error('Sky State: Error parsing identifiedLabels:', e);
                }
            }
        }

        // Sync Stamped Shapes
        if (this.data.stampedShapes !== oldData.stampedShapes) {
            if (this.data.stampedShapes && this.data.stampedShapes !== 'INIT') {
                try {
                    const shapes = JSON.parse(this.data.stampedShapes);
                    if (typeof syncStampedShapes === 'function') {
                        syncStampedShapes(shapes);
                    }
                } catch (e) {
                    console.error('Sky State: Error parsing stampedShapes:', e);
                }
            }
        }

        const guides = {
            'meridian': { val: this.data.showMeridian, old: oldData.showMeridian },
            'equator': { val: this.data.showEquator, old: oldData.showEquator },
            'ecliptic': { val: this.data.showEcliptic, old: oldData.showEcliptic },
            'cardinal-points': { val: this.data.showCardinalPoints, old: oldData.showCardinalPoints },
            'ncp': { val: this.data.showCelestialPoles, old: oldData.showCelestialPoles },
            'ncp_glow': { val: this.data.showCelestialPoles, old: oldData.showCelestialPoles },
            'scp': { val: this.data.showCelestialPoles, old: oldData.showCelestialPoles },
            'scp_glow': { val: this.data.showCelestialPoles, old: oldData.showCelestialPoles }
        };

        for (let id in guides) {
            if (guides[id].val !== guides[id].old || !window.skyStateInitialized) {
                let el = document.getElementById(id);
                if (el) {
                    if (!el.hasAttribute('fader')) {
                        el.setAttribute('fader', { active: guides[id].val });
                    } else {
                        el.setAttribute('fader', 'active', guides[id].val);
                    }
                }
            }
        }

        // Apply constellation renderer toggles
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

        // Apply switch toggles for VR UI
        const switches = {
            'switch-meridian': { val: this.data.showMeridian, old: oldData.showMeridian },
            'switch-equator': { val: this.data.showEquator, old: oldData.showEquator },
            'switch-ecliptic': { val: this.data.showEcliptic, old: oldData.showEcliptic },
            'switch-cardinal-points': { val: this.data.showCardinalPoints, old: oldData.showCardinalPoints },
            'switch-ncp': { val: this.data.showCelestialPoles, old: oldData.showCelestialPoles },
            'switch-boundaries': { val: this.data.showBoundaries, old: oldData.showBoundaries },
            'switch-hints': { val: this.data.showHints, old: oldData.showHints }
        };

        for (let id in switches) {
            if (switches[id].val !== switches[id].old || !window.skyStateInitialized) {
                let el = document.getElementById(id);
                if (el && el.components.switch) {
                    el.setAttribute('switch', 'toggled', switches[id].val);
                }
            }
        }

        // Update VR Coordinate toggles
        if (this.data.latitude !== oldData.latitude || !window.skyStateInitialized) {
            const nsToggleVr = document.getElementById('toggle-2d-ns-vr');
            if (nsToggleVr) {
                nsToggleVr.setAttribute('text', 'value', window.latitude >= 0 ? 'N' : 'S');
            }
        }
        if (this.data.longitude !== oldData.longitude || !window.skyStateInitialized) {
            const ewToggleVr = document.getElementById('toggle-2d-ew-vr');
            if (ewToggleVr) {
                ewToggleVr.setAttribute('text', 'value', window.longitude >= 0 ? 'E' : 'W');
            }
        }

        // Only trigger updateScene if critical physical state changed
        const physChanged = this.data.time !== oldData.time ||
            this.data.latitude !== oldData.latitude ||
            this.data.longitude !== oldData.longitude;

        if (physChanged && typeof updateScene === 'function') {
            const isMine = (typeof NAF !== 'undefined' && NAF.utils.isMine(this.el));
            // If we aren't interpolating (e.g. jump), or if we are the owner, update now.
            if (!window.interpolationEnabled || isMine) {
                updateScene();
            }
        }
    }
});
