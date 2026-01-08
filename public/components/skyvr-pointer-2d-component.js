AFRAME.registerComponent('skyvr-pointer-2d', {
    init: function () {
        this.mouse = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.pointerEl = document.getElementById('pointer');
        this.arrowEl = null;
        this.isLMBDown = false;
        this.keys = {};

        window.addEventListener('keydown', (e) => { this.keys[e.key.toLowerCase()] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });

        if (this.el.sceneEl.canvas) {
            this.setupListeners();
        } else {
            this.el.sceneEl.addEventListener('render-target-loaded', () => this.setupListeners());
        }
    },

    setupListeners: function () {
        const canvas = this.el.sceneEl.canvas;
        if (!canvas) return;
        canvas.addEventListener('pointermove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        });
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType !== 'touch' && window.currentMode === 'pointer' && e.button === 0) {
                this.isLMBDown = true;
            }
        });
        window.addEventListener('pointerup', (e) => {
            if (e.button === 0) {
                this.isLMBDown = false;
                if (this.arrowEl) this.arrowEl.object3D.visible = false;
                const cylinder = this.pointerEl && this.pointerEl.components['bottom-origin-cylinder'];
                if (cylinder && cylinder.cylinderMesh) cylinder.cylinderMesh.visible = true;
            }
        });
    },

    tick: function () {
        if (this.el.sceneEl.is('vr-mode')) return;

        const modeActive = window.currentMode === 'pointer';
        const canvas = this.el.sceneEl.canvas;
        if (canvas) {
            if (modeActive) canvas.classList.add('is-pointing');
            else canvas.classList.remove('is-pointing');
        }

        if (!this.el.sceneEl.camera || !modeActive) {
            if (this.pointerEl) this.pointerEl.object3D.visible = false;
            return;
        }

        // 1. Update Pointer (Laser) Transform
        this.raycaster.setFromCamera(this.mouse, this.el.sceneEl.camera);
        const targetWorld = new THREE.Vector3();
        targetWorld.copy(this.raycaster.ray.origin).add(this.raycaster.ray.direction.clone().multiplyScalar(400));

        const handOffset = new THREE.Vector3(0.15, -0.2, -0.4);
        const parent = this.pointerEl.object3D.parent;
        const handWorld = new THREE.Vector3().copy(handOffset).applyMatrix4(this.el.sceneEl.camera.matrixWorld);
        const beamDir = new THREE.Vector3().copy(targetWorld).sub(handWorld).normalize();

        const parentWorldQuat = new THREE.Quaternion();
        parent.getWorldQuaternion(parentWorldQuat);
        const localBeamDir = beamDir.clone().applyQuaternion(parentWorldQuat.invert());

        const pitch = Math.acos(-localBeamDir.y);
        const yaw = Math.atan2(-localBeamDir.x, -localBeamDir.z);

        const localHandPos = handWorld.clone();
        parent.worldToLocal(localHandPos);

        this.pointerEl.object3D.position.copy(localHandPos);
        this.pointerEl.object3D.rotation.set(pitch, yaw, 0);
        this.pointerEl.object3D.visible = this.isLMBDown;

        // 2. Update Arrow Logic
        if (!this.arrowEl) {
            this.arrowEl = this.pointerEl.querySelector('.pointer-arrow');
        }
        if (!this.arrowEl) return;

        let stickX = 0, stickY = 0;
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            const gp = gamepads[i];
            if (gp && gp.axes.length >= 4) {
                if (Math.abs(gp.axes[2]) > 0.1 || Math.abs(gp.axes[3]) > 0.1) {
                    stickX = gp.axes[2]; stickY = gp.axes[3]; break;
                }
            }
        }
        if (stickX === 0 && stickY === 0) {
            if (this.keys['arrowleft'] || this.keys['a']) stickX = -1;
            if (this.keys['arrowright'] || this.keys['d']) stickX = 1;
            if (this.keys['arrowup'] || this.keys['w']) stickY = -1;
            if (this.keys['arrowdown'] || this.keys['s']) stickY = 1;
        }

        const arrowActive = (Math.abs(stickX) > 0.1 || Math.abs(stickY) > 0.1);
        const arrowVisible = this.isLMBDown && arrowActive;

        this.arrowEl.object3D.visible = arrowVisible;

        const cylinder = this.pointerEl.components['bottom-origin-cylinder'];
        if (cylinder && cylinder.cylinderMesh) {
            cylinder.cylinderMesh.visible = this.isLMBDown && !arrowActive;
        }

        if (arrowVisible) {
            const angleDeg = Math.atan2(-stickY, stickX) * (180 / Math.PI) + 180;
            // X: 90 is critical, Y is rotation around beam
            this.arrowEl.object3D.rotation.set(Math.PI / 2, THREE.MathUtils.degToRad(angleDeg - 90), 0);

            const child = this.arrowEl.querySelector('a-entity');
            const mesh = child ? child.getObject3D('mesh') : null;
            if (mesh) {
                mesh.renderOrder = 20000;
                if (mesh.material) {
                    mesh.material.depthTest = false;
                    mesh.material.depthWrite = false;
                    const playerInfo = this.el.sceneEl.querySelector('#camera').components['player-info'];
                    if (playerInfo && playerInfo.data.color) {
                        mesh.material.color.set(playerInfo.data.color);
                    }
                }
            }
        }
    }
});
