AFRAME.registerComponent('stamp', {
    init: function () {
        this.starfield = null;
        this.currentMode = 'draw';
        this.magLimit = null; // Will be set from starfield
        this.stampedInfos = [];
        this.previewEl = document.createElement('a-entity');
        this.previewEl.setAttribute('id', 'stamp-preview');
        this.previewEl.setAttribute('visible', false);
        this.el.sceneEl.appendChild(this.previewEl);

        // Crosshair (like Identify Mode)
        this.crosshairEl = document.createElement('a-entity');
        this.crosshairEl.setAttribute('geometry', 'primitive: ring; radiusInner: 0.01; radiusOuter: 0.015');
        this.crosshairEl.setAttribute('material', 'shader: flat; color: white; opacity: 0.5; transparent: true; depthTest: false');
        this.previewEl.appendChild(this.crosshairEl);

        // Shape preview
        this.shapePreviewEl = document.createElement('a-entity');
        this.previewEl.appendChild(this.shapePreviewEl);

        this.currentStampShape = 'star';
        this.buildPreviewShape();

        this.previewOpacity = 0;
        this.targetPreviewOpacity = 0;

        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1000;

        // Wait for starfield to be ready
        this.checkForStarfield = setInterval(() => {
            const starfieldEl = document.getElementById('stars-point-cloud');
            if (starfieldEl && starfieldEl.components['starfield']) {
                this.starfield = starfieldEl.components['starfield'];
                if (this.starfield.magLimit !== undefined) {
                    this.magLimit = this.starfield.magLimit;
                }
                clearInterval(this.checkForStarfield);
                console.log('Stamp component connected to starfield');
            }
        }, 100);

        this.onModeChange = (e) => {
            this.currentMode = window.currentMode;
            if (this.currentMode !== 'stamp') {
                if (this.el.sceneEl.canvas) {
                    this.el.sceneEl.canvas.classList.remove('is-pointing');
                }
                this.targetPreviewOpacity = 0;
            } else {
                if (this.el.sceneEl.canvas && !this.el.sceneEl.is('vr-mode')) {
                    this.el.sceneEl.canvas.classList.add('is-pointing');
                }
                console.log("Stamp: Mode set to 'stamp' - sweeping enabled");
            }
        };
        window.addEventListener('mode-change', this.onModeChange);

        this.wasStampActive = false;
        this.isTouch = false;
        this.nearestObj = null;
        this.lastNearestName = null;
        this.mouse = new THREE.Vector2();

        window.addEventListener('pointermove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.isTouch = (e.pointerType === 'touch');
        });

        // VR Controller Inputs
        this.stampShape = this.stampShape.bind(this);
        this.removeLastShape = this.removeLastShape.bind(this);

        // Inputs are handled by global handlers in index.html (like Identify mode)
    },

    tick: function (time, dt) {
        if (!dt) return;
        if (!this.starfield || window.currentMode !== 'stamp') {
            if (this.previewOpacity > 0.01) {
                this.targetPreviewOpacity = 0;
                this.wasStampActive = false;
            } else {
                return;
            }
        }

        const isStampMode = window.currentMode === 'stamp';

        if (!isStampMode) {
            this.targetPreviewOpacity = 0;
            this.lastNearestName = null;
            this.nearestObj = null;
            this.wasStampActive = false;
        } else if (!this.wasStampActive) {
            console.log("Stamp: Mode active - Ready to sweep");
            this.wasStampActive = true;
        }

        if (isStampMode && this.starfield) {
            const isVR = this.el.sceneEl.is('vr-mode');
            let worldStart, worldDir;

            if (isVR) {
                const controllerPos = new THREE.Vector3();
                const controllerQuat = new THREE.Quaternion();
                this.el.object3D.getWorldPosition(controllerPos);
                this.el.object3D.getWorldQuaternion(controllerQuat);

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

                worldStart = rayOriginLocal.clone().applyQuaternion(controllerQuat).add(controllerPos);
                worldDir = rayDirectionLocal.clone().applyQuaternion(controllerQuat).normalize();
            } else {
                if (!this.el.sceneEl.camera) return;
                const pointMouse = this.isTouch ? new THREE.Vector2(0, 0) : this.mouse;
                this.raycaster.setFromCamera(pointMouse, this.el.sceneEl.camera);
                worldStart = this.raycaster.ray.origin.clone();
                worldDir = this.raycaster.ray.direction.clone();
            }

            const skyOrigin = new THREE.Vector3(0, 0, 0);
            const L = worldStart.clone().sub(skyOrigin);
            const b = L.dot(worldDir);
            const c = L.dot(L) - (400 * 400);
            const discriminant = b * b - c;

            let hitPointWorld;
            if (discriminant >= 0) {
                const t = -b + Math.sqrt(discriminant);
                hitPointWorld = worldStart.clone().add(worldDir.clone().multiplyScalar(t));
            } else {
                hitPointWorld = worldStart.clone().add(worldDir.clone().multiplyScalar(400));
            }

            this.hitPointWorld = hitPointWorld;
            const hitPoint = this.starfield.el.object3D.worldToLocal(hitPointWorld.clone());

            let nearestObj = null;
            let minDistance = 30.0;

            // Check Planets
            if (this.starfield.planetsData) {
                const bodyList = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
                for (let planet of this.starfield.planetsData) {
                    // Only snap to major bodies in the list
                    if (!bodyList.includes(planet.name)) continue;

                    if (!planet.currentPosition) continue;
                    const planetPos = planet.currentPosition;
                    const comparePoint = planetPos.clone().normalize().multiplyScalar(400);
                    const dist = hitPoint.distanceTo(comparePoint);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestObj = {
                            name: planet.name,
                            position: planetPos.clone(),
                            type: 'planet'
                        };
                    }
                }
            }

            // Check Stars
            if (this.starfield.starsArray && this.starfield.starsArray.length > 0) {
                for (let star of this.starfield.starsArray) {
                    if (!star.position) continue;
                    // Limit stamping to naked-eye visible stars (matches shader non-bino limit)
                    if (star.mag > this.magLimit) continue;

                    const starPos = star.position.clone().normalize().multiplyScalar(400);
                    const dist = hitPoint.distanceTo(starPos);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestObj = {
                            name: star.name,
                            position: star.position.clone(),
                            type: 'star'
                        };
                    }
                }
            }

            this.nearestObj = nearestObj;
            if (nearestObj) {
                this.targetPreviewOpacity = 0.6;
                this.previewEl.setAttribute('visible', true);

                const worldStarPos = this.starfield.el.object3D.localToWorld(nearestObj.position.clone().normalize().multiplyScalar(397));
                this.previewEl.setAttribute('position', worldStarPos);

                const camWorldPos = new THREE.Vector3();
                if (this.el.sceneEl.camera) {
                    this.el.sceneEl.camera.getWorldPosition(camWorldPos);
                    this.previewEl.object3D.lookAt(camWorldPos);
                }

                if (this.lastNearestName !== nearestObj.name) {
                    if (this.el.components['haptics']) {
                        this.el.components['haptics'].pulse(0.2, 40);
                    }
                    this.lastNearestName = nearestObj.name;
                }
            } else {
                this.targetPreviewOpacity = 0.3;
                this.previewEl.setAttribute('visible', true);

                const worldHit = hitPointWorld.clone().normalize().multiplyScalar(397);
                this.previewEl.setAttribute('position', worldHit);

                if (this.el.sceneEl.camera) {
                    const camWorldPos = new THREE.Vector3();
                    this.el.sceneEl.camera.getWorldPosition(camWorldPos);
                    this.previewEl.object3D.lookAt(camWorldPos);
                }

                this.lastNearestName = null;
            }
        }

        // Apply opacity updates
        this.previewOpacity = this.targetPreviewOpacity;

        this.crosshairEl.setAttribute('material', 'opacity', this.previewOpacity);

        if (this.shapePreviewMesh && this.shapePreviewMesh.material) {
            this.shapePreviewMesh.material.opacity = this.previewOpacity;

            // Sync with player color for preview
            if (isStampMode && this.previewOpacity > 0.1) {
                const playerInfo = document.querySelector('[player-info]');
                if (playerInfo) {
                    const data = playerInfo.getAttribute('player-info');
                    if (data && data.color) {
                        this.shapePreviewMesh.material.color.set(data.color);
                    }
                }
            }
        }

        if (this.previewOpacity < 0.01 && !isStampMode) {
            this.previewEl.setAttribute('visible', false);
        }

        // Force cursor class on every tick if active (to override look-controls)
        if (isStampMode && this.el.sceneEl.canvas && !this.el.sceneEl.is('vr-mode')) {
            if (this.el.sceneEl.canvas.className.indexOf('is-pointing') === -1) {
                this.el.sceneEl.canvas.classList.add('is-pointing');
            }
        }
    },

    on2DClick: function (mouse) {
        if (!this.starfield || window.currentMode !== 'stamp') return;

        const cam = this.el.sceneEl.camera;
        if (!cam) return;

        const pointMouse = this.isTouch ? new THREE.Vector2(0, 0) : mouse;
        this.raycaster.setFromCamera(pointMouse, cam);

        if (this.nearestObj) {
            this.stampShape();
        }
    },

    stampShape: function () {
        if (window.currentMode !== 'stamp' || !this.nearestObj) {
            if (!this.nearestObj) console.log("Stamp: No object to stamp on");
            return;
        }

        let localPos = this.nearestObj.position.clone();
        localPos.normalize().multiplyScalar(398);

        // Get player color
        let color = '#FFFF00';
        const playerInfo = document.querySelector('[player-info]');
        if (playerInfo) {
            const data = playerInfo.getAttribute('player-info');
            if (data && data.color) color = data.color;
        }

        const newShape = {
            shape: this.currentStampShape,
            color: color,
            position: { x: localPos.x, y: localPos.y, z: localPos.z }
        };

        const skyMaster = document.getElementById('sky-master');
        if (skyMaster && skyMaster.components['sky-state']) {
            if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
                if (!NAF.utils.isMine(skyMaster)) {
                    NAF.utils.takeOwnership(skyMaster);
                }
            }
            const state = skyMaster.getAttribute('sky-state');
            let shapes = [];
            try {
                shapes = JSON.parse(state.stampedShapes || '[]');
            } catch (e) { shapes = []; }

            // Check for duplicates
            const exists = shapes.some(s => {
                const p = new THREE.Vector3(s.position.x, s.position.y, s.position.z);
                return p.distanceTo(localPos) < 1.0 && s.shape === newShape.shape;
            });

            if (exists) {
                console.log("Stamp: Shape already exists at location");
                return;
            }

            shapes.push(newShape);
            console.log("Stamp: Adding shape, count:", shapes.length);
            skyMaster.setAttribute('sky-state', 'stampedShapes', JSON.stringify(shapes));

            // Force immediate local update
            if (typeof syncStampedShapes === 'function') {
                syncStampedShapes(shapes);
            }
        }

        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.5, 30);
        }
    },

    setStampShape: function (shape) {
        this.currentStampShape = 'star'; // Always star
        this.buildPreviewShape();
    },

    buildPreviewShape: function () {
        if (this.shapePreviewMesh) {
            this.shapePreviewEl.object3D.remove(this.shapePreviewMesh);
        }

        const radius = 5;
        const shape = new THREE.Shape();
        const vertices = [];
        const points = 5;
        const outerRadius = radius;
        const innerRadius = radius * 0.4;

        for (let i = 0; i < points * 2; i++) {
            const r = (i % 2 === 0) ? outerRadius : innerRadius;
            const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
            vertices.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
        }

        const roundedness = 0.4;
        shape.moveTo(vertices[1].x, vertices[1].y);

        for (let i = 2; i <= vertices.length + 1; i++) {
            const currIdx = i % vertices.length;
            const curr = vertices[currIdx];

            if (currIdx % 2 !== 0) {
                // Inner vertex: Sharp
                shape.lineTo(curr.x, curr.y);
            } else {
                // Outer vertex: Rounded
                const prevIdx = (i - 1) % vertices.length;
                const nextIdx = (i + 1) % vertices.length;
                const prev = vertices[prevIdx];
                const next = vertices[nextIdx];

                const pA = new THREE.Vector2().lerpVectors(prev, curr, 1 - roundedness);
                shape.lineTo(pA.x, pA.y);

                const pB = new THREE.Vector2().lerpVectors(curr, next, roundedness);
                shape.quadraticCurveTo(curr.x, curr.y, pB.x, pB.y);
            }
        }

        const shapePoints = shape.getPoints(12);
        const points3D = shapePoints.map(p => new THREE.Vector3(p.x, p.y, 0));
        const geometry = new THREE.BufferGeometry().setFromPoints(points3D);

        const material = new THREE.LineBasicMaterial({
            color: '#FFFF00', // Will be updated in tick
            linewidth: 2,
            transparent: true,
            opacity: 1.0, // Outline usually needs higher base opacity but handled by tick
            depthTest: false, // Ensure visible on top
            depthWrite: false,
            fog: false
        });

        this.shapePreviewMesh = new THREE.LineLoop(geometry, material);
        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.shapePreviewMesh.renderOrder = renderSystem ? renderSystem.order['ui'] : 7;
        this.shapePreviewEl.object3D.add(this.shapePreviewMesh);
    },

    removeLastShape: function () {
        const skyMaster = document.getElementById('sky-master');
        if (skyMaster && skyMaster.components['sky-state']) {
            if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
                if (!NAF.utils.isMine(skyMaster)) {
                    NAF.utils.takeOwnership(skyMaster);
                }
            }
            const state = skyMaster.getAttribute('sky-state');
            let shapes = [];
            try {
                shapes = JSON.parse(state.stampedShapes || '[]');
            } catch (e) { shapes = []; }

            if (shapes.length > 0) {
                shapes.pop();
                console.log("Stamp: Removed last shape, count:", shapes.length);
                skyMaster.setAttribute('sky-state', 'stampedShapes', JSON.stringify(shapes));

                // Force immediate local update
                if (typeof syncStampedShapes === 'function') {
                    syncStampedShapes(shapes);
                }
            }
        }
    },

    removeAllShapes: function () {
        const skyMaster = document.getElementById('sky-master');
        if (skyMaster && skyMaster.components['sky-state']) {
            if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
                if (!NAF.utils.isMine(skyMaster)) {
                    NAF.utils.takeOwnership(skyMaster);
                }
            }
            console.log("Stamp: Clearing all shapes");
            skyMaster.setAttribute('sky-state', 'stampedShapes', '[]');

            // Force immediate local update
            if (typeof syncStampedShapes === 'function') {
                syncStampedShapes([]);
            }
        }
    }
});

// Helper for UI
window.setStampShape = function (shape) {
    const el = document.querySelector('[stamp]');
    if (el && el.components.stamp) {
        el.components.stamp.setStampShape(shape);
    }
};
