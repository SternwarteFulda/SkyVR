/* global AFRAME, THREE */

AFRAME.registerComponent('binoculars-handler', {
    schema: {
        minFov: { type: 'number', default: 8 },
        maxFov: { type: 'number', default: 80 },
        stabilized: { type: 'boolean', default: false }
    },
    init: function () {
        this.camera = document.getElementById('camera');
        this.holding = false;
        this.zoomed = false;
        this.isLocked = false; // Flag for hard-snapping once arrived at eyes

        // Store original local transforms to return to when released
        this.originalPos = new THREE.Vector3(0.12, 0, -0.05);
        this.originalRot = new THREE.Euler(
            THREE.MathUtils.degToRad(-120),
            0,
            THREE.MathUtils.degToRad(0)
        );

        this.tempVec = new THREE.Vector3();
        this.tempQuat = new THREE.Quaternion();
        this.smoothedQuat = null; // Will be initialized on first use
        this.secondaryCam = document.getElementById('bino-secondary-cam');

        // Simply activate bino by default in 2D for debugging
        /*
          if (!AFRAME.utils.device.checkHeadsetConnected()) {
          this.holding = true;
          this.zoomed = true;
          this.isLocked = true;
          this.el.setAttribute('visible', true);
        }
        */
    },
    tick: function (t, dt) {
        if (!this.holding || !dt) return;

        // Force both coordinate systems to be fresh to prevent frame-lag
        this.camera.object3D.updateWorldMatrix(true, false);
        this.el.object3D.parent.updateWorldMatrix(true, false);

        // 1. Get positions for proximity logic
        const parentWorldPos = this.tempVec.setFromMatrixPosition(this.el.object3D.parent.matrixWorld);
        const headWorldPos = new THREE.Vector3().setFromMatrixPosition(this.camera.object3D.matrixWorld);
        const distance = parentWorldPos.distanceTo(headWorldPos);

        // 2. State transitions for zooming
        // Skip proximity checks in 2D mode so it stays locked to our face
        if (AFRAME.utils.device.checkHeadsetConnected()) {
            if (distance < 0.22 && !this.zoomed) {
                this.zoomed = true;
                this.isLocked = false;
                this.pulse(0.7, 100);
            } else if (distance >= 0.32 && this.zoomed) {
                this.zoomed = false;
                this.isLocked = false;
                this.pulse(0.3, 50);
            }
        }

        // 3. Calculate Target Local Transform
        const targetPos = new THREE.Vector3();
        const targetQuat = new THREE.Quaternion();

        if (this.zoomed) {
            // Snap target: 12.5cm in front of camera
            const p = new THREE.Vector3(0, 0, -0.125);
            this.camera.object3D.localToWorld(p);
            this.el.object3D.parent.worldToLocal(p);
            targetPos.copy(p);

            // Snap rotation target: Align with camera
            const cameraWorldQuat = new THREE.Quaternion();
            this.camera.object3D.getWorldQuaternion(cameraWorldQuat);
            const parentWorldQuat = new THREE.Quaternion();
            this.el.object3D.parent.getWorldQuaternion(parentWorldQuat);

            targetQuat.copy(parentWorldQuat.invert().multiply(cameraWorldQuat));
        } else {
            // Return to controller
            targetPos.copy(this.originalPos);
            targetQuat.setFromEuler(this.originalRot);
        }

        // 4. Transform Application (Lerp vs Hard Lock)
        const dTarget = this.el.object3D.position.distanceTo(targetPos);

        if (this.zoomed) {
            // If we reach within 1cm of the eye-snap target, lock it hard to prevent any lerp-drag/lag
            if (dTarget < 0.01) this.isLocked = true;

            if (this.isLocked) {
                // Hard lock the DEVICE to the face so exit pupils remain aligned with eyes
                this.el.object3D.position.copy(targetPos);
                this.el.object3D.quaternion.copy(targetQuat);

                // --- STABILIZATION LOGIC ---
                // We stabilize the VIEW (secondary camera) while keeping the DEVICE locked to the head.
                const cameraWorldQuat = new THREE.Quaternion();
                this.camera.object3D.getWorldQuaternion(cameraWorldQuat);

                if (this.data.stabilized) {
                    if (!this.smoothedQuat) this.smoothedQuat = new THREE.Quaternion().copy(cameraWorldQuat);

                    // Adaptive Stabilization Logic
                    // 1. Calculate how far the smoothed view is lagging behind the real head rotation
                    const angle = this.smoothedQuat.angleTo(cameraWorldQuat); // radians

                    // 2. Base smoothing for fine detail (jitter reduction).
                    // Lower = smoother/heavier. 0.015 is extremely stable.
                    let smoothingFactor = 0.015;

                    // 3. Dynamic Catch-up: If we lag behind significantly (> 2 degrees), boost speed 
                    // so the user doesn't feel "drunk" or "delayed" during large pans.
                    const threshold = THREE.MathUtils.degToRad(2.0); // ~0.035 rad
                    if (angle > threshold) {
                        // Linearly increase factor based on lag
                        // For every radian of lag, add considerable speed
                        smoothingFactor += (angle - threshold) * 3.0;
                    }

                    // 4. Cap the speed to maintain *some* smoothness even during fast turns
                    // 0.4 ensures it catches up quickly but doesn't snap instantly
                    smoothingFactor = Math.min(smoothingFactor, 0.4);

                    this.smoothedQuat.slerp(cameraWorldQuat, smoothingFactor);

                    // Apply the difference to the secondary camera
                    // ChildLocal = ParentWorld^-1 * SmoothedWorld
                    // Since ParentWorld == CameraWorldQuat (we just locked it),
                    // Correction = CameraWorldQuat^-1 * SmoothedQuat
                    const correction = cameraWorldQuat.clone().invert().multiply(this.smoothedQuat);

                    if (this.secondaryCam) {
                        this.secondaryCam.object3D.quaternion.copy(correction);
                    }
                } else {
                    // Sync smoothedQuat to prevent jumps when toggling ON
                    if (this.smoothedQuat) this.smoothedQuat.copy(cameraWorldQuat);

                    // Reset secondary camera to look straight ahead (relative to device)
                    if (this.secondaryCam) {
                        this.secondaryCam.object3D.quaternion.identity();
                    }
                }
            } else {
                // Smoothly move towards the eyes from the controller
                this.el.object3D.position.lerp(targetPos, 0.2);
                this.el.object3D.quaternion.slerp(targetQuat, 0.2);

                // Ensure secondary cam is reset during transition
                if (this.secondaryCam) this.secondaryCam.object3D.quaternion.identity();
            }
        } else {
            // Return to controller with standard smoothing
            const lerpFactor = 1 - Math.pow(0.0001, dt / 1000);
            this.el.object3D.position.lerp(targetPos, Math.min(lerpFactor, 1));
            this.el.object3D.quaternion.slerp(targetQuat, Math.min(lerpFactor, 1));

            // Ensure secondary cam is reset
            if (this.secondaryCam) this.secondaryCam.object3D.quaternion.identity();
        }

        // 5. Dynamic Binocular Exit Pupil Scaling
        // Use actual binocular distance for visual accuracy
        const binoWorldPos = new THREE.Vector3().setFromMatrixPosition(this.el.object3D.matrixWorld);
        const realBinoDist = binoWorldPos.distanceTo(headWorldPos);

        // Transition: End precisely at snap point (0.125m), Start as they get very close (0.18m)
        let exitPupilRadius = 0.004;
        if (realBinoDist <= 0.125) {
            exitPupilRadius = 0.024; // Full viewing diameter
        } else if (realBinoDist < 0.18) {
            // Eased interpolation for late expansion
            const t = (realBinoDist - 0.125) / (0.18 - 0.125);
            const easedT = t * t * (3 - 2 * t); // Smoothstep
            exitPupilRadius = 0.024 * (1 - easedT) + 0.004 * easedT;
        }

        const leftLens = document.getElementById('left-lens');
        const rightLens = document.getElementById('right-lens');
        if (leftLens) leftLens.setAttribute('radius', exitPupilRadius);
        if (rightLens) rightLens.setAttribute('radius', exitPupilRadius);
    },
    pulse: function (strength, duration) {
        const controller = this.el.closest('[haptics]');
        if (controller && controller.components.haptics) {
            controller.components.haptics.pulse(strength, duration);
        }
    },
    toggle: function () {
        this.holding = !this.holding;
        this.el.setAttribute('visible', this.holding);
        if (!this.holding && this.zoomed) {
            this.zoomed = false;
            const overlay = document.getElementById('binocular-overlay');
            if (overlay) overlay.setAttribute('visible', false);
        }
        this.pulse(0.3, 100);

        this.updateHint();
    },
    update: function (oldData) {
        // Trigger hint update if stabilized changed
        if (oldData.stabilized !== this.data.stabilized) {
            this.updateHint();
        }
    },
    updateHint: function () {
        const hintXText = document.getElementById('hint-x-text');
        const hintXBg = document.getElementById('hint-x-bg');
        const stabIndicator = document.getElementById('bino-stab-indicator'); // New indicator in model

        // Update in-model indicator visibility and text
        if (stabIndicator) {
            // Because stabIndicator is an a-entity containing an a-text
            const textEl = stabIndicator.querySelector('a-text');
            if (textEl) {
                if (this.data.stabilized) {
                    textEl.setAttribute('value', 'STAB: ON');
                    textEl.setAttribute('color', '#00ff00');
                    textEl.setAttribute('opacity', 0.8);
                } else {
                    textEl.setAttribute('value', 'STAB: OFF');
                    textEl.setAttribute('color', '#ffaa00');
                    textEl.setAttribute('opacity', 0.3);
                }
            }
        }

        if (!hintXText) return;

        let label = 'Binoculars (X)';
        let width = 0.14;
        let pos = '-0.07 -0.0125 0';

        if (this.holding) {
            if (this.data.stabilized) {
                label = 'Exit (X) | Stab: ON';
                width = 0.24;
                pos = '-0.12 -0.0125 0';
            } else {
                label = 'Ditch Bino (X)';
                width = 0.16;
                pos = '-0.08 -0.0125 0';
            }
        }

        hintXText.setAttribute('value', label);
        if (hintXBg) {
            hintXBg.setAttribute('width', width);
            hintXBg.setAttribute('position', pos);
        }
    }
});
