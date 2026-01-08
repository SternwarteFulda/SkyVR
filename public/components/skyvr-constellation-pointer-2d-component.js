AFRAME.registerComponent('constellation-pointer-2d', {
    init: function () {
        this.renderer = null;
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.isTouch = false;

        // Find renderer
        this.findRenderer();

        this.mouseDownPos = new THREE.Vector2();
        this.mouseDownTime = 0;
        this.lastTapTime = 0;

        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);

        const canvas = this.el.sceneEl.canvas;
        if (canvas) {
            this.addListeners(canvas);
        } else {
            this.el.sceneEl.addEventListener('render-target-loaded', () => {
                this.addListeners(this.el.sceneEl.canvas);
            });
        }
    },

    addListeners: function (canvas) {
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        canvas.addEventListener('pointerup', this.onPointerUp);
        canvas.addEventListener('pointerleave', this.onPointerLeave);
        canvas.addEventListener('contextmenu', this.onContextMenu);
    },

    findRenderer: function () {
        const el = document.getElementById('constellation-lines');
        if (el && el.components['constellation-renderer']) {
            this.renderer = el.components['constellation-renderer'];
        } else {
            setTimeout(() => this.findRenderer(), 500);
        }
    },

    onPointerMove: function (e) {
        // Track input type
        if (e.pointerType === 'touch') {
            this.isTouch = true;
        } else {
            this.isTouch = false;
        }

        // Pen hover/move updates coordinates
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // Prevent default on pen to avoid scrolling/panning while interacting
        if (window.currentMode === 'constellation' && e.pointerType === 'pen') {
            e.preventDefault();
        }
    },

    onPointerDown: function (e) {
        if (window.currentMode !== 'constellation' || !this.renderer) return;

        // Prevent default on pen
        if (e.pointerType === 'pen') {
            e.preventDefault();
        }

        // Record start state
        this.mouseDownPos.set(e.clientX, e.clientY);
        this.mouseDownTime = performance.now();
    },

    onPointerUp: function (e) {
        if (window.currentMode !== 'constellation' || !this.renderer) return;
        if (e.target.closest('.infobar-2d') || e.target.closest('.control-panel-2d')) return;

        // Prevent default on pen
        if (e.pointerType === 'pen') {
            e.preventDefault();
        }

        // --- Click vs Drag Detection ---
        const dist = Math.sqrt(Math.pow(e.clientX - this.mouseDownPos.x, 2) + Math.pow(e.clientY - this.mouseDownPos.y, 2));
        const duration = performance.now() - this.mouseDownTime;

        // Drag threshold
        if (dist > 10 || duration > 500) {
            return;
        }

        // If pointer is locked (FPS), mouse is effectively at center
        if (!!document.pointerLockElement) {
            this.mouse.set(0, 0);
        }

        if (e.pointerType === 'pen') {
            // Pen Interaction:
            // Tip (0) -> No action (just hover/preview)
            // Side Button (2) -> Stamp (replaces Right Click Undo for pen)
            if (e.button === 2) {
                this.renderer.placeIllustration();
                if (typeof syncSky === 'function') syncSky();
            }
            // Eraser logic is now handled globally by skyvr-drawing-component
        } else {
            // Mouse/Touch Interaction (Standard):
            // Button 0 (Left) -> Place
            // Button 0 (Left) -> Place OR Double Tap -> Remove
            if (e.button === 0) {
                // Explicitly ignore pen here for double-tap (user request)
                if (e.pointerType === 'pen') return;

                const now = performance.now();
                if (now - this.lastTapTime < 300) {
                    // Double Tap!
                    this.raycaster.setFromCamera(this.mouse, this.el.sceneEl.camera);

                    // Find illustration planes
                    const illustrationMeshes = [];
                    // We know illustrations are children of the renderer
                    if (this.renderer && this.renderer.el) {
                        this.renderer.el.object3D.traverse(child => {
                            if (child.name === 'illustration-plane' || child.dataset?.constellationId) {
                                illustrationMeshes.push(child);
                            }
                        });

                        const intersects = this.raycaster.intersectObjects(illustrationMeshes, true);
                        if (intersects.length > 0) {
                            this.renderer.removeIllustrationByObject(intersects[0].object);
                            if (typeof syncSky === 'function') syncSky();
                        }
                    }
                } else {
                    this.renderer.placeIllustration();
                    if (typeof syncSky === 'function') syncSky();
                }
                this.lastTapTime = now;
            }
            // Button 2 (Right) -> Remove
            else if (e.button === 2) {
                this.renderer.removeLastIllustration();
                if (typeof syncSky === 'function') syncSky();
            }
        }
    },

    onPointerLeave: function (e) {
        // Optional: clear preview or handle exit?
        // For now, standard behavior is fine.
    },

    onContextMenu: function (e) {
        if (window.currentMode === 'constellation') {
            e.preventDefault(); // Prevent right-click menu in constellation mode
        }
    },


    tick: function () {
        // Skip if in VR mode to prevent conflict with 3D controller pointer
        if (this.el.sceneEl.is('vr-mode')) return;

        if (window.currentMode !== 'constellation' || !this.renderer || !this.renderer.loadingComplete) {
            // Ensure preview is removed when not in mode
            if (this.renderer && this.renderer.previewIllustration) {
                this.renderer.removePreview();
            }
            return;
        }

        const camera = this.el.components.camera.camera;
        if (!camera) return;

        // In touch mode or locked pointer mode, always center
        if (this.isTouch || !!document.pointerLockElement) {
            this.mouse.set(0, 0);
        }

        this.raycaster.setFromCamera(this.mouse, camera);
        const pointed = this.renderer.findPointedConstellation(this.raycaster);

        if (pointed) {
            this.renderer.updatePreview(pointed);
        } else {
            this.renderer.removePreview();
        }
    },

    remove: function () {
        const canvas = this.el.sceneEl.canvas;
        if (canvas) {
            canvas.removeEventListener('pointermove', this.onPointerMove);
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.removeEventListener('pointerup', this.onPointerUp);
            canvas.removeEventListener('pointerleave', this.onPointerLeave);
            canvas.removeEventListener('contextmenu', this.onContextMenu);
        }
    }
});
