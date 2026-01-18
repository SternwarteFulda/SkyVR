/* global AFRAME, THREE */

AFRAME.registerComponent('binoculars-handler', {
    schema: {
        minFov: { type: 'number', default: 8 },
        maxFov: { type: 'number', default: 80 }
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
            // Snap target: 13cm in front of camera
            const p = new THREE.Vector3(0, 0, -0.13);
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
                this.el.object3D.position.copy(targetPos);
                this.el.object3D.quaternion.copy(targetQuat);
            } else {
                // Smoothly move towards the eyes from the controller
                this.el.object3D.position.lerp(targetPos, 0.2);
                this.el.object3D.quaternion.slerp(targetQuat, 0.2);
            }
        } else {
            // Return to controller with standard smoothing
            const lerpFactor = 1 - Math.pow(0.0001, dt / 1000);
            this.el.object3D.position.lerp(targetPos, Math.min(lerpFactor, 1));
            this.el.object3D.quaternion.slerp(targetQuat, Math.min(lerpFactor, 1));
        }

        // 5. Dynamic Binocular Exit Pupil Scaling
        // Use actual binocular distance for visual accuracy
        const binoWorldPos = new THREE.Vector3().setFromMatrixPosition(this.el.object3D.matrixWorld);
        const realBinoDist = binoWorldPos.distanceTo(headWorldPos);

        // Transition: End precisely at snap point (0.13m), Start as they get very close (0.18m)
        let exitPupilRadius = 0.004;
        if (realBinoDist <= 0.13) {
            exitPupilRadius = 0.024; // Full viewing diameter
        } else if (realBinoDist < 0.18) {
            // Eased interpolation for late expansion
            const t = (realBinoDist - 0.13) / (0.18 - 0.13);
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

        // Update hint text
        const hintXText = document.getElementById('hint-x-text');
        const hintXBg = document.getElementById('hint-x-bg');
        if (hintXText) hintXText.setAttribute('value', this.holding ? 'Ditch Bino (X)' : 'Binoculars (X)');
        if (hintXBg) hintXBg.setAttribute('width', this.holding ? 0.16 : 0.14);
        if (hintXBg) hintXBg.setAttribute('position', this.holding ? '-0.08 -0.0125 0' : '-0.07 -0.0125 0');
    }
});
