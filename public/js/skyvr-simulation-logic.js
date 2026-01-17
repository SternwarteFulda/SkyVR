/* global Astronomy, luxon, AFRAME, NAF, THREE, performance, window, document, console, location */

let latitudeDisplay = document.getElementById("latitude-display");
let longitudeDisplay = document.getElementById("longitude-display");
let dateTimeDisplay = document.getElementById("date-time-display");
let sceneEl = document.querySelector('a-scene');
let cameraRig = document.getElementById("camera-rig");
let azContainer = document.getElementById("az-container");
let eqContainer = document.getElementById("eq-container");
let precessionContainer = document.getElementById("precession-container");
let starsPointCloud = document.getElementById("stars-point-cloud");
let milkyway = document.getElementById("milkyway");

const initialLatitude = 50.5741312;
const initialLongitude = 9.6927744;
window.latitude = initialLatitude;
window.longitude = initialLongitude;
let elevation = 300;

function updateInitText() {
    if (!latitudeDisplay) latitudeDisplay = document.getElementById("latitude-display");
    if (latitudeDisplay) {
        latitudeDisplay.setAttribute("text", `value: Latitude: ${latitude.toFixed(1)}; color: white; width: 1; align: center`);
    }
}
updateInitText();

// Initialize a base date/time for the simulation.
window.simulationTime = luxon.DateTime.now(); // Current local date and time
window.simTimeMs = window.simulationTime.toMillis();
window.targetSimulationTime = window.simulationTime;
window.interpolationEnabled = true;

// Velocity-based interpolation state
window.targetTimeVelocity = 0; // seconds per second
window.currentTimeVelocity = 0;
window.lastJoystickTime = 0;

// Helper to keep both Luxon and numeric time in sync
window.updateSimulationTime = function (newTime, updateTarget = true, forceSnap = false) {
    if (!newTime) return;

    // "Shortest Path" Logic:
    // For large jumps (e.g. 1 year or 1 day), we want the logic to update instantly (so planets are correct),
    // but the VISUAL rotation (LST) should glide via the shortest arc, not spin 365 times.
    // We achieve this by manipulating simTimeMs to be "close" to the target in terms of rotation.

    const targetMs = newTime.toMillis();
    const diffMs = targetMs - window.simTimeMs;
    const absDiff = Math.abs(diffMs);

    // Thresholds: Sidereal Day ~86164s (~23h 56m)
    // If jump is > 86000s, we consider it "large".
    const isLargeJump = absDiff >= 86000000;

    if (updateTarget) {
        window.targetSimulationTime = newTime;

        if (isLargeJump && !forceSnap && window.interpolationEnabled) {
            // Hybrid Strategy for Optimal Visuals:
            // 1. Default to Sidereal Modulo (Preferred)
            //    This glides the stars to their new position via the shortest path.
            //    E.g. Month jump = ~30 deg glide.
            const siderealDayMs = 86164090.5;
            let cycleMs = siderealDayMs;
            let remainderMs = diffMs % cycleMs;

            // Normalize remainder to +/- cycle/2
            if (remainderMs > cycleMs / 2) remainderMs -= cycleMs;
            else if (remainderMs < -cycleMs / 2) remainderMs += cycleMs;

            // 2. Safety Check: Solar Drift
            //    We want to allow Month jumps to glide (interpolate stars),
            //    but prevent Day/Night inversion flashes (e.g. 6 month jump = 12h drift).
            //    1 Month jump = ~2h drift.
            //    Threshold: 6 hours. This allows smooth gliding for 1-3 month jumps.
            const maxSolarDrift = 6 * 3600 * 1000;

            if (Math.abs(remainderMs) > maxSolarDrift) {
                cycleMs = 86400000; // Switch to Solar Cycle for stability
                remainderMs = diffMs % cycleMs;
                // Re-normalize for Solar
                if (remainderMs > cycleMs / 2) remainderMs -= cycleMs;
                else if (remainderMs < -cycleMs / 2) remainderMs += cycleMs;
            }

            // Apply the calculated remainder
            window.simTimeMs = targetMs - remainderMs;
            window.simulationTime = luxon.DateTime.fromMillis(window.simTimeMs);

            // FORCE VISUAL UPDATES IMMEDIATELY
            // Bypass the 1s throttle for planets so they don't lag
            const starfield = document.getElementById('stars-point-cloud')?.components?.starfield;
            if (starfield) {
                starfield.updatePlanets(true); // Force interpolation (glide)
                starfield.updateMoon(true);
            }
            updateScene();

            return; // Let the interpolator handle the glide from here
        }
    } else {
        if (!window.targetSimulationTime) window.targetSimulationTime = newTime;
    }

    // Standard Snap Logic (Fallback or Force)
    if (!window.interpolationEnabled || !updateTarget || forceSnap) {
        window.simulationTime = newTime;
        window.simTimeMs = newTime.toMillis();
        if (window._astroCache) window._astroCache.sunRaDec = null;

        // FORCE VISUAL UPDATES IMMEDIATELY
        const starfield = document.getElementById('stars-point-cloud')?.components?.starfield;
        if (starfield) {
            starfield.updatePlanets();
            starfield.updateMoon();
        }
        updateScene(); // Ensure lighting/sky matches new time
    } else {
        // Small jump: just update the numeric MS to match
        window.simTimeMs = window.simulationTime.toMillis();
    }
};

console.log(simulationTime.zoneName);

let observer = new Astronomy.Observer(latitude, longitude, elevation);

// Cache for astronomical calculations
window._astroCache = {
    sunRaDec: null,
    lastAstroUpdate: 0
};

let isRightControllerGripDown = false;
window.micEnabled = false;

let lastSyncTime = 0;
function syncSky(silent = false, forceOwnership = false) {
    // Standardize 50ms (20Hz) sync rate for responsive UI and smooth motion.
    const throttleLimit = 50;
    const now = performance.now();

    // MASTER HEARTBEAT: Every 5 seconds, we bypass the throttle to ensure
    // the room reality is recasted for all clients (late joiners, packet loss).
    const isHeartbeatRecast = (now - lastSyncTime > 5000);

    if (!forceOwnership && !isHeartbeatRecast && (now - lastSyncTime < throttleLimit)) return;

    const skyMaster = document.getElementById('sky-master');
    if (skyMaster && NAF.connection && NAF.connection.adapter && NAF.connection.isConnected()) {
        // ROBUST SAFEGUARD:
        // Use the global helper to check if we are authorized to broadcast.
        if (!window.canUpdateSkyState(forceOwnership)) {
            if (!silent) console.warn("syncSky: Not authorized to update yet (waiting for room state).");
            return;
        }

        if (!NAF.utils.isMine(skyMaster)) {
            if (forceOwnership) {
                if (!silent) console.log("Taking ownership of sky-master to sync state autoritatively...");
                NAF.utils.takeOwnership(skyMaster);
                // Authoritative update should continue to set the attribute immediately
                // and also schedule follow-ups to ensure propagation.
                [200, 1000].forEach(delay => setTimeout(() => syncSky(true, true), delay));
            } else {
                return;
            }
        }

        const currentState = skyMaster.getAttribute('sky-state') || {};
        const sharedConst = currentState.activeConstellations || 'INIT';

        const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
        let constellationData = sharedConst;
        if (renderer) {
            const currentCount = renderer.placedIllustrations.length;
            if (currentCount !== window._lastConstellationCount || !window._cachedConstellationData) {
                window._cachedConstellationData = JSON.stringify(
                    renderer.placedIllustrations.map(e => {
                        const id = e.dataset.constellationId;
                        const type = e.dataset.type || 'illustration';
                        return type === 'illustration' ? id : { id: id, type: type };
                    }).filter(item => item && (typeof item === 'string' || item.id))
                );
                window._lastConstellationCount = currentCount;
            }
            constellationData = window._cachedConstellationData;
        }

        if (!silent || forceOwnership) {
            // Only log if it's been a while to avoid console flood during scrubbing
            if (now - lastSyncTime > 1000) {
                console.log("Broadcasting Sky State Update...");
            }
            lastSyncTime = now;
        }

        const updateData = {
            // CRITICAL: We broadcast the TARGET simulation time.
            // This allows the master to glide locally while remote clients also see
            // the destination and glide towards it themselves.
            time: window.targetSimulationTime.toISO(),
            latitude: window.latitude,
            longitude: window.longitude,
            showMeridian: document.getElementById('meridian')?.getAttribute('fader')?.active || false,
            showEquator: document.getElementById('equator')?.getAttribute('fader')?.active || false,
            showEcliptic: document.getElementById('ecliptic')?.getAttribute('fader')?.active || false,
            showCardinalPoints: document.getElementById('cardinal-points')?.getAttribute('fader')?.active || false,
            showCelestialPoles: document.getElementById('ncp')?.getAttribute('fader')?.active || false,
            showConstellationLines: renderer ? renderer.data.showLines : false,
            showBoundaries: renderer ? renderer.data.showBoundaries : false,
            activeConstellations: constellationData || 'INIT',
            velocity: window.currentTimeVelocity,
            heartbeat: performance.now()
        };

        skyMaster.setAttribute('sky-state', updateData);
    }
}

function setNow() {
    updateSimulationTime(luxon.DateTime.now()); // Reverted to default glide
    syncSky(false, true); // Authoritative Sync
    updateScene();
}

// Make sure we have a target time initialized
window.targetSimulationTime = window.simulationTime;

// Register a global tick handler for local interpolation
AFRAME.registerComponent('local-time-interpolator', {
    init: function () {
        this.lerpSpeed = 5.0;
    },
    tick: function (t, dt) {
        if (!window.interpolationEnabled) {
            window.currentTimeVelocity = 0;
            return;
        }

        const isSolo = new URLSearchParams(window.location.search).get('room') === 'none';
        const skyState = document.getElementById('sky-master');

        // ONLY the owner (or solo player) should run the master broadcast logic.
        // If a client wants to scrub, the interaction handler (joystick/UI) must take ownership.
        const isMine = isSolo || (skyState && NAF.utils.isMine(skyState));

        if (isMine) {
            const dtSec = dt / 1000;
            const now = performance.now();

            // 1. Safety: Reset target velocity if no joystick events for 300ms
            if (now - window.lastJoystickTime > 300) {
                window.targetTimeVelocity = 0;
            }

            // 2. Smoothly interpolate velocity for that "butter" glide (k=5.0)
            window.currentTimeVelocity += (window.targetTimeVelocity - window.currentTimeVelocity) * 5.0 * dtSec;

            // 3. Apply velocity shift using numeric timestamp
            if (Math.abs(window.currentTimeVelocity) > 0.05) {
                window.simTimeMs += window.currentTimeVelocity * 1000 * dtSec;
                window.simulationTime = luxon.DateTime.fromMillis(window.simTimeMs);

                // CRITICAL: While moving via velocity (scrubbing), target follows current
                // to prevent the Gap Correction (Part 4) from pulling us back.
                window.targetSimulationTime = window.simulationTime;

                updateScene();
                syncSky();
            } else if (window.targetTimeVelocity === 0 && window.currentTimeVelocity !== 0) {
                window.currentTimeVelocity = 0;
                syncSky(); // Broadcast final stop
            }

            // 4. Smoothly catch up to targetSimulationTime (Gap Correction for Master)
            const targetMs = window.targetSimulationTime.toMillis();
            const diffMs = targetMs - window.simTimeMs;
            const diffSec = diffMs / 1000;

            if (Math.abs(diffSec) > 0.05) {
                // Smooth approach (k=5.0) for soft start/stop
                const step = diffSec * 5.0 * dtSec;
                window.simTimeMs += step * 1000;
                window.simulationTime = luxon.DateTime.fromMillis(window.simTimeMs);
                updateScene();
                syncSky(true); // Throttled sync while gliding
            } else if (Math.abs(diffSec) > 0 && Math.abs(diffSec) <= 0.05) {
                // Snap for perfect finish
                window.simTimeMs = targetMs;
                window.simulationTime = window.targetSimulationTime;
                updateScene();
                syncSky(true);
            } else if (window.targetTimeVelocity === 0 && Math.abs(diffSec) === 0) {
                // Ensure we broadcast one last time when absolutely still
                syncSky(true);
            }
        }
    }
});
// Attach this component to the scene when it's ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        const scene = document.querySelector('a-scene');
        if (scene) scene.setAttribute('local-time-interpolator', '');
    });
} else {
    const scene = document.querySelector('a-scene');
    if (scene) {
        scene.setAttribute('local-time-interpolator', '');
    } else {
        // Scene not ready yet, wait for it
        setTimeout(() => {
            const sceneRetry = document.querySelector('a-scene');
            if (sceneRetry) sceneRetry.setAttribute('local-time-interpolator', '');
        }, 100);
    }
}


window.updateTimeFromInput = function (inputId, value) {
    const val = parseInt(value);
    if (isNaN(val)) return;

    let newTime = window.simulationTime;
    if (inputId.includes('year')) {
        newTime = newTime.set({ year: val });
    } else if (inputId.includes('month')) {
        newTime = newTime.set({ month: val });
    } else if (inputId.includes('day')) {
        newTime = newTime.set({ day: val });
    } else if (inputId.includes('hour')) {
        newTime = newTime.set({ hour: val });
    } else if (inputId.includes('minute')) {
        newTime = newTime.set({ minute: val });
    }

    updateSimulationTime(newTime); // Reverted to default glide
    syncSky(false, true); // Authoritative Sync
    updateScene();
};

window.updateLocationFromInput = function (inputId, value) {
    const val = parseFloat(value);
    if (isNaN(val)) return;

    if (inputId.includes('lat')) {
        // preserve sign if user didn't enter it? Numpad has '-', so user can enter text.
        // But if user just types '50' and it was '-50', we assume they want '50'.
        window.latitude = Math.max(-90, Math.min(90, val));
    } else if (inputId.includes('lon')) {
        // Wrap longitude? Or clamp? usually -180 to 180
        window.longitude = val;
        // Normalise to -180...180 if needed, but Astronomy engine might handle loose values
    }

    // Render updates
    updateScene();
    syncSky(false, true);
};

function adjustTime(unit, amount) {
    let newTime;
    if (unit === 'sidereal') {
        // 1 Sidereal Day = 86164.0905 seconds (360° star rotation)
        newTime = window.targetSimulationTime.plus({ seconds: 86164.0905 * amount });
    } else if (unit === 'days' || unit === 'day') {
        // 1 Solar Day = 24 absolute hours.
        newTime = window.targetSimulationTime.plus({ hours: 24 * amount });
    } else if (unit === 'months' || unit === 'month' || unit === 'years' || unit === 'year') {
        // DST FIX: Add months/years in UTC to preserve Absolute Time (Solar Time) consistency.
        const base = window.targetSimulationTime;
        newTime = base.toUTC().plus({ [unit]: amount }).setZone(base.zoneName);
    } else {
        newTime = window.targetSimulationTime.plus({ [unit]: amount });
    }
    updateSimulationTime(newTime); // Reverted to default glide
    updateScene();
    syncSky(false, true); // AUTHORITATIVE SYNC
}

function adjustCoordinate(type, amount) {
    if (type === 'latitude') {
        window.latitude = Math.max(-90, Math.min(90, window.latitude + amount));
    } else if (type === 'longitude') {
        window.longitude = window.longitude + amount;
        // Wrap longitude between -180 and 180
        if (window.longitude > 180) window.longitude -= 360;
        if (window.longitude < -180) window.longitude += 360;
    }
    syncSky(false, true); // AUTHORITATIVE SYNC
    updateScene();
}

let lastUIUpdateTime = 0;
let lastLightUpdateTime = 0;

// Pre-calculate constants for performance
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const PRECESSION_RATE = 360 / 25750; // degrees per year
const DISTANCE_SUN = 400;

// Cache for expensive calculations
let cachedLongitudeDeg15 = longitude / 15;

// Function to update the scene
function updateScene() {
    if (!sceneEl) sceneEl = document.querySelector('a-scene');
    if (!cameraRig) cameraRig = document.getElementById("camera-rig");
    if (!azContainer) azContainer = document.getElementById("az-container");
    if (!eqContainer) eqContainer = document.getElementById("eq-container");
    if (!precessionContainer) precessionContainer = document.getElementById("precession-container");
    if (!starsPointCloud) starsPointCloud = document.getElementById("stars-point-cloud");
    if (!milkyway) milkyway = document.getElementById("milkyway");
    if (!latitudeDisplay) latitudeDisplay = document.getElementById("latitude-display");
    if (!longitudeDisplay) longitudeDisplay = document.getElementById("longitude-display");
    if (!dateTimeDisplay) dateTimeDisplay = document.getElementById("date-time-display");

    const jsDate = simulationTime.toJSDate();
    const astroTime = Astronomy.MakeTime(jsDate);

    // Optimized LST calculation using cached value
    const GAST = Astronomy.SiderealTime(astroTime);
    const LAST = GAST + cachedLongitudeDeg15;
    const lstDegrees = -(LAST % 24) * 15;

    // Update scene elements - direct Object3D manipulation
    if (eqContainer) {
        const rot = eqContainer.object3D.rotation;
        rot.x = (latitude - 180) * DEG_TO_RAD;
        rot.y = 0;
        rot.z = (lstDegrees - 90) * DEG_TO_RAD;
    }

    // Optimized precession calculation
    if (precessionContainer) {
        const rot = precessionContainer.object3D.rotation;
        rot.x = 23.43619 * DEG_TO_RAD;
        rot.y = 0;
        rot.z = (simulationTime.year - 2000) * PRECESSION_RATE * DEG_TO_RAD;
    }

    const now = performance.now();

    // Use persistent variables for Sun caching
    if (!window._skyCache) window._skyCache = { sunAltAz: { altitude: -10, azimuth: 0 }, lastSunUpdateTime: 0 };

    // Ensure observer exists and is up to date
    if (typeof observer === 'undefined' || observer.latitude !== latitude || observer.longitude !== longitude) {
        observer = new Astronomy.Observer(latitude, longitude, elevation);
        cachedLongitudeDeg15 = longitude / 15; // Update cache when longitude changes
    }

    // Sun RA/Dec solving: Removed 1Hz throttle to eliminate "jump-back" artifacts
    // during time interpolation or jumps. RA/Dec for a single body is high-performance.
    window._astroCache.sunRaDec = Astronomy.Equator('Sun', astroTime, observer, false, false);
    window._astroCache.lastAstroUpdate = now;

    // Horizontal conversion is lighter than full solving
    const sunAltAz = Astronomy.Horizon(astroTime, observer, window._astroCache.sunRaDec.ra, window._astroCache.sunRaDec.dec, false);

    const altRad = sunAltAz.altitude * DEG_TO_RAD;
    const azRad = sunAltAz.azimuth * DEG_TO_RAD;
    const cosAlt = Math.cos(altRad);

    const x = -DISTANCE_SUN * cosAlt * Math.sin(azRad);
    const y = DISTANCE_SUN * Math.sin(altRad);
    const z = DISTANCE_SUN * cosAlt * Math.cos(azRad);

    if (sceneEl && sceneEl.components.environment) {
        const env = sceneEl.components.environment;
        if (env.lighting) {
            env.lighting.position.set(x, y, z);
            // We might need to refresh the light if the component expects setAttribute
            // But usually direct Three.js manipulation works for lights.
        } else {
            // Fallback if lighting is not yet initialized
            sceneEl.setAttribute('environment', 'lightPosition', `${x} ${y} ${z}`);
        }
    }

    const skyBrightness = mapSunAltitudeToSkyBrightness(sunAltAz.altitude, 0.0);
    window.skyBrightness = skyBrightness; // Expose for bino-optimizer
    if (typeof starShaderMaterial !== 'undefined' && starShaderMaterial.uniforms.skyBrightness) {
        starShaderMaterial.uniforms.skyBrightness.value = skyBrightness;
    }
    if (typeof haloShaderMaterial !== 'undefined' && haloShaderMaterial.uniforms.skyBrightness) {
        haloShaderMaterial.uniforms.skyBrightness.value = skyBrightness;
    }

    if (sceneEl && sceneEl.components.environment) {
        // exposureBias must be set on the sky entity material directly
        const binoSky = document.querySelector('a-sky.environment');
        if (binoSky) {
            binoSky.setAttribute('material', 'exposureBias', skyBrightness);
        }
    }

    if (milkyway) {
        const mwOpacity = mapRange(skyBrightness, 0.0, 0.2, 0.25, 0.0);
        milkyway.setAttribute('material', 'opacity', mwOpacity);
    }

    window._skyCache.lastSunUpdateTime = now;

    // Throttle UI text updates to ~10Hz
    if (now - lastUIUpdateTime > 100) {

        // --- VR Control Panel Updates ---
        const pad = (n) => String(n).padStart(2, '0');
        const updateVRInput = (id, val) => {
            const el = document.getElementById(id);
            if (el) {
                const textEl = el.querySelector('a-text');
                if (textEl) {
                    textEl.setAttribute('value', val);
                } else {
                    // Fallback in case we missed one or structure differs
                    el.setAttribute('text', 'value', val);
                }
            }
        };

        if (simulationTime) {
            updateVRInput('input-vr-year', simulationTime.year);
            updateVRInput('input-vr-month', pad(simulationTime.month));
            updateVRInput('input-vr-day', pad(simulationTime.day));
            updateVRInput('input-vr-hour', pad(simulationTime.hour));
            updateVRInput('input-vr-minute', pad(simulationTime.minute));
        }

        updateVRInput('input-vr-lat', Math.abs(window.latitude).toFixed(1));
        updateVRInput('input-vr-lon', Math.abs(window.longitude).toFixed(1));

        const nsBtn = document.getElementById('toggle-2d-ns-vr');
        if (nsBtn) nsBtn.setAttribute('text', 'value', window.latitude >= 0 ? 'N' : 'S');

        const ewBtn = document.getElementById('toggle-2d-ew-vr');
        if (ewBtn) ewBtn.setAttribute('text', 'value', window.longitude >= 0 ? 'E' : 'W');
        // --------------------------------

        if (dateTimeDisplay) {
            if (latitudeDisplay) {
                latitudeDisplay.setAttribute("text", `value: ${Math.abs(window.latitude).toFixed(1)}°; color: white; width: 0.7; align: center`);
            }
            if (longitudeDisplay) {
                longitudeDisplay.setAttribute("text", `value: ${Math.abs(window.longitude).toFixed(1)}°; color: white; width: 0.7; align: center`);
            }
            if (dateTimeDisplay) {
                dateTimeDisplay.setAttribute("text", `value: ${simulationTime.toLocaleString(luxon.DateTime.DATETIME_SHORT)}; color: white; width: 0.7; align: center`);
            }
        }
        lastUIUpdateTime = now;

        if (starsPointCloud && starsPointCloud.components && starsPointCloud.components.starfield) {
            starsPointCloud.components.starfield.update();
        }
    }
}


// Debounce function to limit the frequency of updates
function debounce(func, delay) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

// Wrap updateScene with debounce (adjust delay as necessary)
const debouncedUpdateScene = debounce(updateScene, 100);  // 100ms delay


function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

// Throttle updateScene to run every 30ms
const throttledUpdateScene = throttle(updateScene, 30);



// Utility function to map the Sun's altitude to a sky brightness value
function mapSunAltitudeToSkyBrightness(altitude, lightPollution) {
    // Example mapping, adjust thresholds and brightness levels as needed
    if (altitude > -4.0) {
        // Daytime
        return 1.0; // Maximum brightness
    } else if (altitude > -16.5 && altitude <= -4.0) {
        // Twilight
        return Math.max(lightPollution, 1.3 * (altitude + 16.5) / 16.5); // Gradual decrease
    } else {
        // Nighttime
        return 0.0 + lightPollution; // Minimum brightness for stars visibility
    }
}


function mapRange(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

document.addEventListener('DOMContentLoaded', function () {
    // Initialize asset tracker
    if (window.assetTracker) {
        window.assetTracker.init();
    }

    const scene = document.querySelector('a-scene');
    if (scene) {
        if (scene.hasLoaded) {
            updateLoadingIndicator('assets', true);
            updateScene();
        } else {
            scene.addEventListener('loaded', function () {
                updateLoadingIndicator('assets', true);
                updateScene();
            });
        }
    }
});



// Function to setup all VR controller listeners once the scene is ready
function setupVRControllers() {
    const leftController = document.getElementById("left-controller");
    const rightController = document.getElementById("right-controller");

    if (!leftController || !rightController) {
        // Retry if controllers aren't in the DOM yet
        setTimeout(setupVRControllers, 100);
        return;
    }

    // --- Left Controller Setup ---
    const timeAdjustmentSpeed = 60; // seconds
    const latitudeAdjustmentSpeed = 0.05; // degrees
    const starRotationSpeed = 0.001;
    const joystickThreshold = 0.95;

    let leftTriggerValue = 0;
    leftController.addEventListener('triggerchanged', function (evt) {
        leftTriggerValue = evt.detail.value;
    });

    leftController.addEventListener("thumbstickmoved", AFRAME.utils.throttle(function (event) {
        let needsSync = false;
        // Check for max joystick deflection (approx > 0.9) to enable turbo
        const isMaxDeflection = Math.abs(event.detail.x) > 0.9;

        if (Math.abs(event.detail.x) > 0.05) {
            let speedMultiplier = 1;
            if (isMaxDeflection) {
                speedMultiplier = 1 + (leftTriggerValue * 4);
            }

            // Drive VELOCITY directly
            const requestedVelocity = Math.pow(event.detail.x, 3.0) * timeAdjustmentSpeed * speedMultiplier * 50;
            window.lastJoystickTime = performance.now();

            if (window.interpolationEnabled) {
                window.targetTimeVelocity = requestedVelocity;
            } else {
                updateSimulationTime(luxon.DateTime.fromMillis(window.simTimeMs));
                updateScene();
            }

            needsSync = true;
        } else {
            window.targetTimeVelocity = 0;
            window.lastJoystickTime = performance.now();
            needsSync = true;
        }
        if (Math.abs(event.detail.y) >= joystickThreshold) {
            let latitudeAdjustment = -event.detail.y * latitudeAdjustmentSpeed;
            updateLatitude(window.latitude + latitudeAdjustment);
            needsSync = true; // stop smoothly
        }

        if (needsSync) {
            // We still sync network state (which broadcasts targetTime basically)
            syncSky(false, true); // Force ownership if moving joystick
            // updateScene is handled by tick loop
        }
    }, 20));



    function updateLatitude(newLatitude) {
        // Ensure newLatitude is within -90 and 90 degrees
        if (newLatitude > 90) {
            window.latitude = 90;
        } else if (newLatitude < -90) {
            window.latitude = -90;
        } else {
            window.latitude = newLatitude;
        }
    }

    // Toggle visibility of control panel with X button
    const togglePanel = () => {
        const panel = document.querySelector('a-control-panel');
        if (panel) {
            const isEnabled = panel.getAttribute("enabled") === "true";
            panel.setAttribute("enabled", !isEnabled);
            if (leftController.components['haptics']) leftController.components['haptics'].pulse(0.3, 60);
        }
    };

    const handleBinocularsToggle = () => {
        const binocModel = document.getElementById('binoculars-model');
        if (binocModel && binocModel.components['binoculars-handler']) {
            binocModel.components['binoculars-handler'].toggle();
        }
    };


    leftController.addEventListener("xbuttondown", handleBinocularsToggle);

    leftController.addEventListener("buttonchanged", function (event) {
        const id = event.detail.id;
        const state = event.detail.state;

        // X Button (Index 4) toggle fallback
        if (id === 4 && state.pressed) {
            // Handled by xbuttondown, but keeping for robustness
        }

        // Menu Button (Index 2 or unmapped)
        if (state.pressed && ![0, 1, 3, 4, 5].includes(id)) {
            if (!this.lastMenuToggle || performance.now() - this.lastMenuToggle > 500) {
                this.lastMenuToggle = performance.now();
                togglePanel();
            }
        }
    });

    // Named event fallback for menu button

    leftController.addEventListener("noneup", togglePanel);

    leftController.addEventListener("gripdown", function (event) {
        if (sceneEl.is('vr-mode') && NAF.connection && NAF.connection.adapter) {
            NAF.connection.adapter.enableMicrophone(true);
            window.micEnabled = true;
        }
    });

    leftController.addEventListener("gripup", function (event) {
        if (sceneEl.is('vr-mode') && NAF.connection && NAF.connection.adapter) {
            NAF.connection.adapter.enableMicrophone(false);
            window.micEnabled = false;
        }
    });

    const onYButtonDown = () => {
        yButtonIsPhysicallyDown = true;
        yButtonDownTimestamp = performance.now();
        yHoldActionTriggered = false;
        if (yHoldIntervalId) clearInterval(yHoldIntervalId);
        yHoldIntervalId = setInterval(checkYHoldWithInterval, 16);
    };

    const onYButtonUp = () => {
        const wasPhysicallyDown = yButtonIsPhysicallyDown;
        yButtonIsPhysicallyDown = false;
        if (yHoldIntervalId) {
            clearInterval(yHoldIntervalId);
            yHoldIntervalId = null;
        }

        if (wasPhysicallyDown && !yHoldActionTriggered) {
            // Short press: Cycle Mode via infobar
            const infobar = document.querySelector('[skyvr-infobar]');
            if (infobar && infobar.components['skyvr-infobar']) {
                infobar.components['skyvr-infobar'].cycleMode();
            }
        }
    };


    leftController.addEventListener('ybuttondown', onYButtonDown);
    leftController.addEventListener('ybuttonup', onYButtonUp);

    // Tab Switching Logic for VR Control Panel
    window.switchTab = function (tabName) {
        const tabs = ['time', 'location', 'view'];
        tabs.forEach(t => {
            const el = document.getElementById('tab-' + t);
            const btn = document.getElementById('tab-btn-' + t);
            if (el) el.setAttribute('visible', t === tabName);
            if (btn) btn.setAttribute('color', t === tabName ? '#8a2be2' : '#2a2a3a');
        });
    };

    window.onTogglerClick = function (action) { // 'action' is the clickActionParam
        const meridianEl = document.getElementById('meridian');
        const equatorEl = document.getElementById('equator');
        const eclipticEl = document.getElementById('ecliptic');
        const cardinalPointsEl = document.getElementById('cardinal-points');
        const ncpEl = document.getElementById('ncp');
        const ncpGlowEl = document.getElementById('ncp_glow');
        const scpEl = document.getElementById('scp');
        const scpGlowEl = document.getElementById('scp_glow');

        if (!meridianEl) {
            console.error("Meridian element ('meridian') not found.");
        }
        if (!equatorEl) {
            console.error("Equator element ('equator') not found.");
        }
        if (!eclipticEl) {
            console.error("Ecliptic element ('ecliptic') not found.");
        }
        if (!cardinalPointsEl) {
            console.error("Cardinal points element ('cardinal-points') not found.");
        }
        if (!ncpEl) {
            console.error("NCP element ('ncp') not found.");
        }
        if (!ncpGlowEl) {
            console.error("NCP glow element ('ncp_glow') not found.");
        }
        if (!scpEl) {
            console.error("SCP element ('scp') not found.");
        }
        if (!scpGlowEl) {
            console.error("SCP glow element ('scp_glow') not found.");
        }

        let newActive;
        const ensureFader = (el, active) => {
            if (!el) return;
            if (!el.hasAttribute('fader')) {
                el.setAttribute('fader', { active: active });
            } else {
                el.setAttribute('fader', 'active', active);
            }
        };

        switch (action) {
            case 'toggleMeridian':
                if (meridianEl) {
                    newActive = !(meridianEl.getAttribute('fader')?.active ?? meridianEl.getAttribute('visible'));
                    ensureFader(meridianEl, newActive);
                    console.log('Meridian visibility toggled to:', newActive);
                }
                break;
            case 'toggleEquator':
                if (equatorEl) {
                    newActive = !(equatorEl.getAttribute('fader')?.active ?? equatorEl.getAttribute('visible'));
                    ensureFader(equatorEl, newActive);
                    console.log('Equator visibility toggled to:', newActive);
                }
                break;
            case 'toggleEcliptic':
                if (eclipticEl) {
                    newActive = !(eclipticEl.getAttribute('fader')?.active ?? eclipticEl.getAttribute('visible'));
                    ensureFader(eclipticEl, newActive);
                    console.log('Ecliptic visibility toggled to:', newActive);
                }
                break;
            case 'toggleHints':
                const hints = document.querySelectorAll('.controller-hint');
                hints.forEach(hint => {
                    newActive = !(hint.getAttribute('fader')?.active ?? hint.getAttribute('visible'));
                    ensureFader(hint, newActive);
                });
                console.log('Controller hints visibility toggled');
                break;
            case 'toggleCardinalPoints':
                if (cardinalPointsEl) {
                    newActive = !(cardinalPointsEl.getAttribute('fader')?.active ?? cardinalPointsEl.getAttribute('visible'));
                    ensureFader(cardinalPointsEl, newActive);
                    console.log('Cardinal points visibility toggled to:', newActive);
                }
                break;
            case 'toggleNCP':
                if (ncpEl && ncpGlowEl && scpEl && scpGlowEl) {
                    newActive = !(ncpEl.getAttribute('fader')?.active ?? ncpEl.getAttribute('visible'));
                    ensureFader(ncpEl, newActive);
                    ensureFader(ncpGlowEl, newActive);
                    ensureFader(scpEl, newActive);
                    ensureFader(scpGlowEl, newActive);
                    console.log('Celestial Poles visibility toggled to:', newActive);
                }
                break;
            case 'toggleConstellationLines':
                const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (renderer) {
                    const current = renderer.data.showLines;
                    renderer.el.setAttribute('constellation-renderer', { showLines: !current });
                    console.log('Constellation lines toggled to:', !current);
                }
                break;
            case 'toggleBoundaries':
                const rendererB = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (rendererB) {
                    const current = rendererB.data.showBoundaries;
                    rendererB.el.setAttribute('constellation-renderer', { showBoundaries: !current });
                    console.log('IAU Boundaries toggled to:', !current);
                }
                break;
            case 'toggleNS':
                window.latitude = -window.latitude;
                if (typeof updateScene === 'function') updateScene();
                if (typeof syncSky === 'function') syncSky(false, true);
                console.log('Latitude toggled to:', window.latitude);
                break;
            case 'toggleEW':
                window.longitude = -window.longitude;
                if (typeof updateScene === 'function') updateScene();
                if (typeof syncSky === 'function') syncSky(false, true);
                console.log('Longitude toggled to:', window.longitude);
                break;
            default:
                console.warn('Unknown or unhandled toggle action:', action);
        }
        syncSky(false, true); // Authoritative sync for toggles
    }

    // Rotation of the Az-Container around the y-Axis
    const azimuthRotationStep = 30;
    let isJoystickReleased = true;

    let isArrowLocked = false;
    let lastArrowAngle = 0;

    // rightController is already fetched at the start of setupVRControllers()

    // Button state variables
    let aButtonDownTimestamp = 0;
    let aButtonIsPhysicallyDown = false;
    let bButtonDownTimestamp = 0;
    let bButtonIsPhysicallyDown = false;
    let yButtonDownTimestamp = 0;
    let yButtonIsPhysicallyDown = false;
    const HOLD_DURATION_THRESHOLD = 1000; // 1 second for hold
    let aHoldActionTriggered = false;
    let bHoldActionTriggered = false;
    let yHoldActionTriggered = false;
    let aHoldIntervalId = null;
    let bHoldIntervalId = null;
    let yHoldIntervalId = null;

    rightController.addEventListener("gripdown", function (event) {
        const pointer = document.getElementById("pointer");
        pointer.setAttribute('visible', true);
        isRightControllerGripDown = true;

        // Locked Mode: Show Arrow immediately, hide Beam
        // Normal Mode: Show Beam immediately, hide Arrow, only show arrow when stick moved
        const cylinder = pointer.components['bottom-origin-cylinder'];
        const arrow = pointer.querySelector('.pointer-arrow');

        if (isArrowLocked) {
            if (cylinder && cylinder.cylinderMesh) cylinder.cylinderMesh.visible = false;
            if (arrow) {
                arrow.setAttribute('visible', true);
                if (arrow.object3D) arrow.object3D.visible = true;
                // Restore last rotation
                arrow.setAttribute('rotation', { x: 90, y: lastArrowAngle - 90, z: 0 });

                // Apply material/layer fix immediately
                const child = arrow.querySelector('a-entity');
                const mesh = child ? child.getObject3D('mesh') : null;
                if (mesh) {
                    mesh.renderOrder = 20000;
                    if (mesh.material) {
                        mesh.material.depthTest = false;
                        mesh.material.depthWrite = false;
                        const camera = document.getElementById('camera');
                        const playerInfo = camera ? camera.components['player-info'] : null;
                        if (playerInfo && playerInfo.data.color) {
                            mesh.material.color.set(playerInfo.data.color);
                        }
                    }
                }
            }
        } else {
            if (cylinder && cylinder.cylinderMesh) cylinder.cylinderMesh.visible = true;
            if (arrow) {
                arrow.setAttribute('visible', false);
                if (arrow.object3D) arrow.object3D.visible = false;
            }
        }
    });
    rightController.addEventListener("gripup", function (event) {
        const pointer = document.getElementById("pointer");
        pointer.setAttribute('visible', false);
        isRightControllerGripDown = false;

        // Reset beam visibility for next use
        const cylinder = pointer.components['bottom-origin-cylinder'];
        if (cylinder && cylinder.cylinder) {
            cylinder.cylinder.visible = true;
        }
    });

    const onAButtonDown = () => {
        aButtonIsPhysicallyDown = true;
        aButtonDownTimestamp = performance.now();
        aHoldActionTriggered = false;

        if (aHoldIntervalId) clearInterval(aHoldIntervalId);
        aHoldIntervalId = setInterval(checkAHoldWithInterval, 16);
    };

    const onBButtonDown = () => {
        bButtonIsPhysicallyDown = true;
        bButtonDownTimestamp = performance.now();
        bHoldActionTriggered = false;

        const currentMode = window.currentMode || 'draw';
        if (currentMode === 'draw') {
            console.log('B button down: Starting drawing');
            rightController.components.drawing.startDrawing();
        }

        if (bHoldIntervalId) clearInterval(bHoldIntervalId);
        bHoldIntervalId = setInterval(checkBHoldWithInterval, 16);
    };

    const onAButtonUp = () => {
        const wasPhysicallyDown = aButtonIsPhysicallyDown;
        aButtonIsPhysicallyDown = false;
        if (aHoldIntervalId) {
            clearInterval(aHoldIntervalId);
            aHoldIntervalId = null;
        }

        if (wasPhysicallyDown && !aHoldActionTriggered) {
            console.log('A button: Short press (tap) detected');
            const currentMode = window.currentMode || 'draw';
            if (currentMode === 'draw') {
                if (rightController.components.drawing) rightController.components.drawing.clearLastSegment();
            } else if (currentMode === 'constellation' || currentMode === 'stickfigure') {
                // A button = Remove only (eraser)
                const renderer = document.getElementById('constellation-lines').components['constellation-renderer'];
                const pointer = rightController.components['constellation-pointer'];

                if (renderer && pointer && pointer.currentConstellation) {
                    const id = pointer.currentConstellation.id;
                    const targetType = currentMode === 'stickfigure' ? 'stick' : 'illustration';

                    if (renderer.isItemActive(id, targetType)) {
                        renderer.removeItemById(id, targetType);
                        // Unified haptic fallback
                        if (rightController.components['haptics']) rightController.components['haptics'].pulse(0.4, 50);
                        const gamepad = rightController.components['tracked-controls']?.controller;
                        if (gamepad?.hapticActuators?.length > 0) gamepad.hapticActuators[0].pulse(0.4, 50);

                        if (typeof syncSky === 'function') syncSky();
                    }
                }
            } else if (currentMode === 'identify') {
                if (rightController.components['identify']) {
                    rightController.components['identify'].removeLastInfo();
                }
            } else if (currentMode === 'stamp') {
                if (rightController.components['stamp']) {
                    rightController.components['stamp'].removeLastShape();
                }
            }
        }
    };

    const onBButtonUp = () => {
        const wasPhysicallyDown = bButtonIsPhysicallyDown;
        bButtonIsPhysicallyDown = false;
        if (bHoldIntervalId) {
            clearInterval(bHoldIntervalId);
            bHoldIntervalId = null;
        }

        const currentMode = window.currentMode || 'draw';
        console.log('B button up (releasing). Mode:', currentMode);

        if (!bHoldActionTriggered) {
            if (currentMode === 'draw') {
                rightController.components.drawing.stopDrawing();
            } else if (currentMode === 'constellation' || currentMode === 'stickfigure') {
                // B button = Place/Stamp
                console.log('B button up: Placing', currentMode === 'stickfigure' ? 'stick figure' : 'constellation illustration');
                const constellationLines = document.getElementById('constellation-lines');
                if (constellationLines && constellationLines.components['constellation-renderer']) {
                    const renderer = constellationLines.components['constellation-renderer'];
                    const targetType = currentMode === 'stickfigure' ? 'stick' : 'illustration';
                    renderer.placeItem(targetType);
                    // Unified haptic fallback
                    if (rightController.components['haptics']) rightController.components['haptics'].pulse(0.5, 100);
                    const gamepad = rightController.components['tracked-controls']?.controller;
                    if (gamepad?.hapticActuators?.length > 0) gamepad.hapticActuators[0].pulse(0.5, 100);

                    if (typeof syncSky === 'function') syncSky();
                }
            } else if (currentMode === 'identify') {
                if (rightController.components['identify']) {
                    if (this.el && this.el.sceneEl && this.el.sceneEl.is('vr-mode')) {
                        rightController.components['identify'].stampInfo();
                    } else {
                        if (document.querySelector('a-scene').is('vr-mode')) {
                            rightController.components['identify'].stampInfo();
                        }
                    }
                }
            } else if (currentMode === 'stamp') {
                if (rightController.components['stamp']) {
                    console.log("Stamp: B Button Up detected, calling stampShape directly");
                    rightController.components['stamp'].stampShape();
                } else {
                    console.error("Stamp: Component 'stamp' not found on rightController");
                }
            }
        } else {
            // If hold was triggered, we still might need to clean up drawing if we were in draw mode
            if (currentMode === 'draw') rightController.components.drawing.stopDrawing();
        }
    };

    rightController.addEventListener('abuttondown', onAButtonDown);
    rightController.addEventListener('abuttonup', onAButtonUp);
    rightController.addEventListener('bbuttondown', onBButtonDown);
    rightController.addEventListener('bbuttonup', onBButtonUp);

    let pointerMode = 'beam'; // 'beam' or 'arrow'

    // Persistent handlers to allowing valid removal
    const onBeamHidden = () => {
        // Beam finished hiding. 
        // Check if we should hide the parent pointer?
        // Only if Arrow is ALSO effectively hidden/inactive.
        const pointer = document.getElementById("pointer");
        if (!pointer) return;
        const arrow = pointer.querySelector('.pointer-arrow');

        // Check if arrow is visible (scale > 0.01)
        const arrowVisible = arrow && arrow.object3D && arrow.object3D.visible && arrow.object3D.scale.x > 0.01;

        if (!arrowVisible) {
            // Safe to hide parent
            pointer.setAttribute('visible', false);
        }
    };

    const onArrowHidden = () => {
        const pointer = document.getElementById("pointer");
        if (!pointer) return;

        // Check if Beam is visible (opacity > 0.01)
        const cylinderComp = pointer.components['bottom-origin-cylinder'];
        let beamVisible = false;
        if (cylinderComp && cylinderComp.cylinderMesh && cylinderComp.cylinderMesh.visible) {
            if (cylinderComp.cylinderMesh.material.opacity > 0.01) beamVisible = true;
        }

        if (!beamVisible) {
            pointer.setAttribute('visible', false);
            const arrow = pointer.querySelector('.pointer-arrow');
            if (arrow) arrow.setAttribute('visible', false);
        } else {
            // Even if beam is visible, the arrow itself should be hidden now
            const arrow = pointer.querySelector('.pointer-arrow');
            if (arrow) arrow.setAttribute('visible', false);
        }
    };

    function updateVisuals() {
        const pointer = document.getElementById("pointer");
        if (!pointer) return;
        const arrow = pointer.querySelector('.pointer-arrow');
        const cylinder = pointer.components['bottom-origin-cylinder'];
        // Helper to get current opacity safely
        const currentBeamOpacity = (cylinder && cylinder.cylinderMesh && cylinder.cylinderMesh.material) ? cylinder.cylinderMesh.material.opacity : 0;

        // 0. CLEANUP Handlers
        // Important: We must remove them to prevent them from firing if we suddenly decided to show something again.
        pointer.removeEventListener('animationcomplete__beam', onBeamHidden);
        if (arrow) arrow.removeEventListener('animationcomplete__scale', onArrowHidden);

        const showBeam = isRightControllerGripDown && pointerMode === 'beam';
        const showArrow = isRightControllerGripDown && pointerMode === 'arrow';

        // Use a flag to track if we expect animations to run that require hiding the parent later
        let waitingForBeamHide = false;
        let waitingForArrowHide = false;

        // Ensure parent is visible immediately if we are showing or about to show something
        if ((showBeam || showArrow) && !pointer.getAttribute('visible')) {
            pointer.setAttribute('visible', true);
        }

        // 1. BEAM ANIMATION
        // Check if beam is currently visible (before applying new animation)
        const beamWasVisible = currentBeamOpacity > 0.01;

        pointer.removeAttribute('animation__beam');
        pointer.setAttribute('animation__beam', {
            property: 'bottom-origin-cylinder.opacity',
            to: showBeam ? 0.6 : 0.0,
            dur: 100,
            easing: 'linear'
        });

        // Only listen for hide compliance if we are transitioning From Visible -> Hidden
        if (!showBeam && beamWasVisible) {
            pointer.addEventListener('animationcomplete__beam', onBeamHidden);
            waitingForBeamHide = true;
        }

        // 2. ARROW ANIMATION
        if (arrow) {
            // Check if arrow is currently visible (before applying new animation)
            const arrowWasVisible = arrow.object3D && arrow.object3D.visible && arrow.object3D.scale.x > 0.01;
            if (showArrow && !arrow.getAttribute('visible')) arrow.setAttribute('visible', true);

            arrow.removeAttribute('animation__scale');
            arrow.setAttribute('animation__scale', {
                property: 'scale',
                to: showArrow ? '1 1 1' : '0 0 0',
                dur: 150,
                easing: showArrow ? 'easeOutBack' : 'easeInBack'
            });

            // Only listen for hide compliance if transitioning From Visible -> Hidden
            if (!showArrow && arrowWasVisible) {
                arrow.addEventListener('animationcomplete__scale', onArrowHidden);
                waitingForArrowHide = true;
            }

            if (showArrow) {
                // Apply Rotation
                arrow.setAttribute('rotation', { x: 90, y: lastArrowAngle - 90, z: 0 });

                // Apply Color
                const child = arrow.querySelector('.arrow-mesh');
                const mesh = child ? child.getObject3D('mesh') : null;
                if (mesh && mesh.material) {
                    mesh.material.depthTest = true;
                    mesh.material.depthWrite = false;
                    const camera = document.getElementById('camera');
                    const playerInfo = camera ? camera.components['player-info'] : null;
                    if (playerInfo && playerInfo.data.color) {
                        mesh.material.color.set(playerInfo.data.color);
                        child.setAttribute('material', 'color', playerInfo.data.color);
                    }
                }
            }
        }

        // Fallback: If we want to hide everything, but no animations are "waiting" (e.g. they were already hidden),
        // we must hide parent immediately or we'll be stuck visible.
        if (!showBeam && !showArrow && !waitingForBeamHide && !waitingForArrowHide) {
            pointer.setAttribute('visible', false);
        }
    }
    rightController.addEventListener("thumbstickdown", function () {
        // Toggle Mode
        pointerMode = (pointerMode === 'beam') ? 'arrow' : 'beam';

        // Feedback
        if (rightController.components.haptics) rightController.components.haptics.pulse(0.5, 100);

        // Update immediately
        updateVisuals();
    });

    rightController.addEventListener("gripdown", function (event) {
        isRightControllerGripDown = true;
        updateVisuals();
    });

    rightController.addEventListener("gripup", function (event) {
        isRightControllerGripDown = false;
        updateVisuals();
    });

    rightController.addEventListener("thumbstickmoved", function (event) {
        const stickX = event.detail.x;
        const stickY = event.detail.y;
        const stickActive = Math.abs(stickX) > 0.2 || Math.abs(stickY) > 0.2;

        // Standard Locomotion (Rotate Rig)
        // ONLY if Grip is RELEASED. (U"Lock" when beam/pointer is shown)
        if (!isRightControllerGripDown) {
            if (stickActive) {
                if (event.detail.x > 0.8 && isJoystickReleased) {
                    rotateCameraRig(-azimuthRotationStep);
                    isJoystickReleased = false;
                } else if (event.detail.x < -0.8 && isJoystickReleased) {
                    rotateCameraRig(azimuthRotationStep);
                    isJoystickReleased = false;
                } else if (event.detail.x >= -0.8 && event.detail.x <= 0.8) {
                    isJoystickReleased = true;
                }
            } else {
                isJoystickReleased = true;
            }
        } else {
            // Grip IS Down (Tool Active)
            if (pointerMode === 'arrow') {
                // Arrow Mode: Stick rotates Arrow
                if (stickActive) {
                    const angleDeg = Math.atan2(-stickY, stickX) * (180 / Math.PI) + 180;
                    lastArrowAngle = angleDeg;
                    const pointer = document.getElementById("pointer");
                    const arrow = pointer ? pointer.querySelector('.pointer-arrow') : null;
                    if (arrow) arrow.setAttribute('rotation', { x: 90, y: angleDeg - 90, z: 0 });
                }
            }
            // If Beam Mode: Stick does nothing (Snap turn is locked)
        }
    });

    function checkAHoldWithInterval() {
        if (!aButtonIsPhysicallyDown || aHoldActionTriggered) {
            if (aHoldIntervalId) {
                clearInterval(aHoldIntervalId);
                aHoldIntervalId = null;
            }
            return;
        }

        const currentHoldDuration = performance.now() - aButtonDownTimestamp;

        if (currentHoldDuration >= HOLD_DURATION_THRESHOLD) {
            const currentMode = window.currentMode || 'draw';

            if (currentMode === 'draw') {
                const comp = rightController.components.drawing;
                if (comp) {
                    comp.clearDrawing();
                }
            } else if (currentMode === 'constellation' || currentMode === 'stickfigure') {
                console.log('VR A-button hold: Clearing all in mode', currentMode);
                const constellationLines = document.getElementById('constellation-lines');
                if (constellationLines && constellationLines.components['constellation-renderer']) {
                    const renderer = constellationLines.components['constellation-renderer'];
                    renderer.clearAllIllustrations();
                    // Haptic feedback for clear all
                    if (rightController.components['haptics']) {
                        rightController.components['haptics'].pulse(0.8, 300);
                    }
                    const gamepad = rightController.components['tracked-controls']?.controller;
                    if (gamepad?.hapticActuators?.length > 0) gamepad.hapticActuators[0].pulse(0.8, 300);
                }
            } else if (currentMode === 'identify') {
                console.log('VR A-button hold: Clearing all identifications');
                if (rightController.components['identify']) {
                    rightController.components['identify'].removeAllInfos();
                }
            } else if (currentMode === 'stamp') {
                console.log('VR A-button hold: Clearing all stamps');
                if (rightController.components['stamp']) {
                    rightController.components['stamp'].removeAllShapes();
                }
            }

            aHoldActionTriggered = true;

            if (aHoldIntervalId) {
                clearInterval(aHoldIntervalId);
                aHoldIntervalId = null;
            }
        }
    }

    function checkBHoldWithInterval() {
        if (!bButtonIsPhysicallyDown || bHoldActionTriggered) {
            if (bHoldIntervalId) {
                clearInterval(bHoldIntervalId);
                bHoldIntervalId = null;
            }
            return;
        }

        const currentHoldDuration = performance.now() - bButtonDownTimestamp;

        if (currentHoldDuration >= HOLD_DURATION_THRESHOLD) {
            const currentMode = window.currentMode || 'draw';

            if (currentMode === 'constellation' || currentMode === 'stickfigure') {
                const constellationLines = document.getElementById('constellation-lines');
                if (constellationLines && constellationLines.components['constellation-renderer']) {
                    const renderer = constellationLines.components['constellation-renderer'];
                    // Fill in the gaps
                    renderer.showAllIllustrations();
                    // Haptics on show-all
                    if (rightController.components['haptics']) {
                        rightController.components['haptics'].pulse(0.6, 250);
                    }
                }
            }

            bHoldActionTriggered = true;

            if (bHoldIntervalId) {
                clearInterval(bHoldIntervalId);
                bHoldIntervalId = null;
            }
        }
    }

    function checkYHoldWithInterval() {
        if (!yButtonIsPhysicallyDown || yHoldActionTriggered) {
            if (yHoldIntervalId) {
                clearInterval(yHoldIntervalId);
                yHoldIntervalId = null;
            }
            return;
        }
        const currentHoldDuration = performance.now() - yButtonDownTimestamp;
        if (currentHoldDuration >= HOLD_DURATION_THRESHOLD) {
            window.clearEverything();
            yHoldActionTriggered = true;
            if (yHoldIntervalId) {
                clearInterval(yHoldIntervalId);
                yHoldIntervalId = null;
            }
        }
    }

    window.clearEverything = function () {
        console.log("Global Clear All: Removing everything creation-related");
        const rightController = document.getElementById('right-controller');
        const leftController = document.getElementById('left-controller');

        // 1. Drawing
        if (rightController && rightController.components.drawing) {
            rightController.components.drawing.clearDrawing();
        }

        // 2. Identify
        if (rightController && rightController.components['identify']) {
            rightController.components['identify'].removeAllInfos();
        }

        // 3. Stamp
        if (rightController && rightController.components['stamp']) {
            rightController.components['stamp'].removeAllShapes();
        }

        // 4. Constellations & Stick Figures
        const constellationLines = document.getElementById('constellation-lines');
        if (constellationLines && constellationLines.components['constellation-renderer']) {
            const renderer = constellationLines.components['constellation-renderer'];
            renderer.clearAllIllustrations();
        }

        // 5. Deactivate mode
        window.currentMode = 'none';

        // Synchronize state across network
        if (typeof syncSky === 'function') syncSky();

        // Haptic feedback
        if (rightController && rightController.components['haptics']) rightController.components['haptics'].pulse(1.0, 500);
        if (leftController && leftController.components['haptics']) leftController.components['haptics'].pulse(1.0, 500);
    };

    function rotateCameraRig(rotationStep) {
        const rig = document.getElementById('camera-rig');
        const camera = document.getElementById('camera');

        // 1. Get current World Positions
        const camWorldPos = new THREE.Vector3();
        const rigWorldPos = new THREE.Vector3();
        camera.object3D.getWorldPosition(camWorldPos);
        rig.object3D.getWorldPosition(rigWorldPos);

        // 2. Calculate the rotation in Radians
        const currentRotY = THREE.MathUtils.degToRad(rig.getAttribute('rotation').y);
        const addRotY = THREE.MathUtils.degToRad(rotationStep);
        const newRotY = currentRotY + addRotY;

        // 3. THE "ANTI-SWING" MATH
        // We need to move the Rig so that after rotation, 
        // the camera stays at the EXACT same World Position.

        // Vector from Rig center to Camera (horizontal only)
        const pivotOffset = new THREE.Vector3().subVectors(camWorldPos, rigWorldPos);
        pivotOffset.y = 0;

        // Rotate that offset by the turn amount
        const rotatedOffset = pivotOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), addRotY);

        // The Rig's new position is: CameraWorldPos - RotatedOffset
        const newRigPos = new THREE.Vector3().subVectors(camWorldPos, rotatedOffset);

        // 4. APPLY TO RIG (Atomic Update)
        // We use your rounding logic for the visual rotation
        const finalDegY = Math.round(THREE.MathUtils.radToDeg(newRotY) / azimuthRotationStep) * azimuthRotationStep;

        rig.setAttribute('position', { x: newRigPos.x, y: 0, z: newRigPos.z });
        rig.setAttribute('rotation', { x: 0, y: finalDegY, z: 0 });

        // 5. CRITICAL: Tell the follower script to update its 'last known pos'
        // using the NEW rig position as the baseline
        const follower = rig.components['rig-follower'];
        if (follower) {
            // We update the baseline to the current camera world pos
            // so the next 'tick' sees 0 movement.
            follower.lastCamWorldPos.copy(camWorldPos);
        }
    }

    // Function to calculate Local Sidereal Time (LST)
    function calculateLocalSiderealTime(time, longitude) {
        // Calculate Greenwich Apparent Sidereal Time (GMST) in hours
        let GAST = Astronomy.SiderealTime(time);

        // Local Apparent Sidereal Time (LAST) in hours
        let LAST = GAST + (longitude / 15);
        LAST = LAST % 24;
        return -LAST;
    }
} // end setupVRControllers

setupVRControllers();


// Debug mode handling
(function initDebugMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === 'true';

    // Wait for the scene to be ready
    const scene = document.querySelector('a-scene');
    if (scene && scene.hasLoaded) {
        setupDebugMode();
    } else if (scene) {
        scene.addEventListener('loaded', setupDebugMode);
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            const sceneEl = document.querySelector('a-scene');
            if (sceneEl) {
                sceneEl.addEventListener('loaded', setupDebugMode);
            }
        });
    }

    function setupDebugMode() {
        if (debugMode) {
            // Show debug elements
            const resetButton = document.getElementById('reset-button');
            const coordRightController = document.getElementById('debug-coord-right-controller');
            const coordWorldCenter = document.getElementById('debug-coord-world-center');

            if (resetButton) {
                // Use 'enabled' attribute for a-rounded component
                resetButton.setAttribute('enabled', true);

                // Add event listeners for the reset button
                resetButton.addEventListener("mouseenter", function () {
                    resetButton.setAttribute("scale", "1.2 1.2 1");
                });
                resetButton.addEventListener("mouseleave", function () {
                    resetButton.setAttribute("scale", "1 1 1");
                });
            }

            if (coordRightController) coordRightController.setAttribute('visible', true);
            if (coordWorldCenter) coordWorldCenter.setAttribute('visible', true);

            console.log('Debug mode enabled: reset button and coordinate systems are visible');
        } else {
            // Explicitly ensure debug elements are hidden
            const resetButton = document.getElementById('reset-button');
            const coordRightController = document.getElementById('debug-coord-right-controller');
            const coordWorldCenter = document.getElementById('debug-coord-world-center');

            if (resetButton) resetButton.setAttribute('enabled', false);
            if (coordRightController) coordRightController.setAttribute('visible', false);
            if (coordWorldCenter) coordWorldCenter.setAttribute('visible', false);
        }
    }
})();

// Function to reload the page
function resetScene() {
    location.reload();
}
