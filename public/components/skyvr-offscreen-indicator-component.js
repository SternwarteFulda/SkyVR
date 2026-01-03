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

            // Sync color with player-info
            if (this.playerInfo && this.model) {
                this.model.setAttribute('material', 'color', this.playerInfo.data.color);
            }
        } else {
            this.indicator.setAttribute('visible', false);
        }
    },

    createIndicator: function () {
        this.indicator = document.createElement('a-entity');
        this.indicator.setAttribute('visible', false);

        this.model = document.createElement('a-triangle');
        // Scaled and centered: height is 22.5, pivot at center
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
            fog: false // CRITICAL: Ensure it's not dimmed by atmosphere/fog
        });

        this.indicator.appendChild(this.model);
        this.camera.appendChild(this.indicator);
    },

    getPointerTipPosition: function () {
        const cylinderComp = this.pointer.components['bottom-origin-cylinder'];
        if (!cylinderComp || !cylinderComp.parentEntity) return null;

        const height = cylinderComp.data.height;
        // Tip is at (0, -height, 0) relative to parentEntity
        const tipPosLocal = new THREE.Vector3(0, -height, 0);

        // Ensure world matrix is up to date
        cylinderComp.parentEntity.object3D.updateWorldMatrix(true, false);
        return tipPosLocal.applyMatrix4(cylinderComp.parentEntity.object3D.matrixWorld);
    },

    remove: function () {
        if (this.indicator && this.indicator.parentNode) {
            this.indicator.parentNode.removeChild(this.indicator);
        }
    }
});
