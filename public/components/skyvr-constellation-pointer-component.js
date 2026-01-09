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

        // Prevent conflict with 2D pointer if not in VR mode
        if (!this.el.sceneEl.is('vr-mode')) {
            // Ensure we don't leave lingering previews if we just exited VR or initialized
            if (this.currentConstellation) {
                this.constellationRenderer.removePreview();
                this.constellationRenderer.clearHighlights();
                this.currentConstellation = null;
            }
            return;
        }

        // Only update in constellation or stick-figure mode
        const currentMode = window.currentMode || 'draw';
        const isConstMode = currentMode === 'constellation';
        const isStickMode = currentMode === 'stickfigure';

        if (!isConstMode && !isStickMode) {
            if (this.currentConstellation) {
                this.constellationRenderer.removePreview();
                this.currentConstellation = null;
            }
            return;
        }

        const targetType = isStickMode ? 'stick' : 'illustration';

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

        // Parallax-robust selection
        this.raycaster.set(worldStart, worldDir);

        // Find pointed constellation
        const pointedConstellation = this.constellationRenderer.findPointedConstellation(this.raycaster);

        // Update preview or highlight
        if (pointedConstellation !== this.currentConstellation || true) {
            this.currentConstellation = pointedConstellation;

            if (pointedConstellation) {
                const isActive = this.constellationRenderer.isItemActive(pointedConstellation.id, targetType);

                if (isActive) {
                    // It's already placed -> Highlight it for removal
                    this.constellationRenderer.removePreview();
                    this.constellationRenderer.clearHighlights();
                    this.constellationRenderer.highlightItem(pointedConstellation.id, targetType);
                } else {
                    // It's not placed -> Show ghost preview
                    this.constellationRenderer.clearHighlights();
                    // Update preview currently shows illustration. We might need stick figure preview?
                    // For now, let's just use the same preview logic but maybe tint it?
                    // 'updatePreview' assumes illustration.
                    // If we want stick figure preview, we need to update renderer.updatePreview to handle it OR just show illustration ghost as proxy.
                    // The user said "Stick figure mode... similar to constellation mode".
                    // Showing the stick figure lines as preview would be ideal.
                    // But `updatePreview` is hardcoded for illustrations.
                    // Let's modify `updatePreview` later if needed. For now, using illustration preview is a decent fallback or I can add a quick hack to renderer.
                    // BUT, if I am in Stick Mode, I probably want to see the stick figure as preview.
                    // I'll stick with illustration preview for now to be safe, as it indicates "this is the constellation".
                    this.constellationRenderer.updatePreview(pointedConstellation);
                }

                // Haptic feedback
                if (pointedConstellation !== this.lastConstellation) {
                    if (this.el.components['haptics']) {
                        this.el.components['haptics'].pulse(0.1, 50);
                    }
                }
            } else {
                this.constellationRenderer.removePreview();
                this.constellationRenderer.clearHighlights();
            }

            this.lastConstellation = pointedConstellation;
        }
    },

    remove: function () {
        if (this.checkForRenderer) {
            clearInterval(this.checkForRenderer);
        }
    }
});
