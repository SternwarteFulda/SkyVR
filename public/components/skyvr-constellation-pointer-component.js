AFRAME.registerComponent('constellation-pointer', {
    init: function () {
        this.constellationRenderer = null;
        this.currentConstellation = null;
        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1000;

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

        const controllerPos = new THREE.Vector3();
        const controllerQuat = new THREE.Quaternion();
        this.el.object3D.getWorldPosition(controllerPos);
        this.el.object3D.getWorldQuaternion(controllerQuat);

        // Get ray origin and direction from meta-touch-controls
        let rayOriginLocal = new THREE.Vector3(0, 0, 0);
        let rayDirectionLocal = new THREE.Vector3(0, 0, -1);

        const metaTouch = this.el.components['meta-touch-controls'];
        if (metaTouch && metaTouch.displayModel) {
            const hand = metaTouch.data.hand;
            const model = metaTouch.displayModel[hand];
            if (model && model.rayOrigin) {
                rayOriginLocal.copy(model.rayOrigin.origin);
                rayDirectionLocal.copy(model.rayOrigin.direction);
            }
        } else {
            const dir = new THREE.Vector3(0, -1, 0);
            const tiltEuler = new THREE.Euler(THREE.MathUtils.degToRad(54), THREE.MathUtils.degToRad(9), 0, 'YXZ');
            dir.applyEuler(tiltEuler);
            rayDirectionLocal.copy(dir);
        }

        const worldStart = rayOriginLocal.clone().applyQuaternion(controllerQuat).add(controllerPos);
        const worldDir = rayDirectionLocal.clone().applyQuaternion(controllerQuat).normalize();

        // Parallax-robust selection: We point from the controller but we are selecting 
        // objects on a sphere centered at (0,0,0). Because the user might be several 
        // meters away, we use the controller's world position and direction to find 
        // what they are pointing at on that fixed sphere.
        const skyOrigin = new THREE.Vector3(0, 0, 0);
        this.raycaster.set(worldStart, worldDir);

        // Find pointed constellation
        const pointedConstellation = this.constellationRenderer.findPointedConstellation(this.raycaster);

        // Update preview if constellation changed
        if (pointedConstellation !== this.currentConstellation) {
            this.currentConstellation = pointedConstellation;

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
