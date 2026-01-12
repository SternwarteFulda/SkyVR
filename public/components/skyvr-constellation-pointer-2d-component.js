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
        if (e.pointerType === 'touch') {
            this.isTouch = true;
        } else {
            this.isTouch = false;
        }

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        if ((window.currentMode === 'constellation' || window.currentMode === 'identify') && e.pointerType === 'pen') {
            e.preventDefault();
        }
    },

    onPointerDown: function (e) {
        const currentMode = window.currentMode || 'draw';
        const isConst = currentMode === 'constellation';
        const isStick = currentMode === 'stickfigure';
        const isIdentify = currentMode === 'identify';

        if ((!isConst && !isStick && !isIdentify) || !this.renderer) return;

        if (e.pointerType === 'pen') {
            e.preventDefault();
        }

        this.mouseDownPos.set(e.clientX, e.clientY);
        this.mouseDownTime = performance.now();
    },

    onPointerUp: function (e) {
        const currentMode = window.currentMode || 'draw';
        const isConst = currentMode === 'constellation';
        const isStick = currentMode === 'stickfigure';
        const isIdentify = currentMode === 'identify';

        if ((!isConst && !isStick && !isIdentify) || !this.renderer) return;
        if (e.target.closest('.infobar-2d') || e.target.closest('.control-panel-2d')) return;

        if (e.pointerType === 'pen') {
            e.preventDefault();
        }

        const dist = Math.sqrt(Math.pow(e.clientX - this.mouseDownPos.x, 2) + Math.pow(e.clientY - this.mouseDownPos.y, 2));
        const duration = performance.now() - this.mouseDownTime;

        if (dist > 10 || duration > 500) {
            return;
        }

        if (!!document.pointerLockElement) {
            this.mouse.set(0, 0);
        }

        if (e.pointerType === 'pen') {
            if (e.button === 2) {
                if (isIdentify) {
                    const rightController = document.getElementById('right-controller');
                    if (rightController && rightController.components['identify']) {
                        rightController.components['identify'].stampInfo();
                        if (typeof syncSky === 'function') syncSky();
                    }
                } else {
                    this.renderer.placeIllustration();
                    if (typeof syncSky === 'function') syncSky();
                }
            }
        } else {
            if (e.button === 0) {
                const now = performance.now();
                if (now - this.lastTapTime < 300) {
                    // Double Tap handling
                    this.raycaster.setFromCamera(this.mouse, this.el.sceneEl.camera);
                    const illustrationMeshes = [];
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
                    if (isIdentify) {
                        const rightController = document.getElementById('right-controller');
                        if (rightController && rightController.components['identify']) {
                            rightController.components['identify'].on2DClick(this.mouse);
                            if (typeof syncSky === 'function') syncSky();
                        }
                    } else {
                        const targetType = (window.currentMode === 'stickfigure') ? 'stick' : 'illustration';
                        this.raycaster.setFromCamera(this.mouse, this.el.sceneEl.camera);
                        const pointed = this.renderer.findPointedConstellation(this.raycaster);

                        if (pointed) {
                            const isActive = this.renderer.isItemActive(pointed.id, targetType);
                            if (isActive) {
                                this.renderer.removeItemById(pointed.id, targetType);
                            } else {
                                this.renderer.placeItem(targetType);
                            }
                            if (typeof syncSky === 'function') syncSky();
                        }
                    }
                }
                this.lastTapTime = now;
            }
            else if (e.button === 2) {
                if (isIdentify) {
                    const rightController = document.getElementById('right-controller');
                    if (rightController && rightController.components['identify']) {
                        rightController.components['identify'].removeLastInfo();
                        if (typeof syncSky === 'function') syncSky();
                    }
                } else {
                    this.renderer.removeLastIllustration();
                    if (typeof syncSky === 'function') syncSky();
                }
            }
        }
    },

    onPointerLeave: function (e) { },

    onContextMenu: function (e) {
        if (window.currentMode === 'constellation' || window.currentMode === 'identify') {
            e.preventDefault();
        }
    },

    tick: function () {
        if (!this.renderer || !this.renderer.loadingComplete) return;

        if (this.el.sceneEl.is('vr-mode')) {
            if (this.currentConstellation) {
                this.renderer.removePreview();
                this.renderer.clearHighlights();
                this.currentConstellation = null;
            }
            return;
        }

        const currentMode = window.currentMode || 'draw';
        const isConstMode = currentMode === 'constellation';
        const isStickMode = currentMode === 'stickfigure';
        const isIdentifyMode = currentMode === 'identify';

        if (!isConstMode && !isStickMode && !isIdentifyMode) {
            if (this.currentConstellation) {
                this.renderer.removePreview();
                this.renderer.clearHighlights();
                this.currentConstellation = null;
            }
            return;
        }

        if (this.isTouch || !!document.pointerLockElement) {
            this.mouse.set(0, 0);
        }

        if (isIdentifyMode) return; // Identify component handles its own preview/tick

        const targetType = isStickMode ? 'stick' : 'illustration';
        this.raycaster.setFromCamera(this.mouse, this.el.sceneEl.camera);
        const pointed = this.renderer.findPointedConstellation(this.raycaster);

        if (pointed !== this.currentConstellation) {
            this.currentConstellation = pointed;
            if (pointed) {
                if (this.renderer.isItemActive(pointed.id, targetType)) {
                    this.renderer.removePreview();
                    this.renderer.clearHighlights();
                    this.renderer.highlightItem(pointed.id, targetType);
                } else {
                    this.renderer.clearHighlights();
                    this.renderer.updatePreview(pointed);
                }
            } else {
                this.renderer.removePreview();
                this.renderer.clearHighlights();
            }
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
