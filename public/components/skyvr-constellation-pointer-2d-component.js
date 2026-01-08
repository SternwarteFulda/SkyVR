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

        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        this.onTouchStart = this.onTouchStart.bind(this);

        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mousedown', this.onMouseDown);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('contextmenu', this.onContextMenu);
        window.addEventListener('touchstart', this.onTouchStart);
    },

    findRenderer: function () {
        const el = document.getElementById('constellation-lines');
        if (el && el.components['constellation-renderer']) {
            this.renderer = el.components['constellation-renderer'];
        } else {
            setTimeout(() => this.findRenderer(), 500);
        }
    },

    onMouseMove: function (e) {
        // If we were in touch mode, any mouse movement (from a real mouse) 
        // should switch us back to hover mode.
        if (this.isTouch) {
            this.isTouch = false;
        }

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },

    onMouseDown: function (e) {
        if (window.currentMode !== 'constellation' || !this.renderer) return;

        // Record start state for click vs drag detection
        this.mouseDownPos.set(e.clientX, e.clientY);
        this.mouseDownTime = performance.now();
    },

    onMouseUp: function (e) {
        if (window.currentMode !== 'constellation' || !this.renderer) return;

        // Only handle clicks on the canvas, not on UI
        if (e.target.closest('.infobar-2d') || e.target.closest('.control-panel-2d')) return;

        // --- Click vs Drag Detection ---
        const dist = Math.sqrt(Math.pow(e.clientX - this.mouseDownPos.x, 2) + Math.pow(e.clientY - this.mouseDownPos.y, 2));
        const duration = performance.now() - this.mouseDownTime;

        // If moved more than 10 pixels or held for more than 500ms, it's a drag/hold, not a stamp click
        if (dist > 10 || duration > 500) {
            return;
        }

        // Check if cursor is locked (Camera mode) or not
        const isPointerLocked = !!document.pointerLockElement;

        // If pointer is locked, mouse is effectively at center
        if (isPointerLocked) {
            this.mouse.set(0, 0);
        }

        // Left click stamps
        if (e.button === 0) {
            this.renderer.placeIllustration();
            if (typeof syncSky === 'function') syncSky();
        }
        // Right click undos (A button equivalent)
        else if (e.button === 2) {
            this.renderer.removeLastIllustration();
            if (typeof syncSky === 'function') syncSky();
        }
    },

    onContextMenu: function (e) {
        if (window.currentMode === 'constellation') {
            e.preventDefault(); // Prevent right-click menu in constellation mode
        }
    },

    onTouchStart: function (e) {
        this.isTouch = true;
    },

    tick: function () {
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
        window.removeEventListener('mousemove', this.onMouseMove);
        window.removeEventListener('mousedown', this.onMouseDown);
        window.removeEventListener('mouseup', this.onMouseUp);
        window.removeEventListener('contextmenu', this.onContextMenu);
        window.removeEventListener('touchstart', this.onTouchStart);
    }
});
