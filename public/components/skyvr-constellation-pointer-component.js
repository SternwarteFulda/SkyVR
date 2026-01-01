AFRAME.registerComponent('constellation-pointer', {
    init: function () {
        this.constellationRenderer = null;
        this.currentConstellation = null;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 500; // Extended range for sky pointing

        // Wait for constellation renderer to be ready
        this.checkForRenderer = setInterval(() => {
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl && rendererEl.components['constellation-renderer']) {
                this.constellationRenderer = rendererEl.components['constellation-renderer'];
                clearInterval(this.checkForRenderer);
                console.log('Constellation pointer connected to renderer');
            }
        }, 100);
    },

    tick: function () {
        if (!this.constellationRenderer || !this.constellationRenderer.loadingComplete) return;

        // Only update in constellation mode
        const currentMode = window.currentMode || 'draw';
        if (currentMode !== 'constellation') {
            if (this.currentConstellation) {
                this.constellationRenderer.removePreview();
                this.currentConstellation = null;
            }
            return;
        }

        // Get controller position and direction for raycasting
        const controllerPos = new THREE.Vector3();
        const controllerQuat = new THREE.Quaternion();
        this.el.object3D.getWorldPosition(controllerPos);
        this.el.object3D.getWorldQuaternion(controllerQuat);

        // Create ray direction vector starting from local -Y (downward), 
        // which matches how the bottom-origin-cylinder geometry is offset (points from 0 to -height).
        const direction = new THREE.Vector3(0, -1, 0);

        // Match the rotation schema of the bottom-origin-cylinder: 54 9 0
        const tiltEuler = new THREE.Euler(
            THREE.MathUtils.degToRad(54),
            THREE.MathUtils.degToRad(9),
            0,
            'YXZ'
        );
        direction.applyEuler(tiltEuler);
        direction.applyQuaternion(controllerQuat);

        this.raycaster.set(controllerPos, direction);

        // Find pointed constellation
        const pointedConstellation = this.constellationRenderer.findPointedConstellation(this.raycaster);

        // Update preview if constellation changed
        if (pointedConstellation !== this.currentConstellation) {
            this.currentConstellation = pointedConstellation;
            this.constellationRenderer.currentPointedConstellation = pointedConstellation;

            if (pointedConstellation) {
                this.constellationRenderer.updatePreview(pointedConstellation);

                // Haptic feedback when pointing at a constellation
                if (this.el.components['haptics']) {
                    this.el.components['haptics'].pulse(0.1, 50);
                }
            } else {
                this.constellationRenderer.removePreview();
            }
        }
    },

    remove: function () {
        if (this.checkForRenderer) {
            clearInterval(this.checkForRenderer);
        }
    }
});
