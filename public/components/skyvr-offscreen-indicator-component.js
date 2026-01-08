AFRAME.registerComponent('offscreen-indicator', {
    init: function () {
        this.camera = null;
        this.pointer = this.el.querySelector('.pointer');
        this.indicator = null;
        this.model = null;
        this.playerInfo = null;
    },

    tick: function () {
        // Find player-info if not yet found
        if (!this.playerInfo) {
            this.playerInfo = this.el.components['player-info'];
        }

        // Only show if pointer is visible
        if (!this.pointer || !this.pointer.getAttribute('visible')) {
            if (this.indicator) this.indicator.setAttribute('visible', false);
            return;
        }

        if (!this.camera) {
            // Find the local camera
            const cameraEl = this.el.sceneEl.querySelector('[camera]');
            if (cameraEl) {
                this.camera = cameraEl;
            } else {
                return;
            }
        }

        if (!this.indicator) {
            this.createIndicator();
        }

        const tipPos = this.getPointerTipPosition();
        if (!tipPos) return;

        const camObj = this.camera.getObject3D('camera');
        if (!camObj) return;

        // Project tip position to camera NDC
        const pos = tipPos.clone();
        pos.project(camObj);

        // Check if point is behind camera
        const cameraWorldPos = new THREE.Vector3();
        this.camera.object3D.getWorldPosition(cameraWorldPos);
        const cameraWorldQuat = new THREE.Quaternion();
        this.camera.object3D.getWorldQuaternion(cameraWorldQuat);
        const cameraForward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraWorldQuat);

        const toTarget = tipPos.clone().sub(cameraWorldPos).normalize();
        const dot = toTarget.dot(cameraForward);

        // Offscreen Detection:
        // - pos.x/y threshold reduced to 0.75 (appears while still technically in view, for warning)
        // - dot product threshold increased to 0.9 (approx 25 degrees) to catch it much earlier
        const isOffscreen = Math.abs(pos.x) > 0.75 || Math.abs(pos.y) > 0.75 || dot < 0.9;

        if (isOffscreen) {
            this.indicator.setAttribute('visible', true);

            // Use Camera-Local Space for angle to avoid perspective/aspect-ratio skew from NDC
            const localTarget = tipPos.clone().applyMatrix4(camObj.matrixWorldInverse);
            const x = localTarget.x;
            const y = localTarget.y;
            const angle = Math.atan2(y, x);

            // Positioning the indicator 350m away
            const radius = 150;
            const depth = -350;

            // Position relative to FOV center (removed downward offset)
            this.indicator.object3D.position.set(
                Math.cos(angle) * radius,
                Math.sin(angle) * radius,
                depth
            );

            // Rotate indicator to point towards the direction
            this.indicator.object3D.rotation.z = angle - Math.PI / 2;

            // Pulse effect using time
            const time = this.el.sceneEl.time / 1000;
            const pulse = 1 + Math.sin(time * 6) * 0.05; // Reduced scale pulse
            const opacityPulse = 0.8 + Math.sin(time * 6) * 0.08; // Subtler opacity pulse

            this.indicator.object3D.scale.set(pulse, pulse, pulse);

            // Sync color and pulse opacity
            if (this.playerInfo && this.model) {
                const color = this.playerInfo.data.color;
                this.model.setAttribute('material', {
                    color: color,
                    opacity: opacityPulse
                });
                if (this.glow) {
                    this.glow.setAttribute('material', {
                        color: color,
                        opacity: opacityPulse * 0.3
                    });
                }
            }
        } else {
            this.indicator.setAttribute('visible', false);
        }
    },

    createIndicator: function () {
        this.indicator = document.createElement('a-entity');
        this.indicator.setAttribute('visible', false);

        // Core Solid Arrow
        this.model = document.createElement('a-triangle');
        this.model.setAttribute('vertex-c', '0 11.25 0');
        this.model.setAttribute('vertex-a', '-7.5 -11.25 0');
        this.model.setAttribute('vertex-b', '7.5 -11.25 0');

        const color = (this.playerInfo && this.playerInfo.data) ? this.playerInfo.data.color : '#ffffff';

        this.model.setAttribute('material', {
            color: color,
            shader: 'flat',
            transparent: true,
            opacity: 0.9,
            depthTest: false,
            depthWrite: false,
            fog: false,
            blending: 'additive'
        });

        // Outer Glow Arrow
        this.glow = document.createElement('a-triangle');
        this.glow.setAttribute('vertex-c', '0 14 0');
        this.glow.setAttribute('vertex-a', '-10 -13 0');
        this.glow.setAttribute('vertex-b', '10 -13 0');
        this.glow.setAttribute('position', '0 0 -0.1'); // Slightly behind

        this.glow.setAttribute('material', {
            color: color,
            shader: 'flat',
            transparent: true,
            opacity: 0.3,
            depthTest: false,
            depthWrite: false,
            fog: false,
            blending: 'additive'
        });

        this.indicator.appendChild(this.glow);
        this.indicator.appendChild(this.model);
        this.camera.appendChild(this.indicator);
    },

    getPointerTipPosition: function () {
        // Pointer is the entity being rotated.
        // The beam/arrow point down the local Y axis.
        // Geometry is centered at Y= -Height/2.
        // But the beam VISUALLY extends from 0 to -Height.
        // So the tip is at (0, -400, 0)

        let height = 400;
        // Try to get from component data if available
        if (this.pointer.components['bottom-origin-cylinder']) {
            height = this.pointer.components['bottom-origin-cylinder'].data.height;
        }

        const tipPosLocal = new THREE.Vector3(0, -height, 0);

        // Ensure matrix is up to date
        if (this.pointer.object3D) {
            this.pointer.object3D.updateWorldMatrix(true, false);
            return tipPosLocal.applyMatrix4(this.pointer.object3D.matrixWorld);
        }
        return null;
    },

    remove: function () {
        if (this.indicator && this.indicator.parentNode) {
            this.indicator.parentNode.removeChild(this.indicator);
        }
    }
});
