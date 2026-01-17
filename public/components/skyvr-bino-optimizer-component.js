/* global AFRAME, THREE */

AFRAME.registerComponent('bino-optimizer', {
    init: function () {
        this.optimized = false;
        this.originalFog = null;
        this.originalClearColor = new THREE.Color();
        this.originalClearAlpha = 1;
    },
    tick: function () {
        const secondary = this.el.components['secondary-camera'];
        if (!secondary || !secondary.camera) return;

        // Force camera to Layer 0 to see ground, landscape and daylight sky
        if (this.el.object3D.layers.mask !== 1) {
            this.el.object3D.layers.set(0);
        }

        // Ensure far plane is long enough for the landscape and sky sphere
        if (secondary.camera.far !== 4000 || secondary.camera.near !== 0.05) {
            secondary.camera.far = 4000;
            secondary.camera.near = 0.05;
            secondary.camera.updateProjectionMatrix();
        }

        // To fix the 'washed out' issue while still seeing the sky:
        // 1. Disable fog for sharpness
        // 2. Force a black clear color for the render target (prevents white bleed)
        if (secondary.camera && !secondary.camera._patched) {
            const originalRender = secondary.camera.onBeforeRender;
            secondary.camera.onBeforeRender = (renderer, scene, camera) => {
                // Patch Fog
                this.originalFog = scene.fog;
                //scene.fog = null;

                // Dynamic Background handling:
                // If it's night (skyBrightness < 0.1), hide the environment sky sphere in the bino view
                // and ensure exposure is suppressed.
                const sky = document.querySelector('.environmentSky');
                if (sky && sky.object3D && typeof window.skyBrightness !== 'undefined') {
                    this.skyWasVisible = sky.object3D.visible;
                    if (window.skyBrightness < 0.1) {
                        sky.object3D.visible = false;
                    }
                }

                // Handle exposureBias via the actual sky material
                const binoSky = document.querySelector('a-sky.environment');
                if (binoSky) {
                    const mat = binoSky.getAttribute('material');
                    this.oldExposure = (mat && typeof mat.exposureBias !== 'undefined') ? mat.exposureBias : 1.0;
                    if (window.skyBrightness < 0.1) {
                        binoSky.setAttribute('material', 'exposureBias', 0.0);
                    }
                }

                // Patch Clear Color (Crucial for black background)
                renderer.getClearColor(this.originalClearColor);
                this.originalClearAlpha = renderer.getClearAlpha();
                renderer.setClearColor(0x000000, 1.0);

                if (originalRender) originalRender(renderer, scene, camera);
            };

            secondary.camera.onAfterRender = (renderer, scene, camera) => {
                scene.fog = this.originalFog;
                renderer.setClearColor(this.originalClearColor, this.originalClearAlpha);

                const sky = document.querySelector('.environmentSky');
                if (sky && sky.object3D && typeof this.skyWasVisible !== 'undefined') {
                    sky.object3D.visible = this.skyWasVisible;
                }
                const binoSky = document.querySelector('a-sky.environment');
                if (binoSky && typeof this.oldExposure !== 'undefined') {
                    binoSky.setAttribute('material', 'exposureBias', this.oldExposure);
                }
            };
            secondary.camera._patched = true;
        }

        // Adjust Resolution if it's too high/low
        if (secondary.renderTargets && !this.optimized) {
            const size = 1024; // 1k is perfect for the lens
            secondary.renderTargets.forEach(rt => {
                if (rt.width !== size) {
                    rt.setSize(size, size);
                }
            });
            this.optimized = true;
        }
    }
});
