AFRAME.registerComponent('skyvr-pointer-2d', {
    init: function () {
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.pointerEl = document.getElementById('pointer');
        this.isLMBDown = false;

        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);

        // Wait for canvas
        if (this.el.sceneEl.canvas) {
            this.setupListeners();
        } else {
            this.el.sceneEl.addEventListener('render-target-loaded', () => this.setupListeners());
        }

        // Initialize state
        this.resetParentTransform();
    },

    setupListeners: function () {
        const canvas = this.el.sceneEl.canvas;
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerdown', this.onPointerDown);
        window.addEventListener('pointerup', this.onPointerUp);
    },

    resetParentTransform: function () {
        if (this.pointerEl && this.pointerEl.object3D.parent) {
            const parent = this.pointerEl.object3D.parent;
            parent.position.set(0, 0, 0);
            parent.rotation.set(0, 0, 0);
            parent.scale.set(1, 1, 1);
            parent.updateMatrix();
            parent.updateMatrixWorld(true);
        }
    },

    onPointerMove: function (e) {
        const canvas = this.el.sceneEl.canvas;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    },

    onPointerDown: function (e) {
        if (e.pointerType === 'touch') return;
        if (window.currentMode === 'pointer' && e.button === 0) {
            this.isLMBDown = true;
        }
    },

    onPointerUp: function (e) {
        if (e.button === 0) {
            this.isLMBDown = false;
        }
    },

    updateCursor: function (modeActive) {
        const canvas = this.el.sceneEl.canvas;
        if (!canvas) return;

        if (modeActive) {
            canvas.classList.add('is-pointing');
        } else {
            canvas.classList.remove('is-pointing');
        }
    },

    tick: function () {
        if (this.el.sceneEl.is('vr-mode')) return;

        const modeActive = window.currentMode === 'pointer';
        this.updateCursor(modeActive);

        if (!!document.pointerLockElement) {
            if (this.pointerEl && this.pointerEl.getAttribute('visible')) {
                this.pointerEl.setAttribute('visible', false);
            }
            window.isPointerActive = false;
            return;
        }

        const activeCamera = this.el.sceneEl.camera;
        if (!activeCamera || !modeActive) {
            if (this.pointerEl && this.pointerEl.getAttribute('visible')) {
                this.pointerEl.setAttribute('visible', false);
            }
            window.isPointerActive = false;
            return;
        }

        // CRITICAL: Update transform EVERY frame to stay warm
        this.updatePointerTransform(activeCamera);

        // Visibility logic
        const shouldBeShow = this.isLMBDown;
        if (this.pointerEl) {
            const isVisible = !!this.pointerEl.getAttribute('visible');
            if (isVisible !== shouldBeShow) {
                this.pointerEl.setAttribute('visible', shouldBeShow);
            }
        }
        window.isPointerActive = shouldBeShow;
    },

    updatePointerTransform: function (activeCamera) {
        if (!this.pointerEl) return;

        // 1. Get Mouse Ray in World Space
        this.raycaster.setFromCamera(this.mouse, activeCamera);

        // Find target point at 400m
        const targetWorld = new THREE.Vector3();
        targetWorld.copy(this.raycaster.ray.origin).add(this.raycaster.ray.direction.clone().multiplyScalar(400));

        // 2. Determine "Hand" world position
        // Bring hand closer to eye center (0.15, -0.2, -0.4) to minimize 2D parallax
        const handOffset = new THREE.Vector3(0.15, -0.2, -0.4);

        // Ensure parent and rig matrices are up to date
        const parent = this.pointerEl.object3D.parent;
        if (parent) {
            parent.position.set(0, 0, 0);
            parent.rotation.set(0, 0, 0);
            parent.scale.set(1, 1, 1);
            parent.updateMatrix();
            parent.updateMatrixWorld(true);
        }

        // Calculate hand position in world space
        const handWorld = new THREE.Vector3();
        handWorld.copy(handOffset).applyMatrix4(activeCamera.matrixWorld);

        // 3. Direction from Hand to Target (World Space)
        const beamDir = new THREE.Vector3();
        beamDir.copy(targetWorld).sub(handWorld).normalize();

        // 4. Convert beamDir to Parent's Local Space for Rotation
        const parentWorldQuat = new THREE.Quaternion();
        parent.getWorldQuaternion(parentWorldQuat);
        const invParentQuat = parentWorldQuat.invert();

        const localBeamDir = beamDir.clone().applyQuaternion(invParentQuat);

        // 5. Calculate local pitch/yaw for -Y cylinder
        const pitch = Math.acos(-localBeamDir.y) * (180 / Math.PI);
        const yaw = Math.atan2(-localBeamDir.x, -localBeamDir.z) * (180 / Math.PI);

        // 6. Convert handWorld to Parent's Local Space
        const localHandPos = handWorld.clone();
        parent.worldToLocal(localHandPos);

        // 7. Apply!
        this.pointerEl.setAttribute('position', localHandPos);
        this.pointerEl.setAttribute('bottom-origin-cylinder', 'rotation', { x: pitch, y: yaw, z: 0 });

        // Final object matrix sync
        this.pointerEl.object3D.updateMatrix();
    },

    remove: function () {
        const canvas = this.el.sceneEl.canvas;
        if (canvas) {
            canvas.removeEventListener('pointermove', this.onPointerMove);
            canvas.removeEventListener('pointerdown', this.onPointerDown);
            canvas.classList.remove('is-pointing');
        }
        window.removeEventListener('pointerup', this.onPointerUp);
    }
});
