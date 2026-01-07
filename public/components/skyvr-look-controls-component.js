/* global AFRAME, THREE */

/**
 * skyvr-look-controls
 * 
 * A self-contained, customized version of A-Frame's look-controls.
 * Optimized for SkyVR astronomical exploration.
 */
(function () {
    var PI_2 = Math.PI / 2;

    AFRAME.registerComponent('skyvr-look-controls', {
        dependencies: ['position', 'rotation'],

        schema: {
            enabled: { default: true },
            magicWindowTrackingEnabled: { default: true },
            pointerLockEnabled: { default: false },
            reverseMouseDrag: { default: true }, // Default: Sky Move
            reverseTouchDrag: { default: false },
            touchEnabled: { default: true },
            mouseEnabled: { default: true }
        },

        init: function () {
            this.deltaYaw = 0;
            this.previousHMDPosition = new THREE.Vector3();
            this.hmdQuaternion = new THREE.Quaternion();
            this.magicWindowAbsoluteEuler = new THREE.Euler();
            this.magicWindowDeltaEuler = new THREE.Euler();
            this.position = new THREE.Vector3();
            this.magicWindowObject = new THREE.Object3D();
            this.rotation = {};
            this.deltaRotation = {};
            this.savedPose = null;
            this.pointerLocked = false;
            this.setupMouseControls();
            this.bindMethods();
            this.previousMouseEvent = {};
            this.previousMagicWindowYaw = 0;
            this.previousMagicWindowPitch = 0;
            this.activeKeys = {};

            this.setupMagicWindowControls();

            // To save / restore camera pose
            this.savedPose = {
                position: new THREE.Vector3(),
                rotation: new THREE.Euler()
            };

            // Zenith tilt re-enable logic
            this.handleDeviceOrientation = this.handleDeviceOrientation.bind(this);
            window.addEventListener('deviceorientation', this.handleDeviceOrientation);

            if (this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode')) { this.onEnterVR(); }

            console.log("skyvr-look-controls: Init complete.");
        },

        setupMagicWindowControls: function () {
            var magicWindowControls;
            var data = this.data;
            var utils = AFRAME.utils;

            if (utils.device.isMobile() || utils.device.isMobileDeviceRequestingDesktopSite()) {
                // Find DeviceOrientationControls in A-Frame bundle
                var DOC = THREE.DeviceOrientationControls || (AFRAME.THREE && AFRAME.THREE.DeviceOrientationControls);
                if (!DOC) return;

                magicWindowControls = this.magicWindowControls = new DOC(this.magicWindowObject);
                if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
                    magicWindowControls.enabled = false;
                    if (this.el.sceneEl.components['device-orientation-permission-ui'] &&
                        this.el.sceneEl.components['device-orientation-permission-ui'].permissionGranted) {
                        magicWindowControls.enabled = data.magicWindowTrackingEnabled;
                    } else {
                        this.el.sceneEl.addEventListener('deviceorientationpermissiongranted', function () {
                            magicWindowControls.enabled = data.magicWindowTrackingEnabled;
                        });
                    }
                }
            }
        },

        update: function (oldData) {
            var data = this.data;
            if (data.enabled !== oldData.enabled) {
                this.updateGrabCursor(data.enabled);
            }
            if (oldData && !data.magicWindowTrackingEnabled && oldData.magicWindowTrackingEnabled) {
                // Bake the gyro rotation into the manual rotation objects for a seamless transition
                this.yawObject.rotation.y += this.magicWindowDeltaEuler.y;
                this.pitchObject.rotation.x += this.magicWindowDeltaEuler.x;

                this.magicWindowAbsoluteEuler.set(0, 0, 0);
                this.magicWindowDeltaEuler.set(0, 0, 0);
                this.previousMagicWindowYaw = 0;
                this.previousMagicWindowPitch = 0;
            }
            if (this.magicWindowControls) {
                this.magicWindowControls.enabled = data.magicWindowTrackingEnabled;
            }
            if (oldData && data.pointerLockEnabled !== oldData.pointerLockEnabled) {
                this.removeEventListeners();
                this.addEventListeners();
                if (this.pointerLocked) {
                    this.exitPointerLock();
                } else if (data.pointerLockEnabled) {
                    // Automatically request lock when enabled via mode toggle
                    this.requestPointerLock();
                }
            }
        },

        tick: function (t, dt) {
            var data = this.data;
            if (!data.enabled) { return; }
            this.updateKeyboardRotation(dt);
            this.updateOrientation();
        },

        play: function () {
            this.addEventListeners();
        },

        pause: function () {
            this.removeEventListeners();
            if (this.pointerLocked) { this.exitPointerLock(); }
        },

        remove: function () {
            this.removeEventListeners();
            window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
            if (this.pointerLocked) { this.exitPointerLock(); }
        },

        bindMethods: function () {
            this.onMouseDown = this.onMouseDown.bind(this);
            this.onMouseMove = this.onMouseMove.bind(this);
            this.onMouseUp = this.onMouseUp.bind(this);
            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            this.onEnterVR = this.onEnterVR.bind(this);
            this.onExitVR = this.onExitVR.bind(this);
            this.onPointerLockChange = this.onPointerLockChange.bind(this);
            this.onPointerLockError = this.onPointerLockError.bind(this);
            this.onKeyDown = this.onKeyDown.bind(this);
            this.onKeyUp = this.onKeyUp.bind(this);
        },

        setupMouseControls: function () {
            this.mouseDown = false;
            this.pitchObject = new THREE.Object3D();
            this.yawObject = new THREE.Object3D();
            this.yawObject.position.y = 10;
            this.yawObject.add(this.pitchObject);
        },

        addEventListeners: function () {
            var sceneEl = this.el.sceneEl;
            var canvasEl = sceneEl.canvas;
            if (!canvasEl) {
                sceneEl.addEventListener('render-target-loaded', this.addEventListeners.bind(this));
                return;
            }
            canvasEl.addEventListener('mousedown', this.onMouseDown, false);
            window.addEventListener('mousemove', this.onMouseMove, false);
            window.addEventListener('mouseup', this.onMouseUp, false);
            canvasEl.addEventListener('touchstart', this.onTouchStart, { passive: true });
            window.addEventListener('touchmove', this.onTouchMove, { passive: true });
            window.addEventListener('touchend', this.onTouchEnd, { passive: true });
            sceneEl.addEventListener('enter-vr', this.onEnterVR);
            sceneEl.addEventListener('exit-vr', this.onExitVR);
            if (this.data.pointerLockEnabled) {
                document.addEventListener('pointerlockchange', this.onPointerLockChange, false);
                document.addEventListener('mozpointerlockchange', this.onPointerLockChange, false);
                document.addEventListener('pointerlockerror', this.onPointerLockError, false);
            }
            window.addEventListener('keydown', this.onKeyDown, false);
            window.addEventListener('keyup', this.onKeyUp, false);
        },

        removeEventListeners: function () {
            var sceneEl = this.el.sceneEl;
            var canvasEl = sceneEl && sceneEl.canvas;
            if (!canvasEl) { return; }
            canvasEl.removeEventListener('mousedown', this.onMouseDown);
            window.removeEventListener('mousemove', this.onMouseMove);
            window.removeEventListener('mouseup', this.onMouseUp);
            canvasEl.removeEventListener('touchstart', this.onTouchStart);
            window.removeEventListener('touchmove', this.onTouchMove);
            window.removeEventListener('touchend', this.onTouchEnd);
            sceneEl.removeEventListener('enter-vr', this.onEnterVR);
            sceneEl.removeEventListener('exit-vr', this.onExitVR);
            document.removeEventListener('pointerlockchange', this.onPointerLockChange, false);
            document.removeEventListener('mozpointerlockchange', this.onPointerLockChange, false);
            document.removeEventListener('pointerlockerror', this.onPointerLockError, false);
            window.removeEventListener('keydown', this.onKeyDown, false);
            window.removeEventListener('keyup', this.onKeyUp, false);
        },

        updateOrientation: function () {
            var object3D = this.el.object3D;
            var pitchObject = this.pitchObject;
            var yawObject = this.yawObject;
            var sceneEl = this.el.sceneEl;
            if ((sceneEl.is('vr-mode') || sceneEl.is('ar-mode')) && sceneEl.checkHeadsetConnected()) {
                return;
            }
            this.updateMagicWindowOrientation();
            object3D.rotation.x = this.magicWindowDeltaEuler.x + pitchObject.rotation.x;
            object3D.rotation.y = this.magicWindowDeltaEuler.y + yawObject.rotation.y;
            object3D.rotation.z = this.magicWindowDeltaEuler.z;
        },

        updateMagicWindowOrientation: function () {
            var magicWindowAbsoluteEuler = this.magicWindowAbsoluteEuler;
            var magicWindowDeltaEuler = this.magicWindowDeltaEuler;
            if (this.magicWindowControls && this.magicWindowControls.enabled) {
                this.magicWindowControls.update();
                magicWindowAbsoluteEuler.setFromQuaternion(this.magicWindowObject.quaternion, 'YXZ');
                if (!this.previousMagicWindowYaw && magicWindowAbsoluteEuler.y !== 0) {
                    this.previousMagicWindowYaw = magicWindowAbsoluteEuler.y;
                    this.previousMagicWindowPitch = magicWindowAbsoluteEuler.x;
                }
                if (this.previousMagicWindowYaw) {
                    // Treat both axes as relative deltas so they can be baked into manual rotation on exit
                    magicWindowDeltaEuler.x += magicWindowAbsoluteEuler.x - this.previousMagicWindowPitch;
                    magicWindowDeltaEuler.y += magicWindowAbsoluteEuler.y - this.previousMagicWindowYaw;
                    magicWindowDeltaEuler.z = magicWindowAbsoluteEuler.z;
                    this.previousMagicWindowYaw = magicWindowAbsoluteEuler.y;
                    this.previousMagicWindowPitch = magicWindowAbsoluteEuler.x;
                }
            }
        },

        updateKeyboardRotation: function (dt) {
            if (!this.data.enabled || !this.data.mouseEnabled) { return; }

            var speed = 0.02; // Rad per frame
            var keys = this.activeKeys;
            var moved = false;
            var direction = this.data.reverseMouseDrag ? 1 : -1;

            if (keys.ArrowLeft) {
                this.yawObject.rotation.y += speed * direction;
                moved = true;
            }
            if (keys.ArrowRight) {
                this.yawObject.rotation.y -= speed * direction;
                moved = true;
            }
            if (keys.ArrowUp) {
                this.pitchObject.rotation.x += speed * direction;
                moved = true;
            }
            if (keys.ArrowDown) {
                this.pitchObject.rotation.x -= speed * direction;
                moved = true;
            }

            if (moved) {
                this.pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, this.pitchObject.rotation.x));
            }
        },

        onKeyDown: function (evt) {
            // Disable movement if typing in an input
            if (document.activeElement && document.activeElement.tagName === 'INPUT') {
                return;
            }
            this.activeKeys[evt.key] = true;
        },

        onKeyUp: function (evt) {
            this.activeKeys[evt.key] = false;
        },

        onMouseMove: function (evt) {
            if (!this.data.enabled || (!this.mouseDown && !this.pointerLocked)) { return; }

            var movementX, movementY;
            if (this.pointerLocked) {
                movementX = evt.movementX || evt.mozMovementX || 0;
                movementY = evt.movementY || evt.mozMovementY || 0;
            } else {
                movementX = evt.screenX - this.previousMouseEvent.screenX;
                movementY = evt.screenY - this.previousMouseEvent.screenY;
            }
            this.previousMouseEvent.screenX = evt.screenX;
            this.previousMouseEvent.screenY = evt.screenY;

            var direction = this.data.reverseMouseDrag ? 1 : -1;
            this.yawObject.rotation.y += movementX * 0.002 * direction;
            this.pitchObject.rotation.x += movementY * 0.002 * direction;
            this.pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, this.pitchObject.rotation.x));
        },

        onMouseDown: function (evt) {
            var sceneEl = this.el.sceneEl;
            if (!this.data.enabled || !this.data.mouseEnabled || ((sceneEl.is('vr-mode') || sceneEl.is('ar-mode')) && sceneEl.checkHeadsetConnected())) { return; }
            if (evt.button !== 0) { return; }

            // If we are in FPS mode (pointer locked), clicking should exit it
            if (this.pointerLocked) {
                this.exitPointerLock();
                return;
            }

            this.mouseDown = true;
            this.previousMouseEvent.screenX = evt.screenX;
            this.previousMouseEvent.screenY = evt.screenY;

            // Only show the grabbing cursor if we are in Grab Mode (Sky Move)
            if (this.data.reverseMouseDrag) {
                this.showGrabbingCursor();
            }

            if (this.data.pointerLockEnabled && !this.pointerLocked) {
                if (sceneEl.canvas.requestPointerLock) { sceneEl.canvas.requestPointerLock(); }
            }
        },

        showGrabbingCursor: function () {
            if (this.el.sceneEl.canvas) this.el.sceneEl.canvas.style.cursor = 'grabbing';
        },

        hideGrabbingCursor: function () {
            if (this.el.sceneEl.canvas) this.el.sceneEl.canvas.style.cursor = '';
        },

        onMouseUp: function () {
            this.mouseDown = false;
            this.hideGrabbingCursor();
        },

        onTouchStart: function (evt) {
            if (evt.touches.length !== 1 || !this.data.touchEnabled || this.el.sceneEl.is('vr-mode') || this.el.sceneEl.is('ar-mode')) { return; }
            this.touchStart = { x: evt.touches[0].pageX, y: evt.touches[0].pageY };
            this.touchStarted = true;

            if (this.data.magicWindowTrackingEnabled) {
                this.el.setAttribute('skyvr-look-controls', 'magicWindowTrackingEnabled', false);
            }
        },

        onTouchMove: function (evt) {
            if (!this.touchStarted || !this.data.touchEnabled) { return; }

            var canvas = this.el.sceneEl.canvas;
            var deltaY = 2 * Math.PI * (evt.touches[0].pageX - this.touchStart.x) / canvas.clientWidth;
            var deltaX = 2 * Math.PI * (evt.touches[0].pageY - this.touchStart.y) / canvas.clientHeight;

            var direction = this.data.reverseTouchDrag ? 1 : -1;
            this.yawObject.rotation.y -= deltaY * 0.5 * direction;
            this.pitchObject.rotation.x -= deltaX * 0.5 * direction;
            this.pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, this.pitchObject.rotation.x));

            this.touchStart = { x: evt.touches[0].pageX, y: evt.touches[0].pageY };
        },

        onTouchEnd: function () {
            this.touchStarted = false;
        },

        onEnterVR: function () {
            var sceneEl = this.el.sceneEl;
            if (!sceneEl.checkHeadsetConnected()) { return; }
            this.saveCameraPose();
            this.el.object3D.position.set(0, 0, 0);
            this.el.object3D.rotation.set(0, 0, 0);
            if (sceneEl.hasWebXR) {
                this.el.object3D.matrixAutoUpdate = false;
                this.el.object3D.updateMatrix();
            }
        },

        onExitVR: function () {
            if (!this.el.sceneEl.checkHeadsetConnected()) { return; }
            this.restoreCameraPose();
            this.previousHMDPosition.set(0, 0, 0);
            this.el.object3D.matrixAutoUpdate = true;
        },

        onPointerLockChange: function () {
            this.pointerLocked = !!(document.pointerLockElement || document.mozPointerLockElement);
            if (this.pointerLocked) {
                document.body.classList.add('pointer-locked');
            } else {
                document.body.classList.remove('pointer-locked');
            }
        },

        onPointerLockError: function () {
            this.pointerLocked = false;
        },

        exitPointerLock: function () {
            if (document.exitPointerLock) document.exitPointerLock();
            this.pointerLocked = false;
        },

        requestPointerLock: function () {
            var canvasEl = this.el.sceneEl.canvas;
            if (canvasEl && canvasEl.requestPointerLock) {
                canvasEl.requestPointerLock();
            }
        },

        updateGrabCursor: function (enabled) {
            var sceneEl = this.el.sceneEl;
            function enableGrabCursor() { sceneEl.canvas.classList.add('a-grab-cursor'); }
            function disableGrabCursor() { sceneEl.canvas.classList.remove('a-grab-cursor'); }
            if (!sceneEl.canvas) {
                if (enabled) sceneEl.addEventListener('render-target-loaded', enableGrabCursor);
                else sceneEl.addEventListener('render-target-loaded', disableGrabCursor);
                return;
            }
            if (enabled) { enableGrabCursor(); return; }
            disableGrabCursor();
        },

        saveCameraPose: function () {
            var el = this.el;
            this.savedPose.position.copy(el.object3D.position);
            this.savedPose.rotation.copy(el.object3D.rotation);
            this.hasSavedPose = true;
        },

        restoreCameraPose: function () {
            var el = this.el;
            if (!this.hasSavedPose) { return; }
            el.object3D.position.copy(this.savedPose.position);
            el.object3D.rotation.copy(this.savedPose.rotation);
            this.hasSavedPose = false;
        },

        handleDeviceOrientation: function (event) {
            if (event.beta === null || event.gamma === null) return;

            // Detect orientation (Portrait vs Landscape)
            const orientation = window.orientation || (screen.orientation && screen.orientation.angle) || 0;
            const isLandscape = Math.abs(orientation) === 90;

            // Calculate 'True Pitch' relative to the horizon
            // In landscape, pitch wraps at 90 deg. past vertical, beta flips to 180/-180.
            let pitch;
            if (isLandscape) {
                const absBeta = Math.abs(event.beta);
                const absGamma = Math.abs(event.gamma);
                pitch = (absBeta > 90) ? (180 - absGamma) : absGamma;
            } else {
                pitch = event.beta;
            }

            // Exclusive Mode Threshold (Vertical = 90)
            const isPointingUp = pitch > 90;

            // 1. Deactivate touch if pointing at the sky, otherwise activate it
            if (this.data.touchEnabled === isPointingUp) {
                this.el.setAttribute('skyvr-look-controls', 'touchEnabled', !isPointingUp);
            }

            // 2. Activate gyro if pointing at the sky, otherwise deactivate it
            if (this.data.magicWindowTrackingEnabled !== isPointingUp) {
                this.el.setAttribute('skyvr-look-controls', 'magicWindowTrackingEnabled', isPointingUp);
                console.log(`skyvr-look-controls: Pitch ${pitch.toFixed(1)}°. ${isPointingUp ? 'Sensors Active' : 'Touch Active'}.`);
            }
        }
    });
})();
