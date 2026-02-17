AFRAME.registerComponent('identify', {
    init: function () {
        this.starfield = null;
        this.currentMode = 'draw';
        this.magLimit = null; // Will be set from starfield
        this.stampedInfos = [];
        this.previewEl = document.createElement('a-entity');
        this.previewEl.setAttribute('id', 'identify-preview');
        this.previewEl.setAttribute('visible', false);
        this.el.sceneEl.appendChild(this.previewEl);

        // Crosshair visual
        this.crosshairEl = document.createElement('a-plane');
        this.crosshairEl.setAttribute('width', 15.0);
        this.crosshairEl.setAttribute('height', 15.0);
        this.crosshairEl.setAttribute('material', {
            src: '#asset-crosshair',
            transparent: true,
            shader: 'flat',
            fog: false,
            depthWrite: false,
            depthTest: true,
            color: '#00FF00',
            opacity: 0 // Start at 0 for fade in
        });
        this.crosshairEl.addEventListener('materialtextureloaded', () => {
            const mesh = this.crosshairEl.getObject3D('mesh');
            if (mesh && mesh.material && mesh.material.map) {
                mesh.material.map.anisotropy = 16;
                mesh.material.map.magFilter = THREE.LinearFilter;
                mesh.material.map.minFilter = THREE.LinearMipmapLinearFilter; // Use mipmaps for anti-aliased downscaling
                mesh.material.map.generateMipmaps = true; // Ensure mipmaps are generated
                mesh.material.map.needsUpdate = true;
            }
        });
        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.crosshairEl.setAttribute('render-order', renderSystem ? 'ui' : '7');
        this.crosshairEl.setAttribute('animation__pulse', {
            property: 'scale',
            from: '1 1 1',
            to: '1.2 1.2 1.2',
            dir: 'alternate',
            loop: true,
            dur: 1500,
            easing: 'easeInOutSine'
        });
        this.previewEl.appendChild(this.crosshairEl);

        this.previewOpacity = 0;
        this.targetPreviewOpacity = 0.15;
        this.labelOpacity = 0;
        this.targetLabelOpacity = 0.5;

        // Text label (now a child of previewEl for perfect snapping)
        this.labelEl = document.createElement('a-entity');
        this.labelEl.setAttribute('id', 'identify-preview-label');
        this.labelEl.setAttribute('position', '0 18 0');
        this.labelEl.setAttribute('custom-fogless-text', {
            fontSize: 80,
            textColor: '#FFFFFF',
            worldScale: 0.1,
            fixedWidth: 800,
            depthTest: true,
            depthWrite: false, // Ensure we don't occlude things behind us via depth buffer
            renderOrder: this.el.sceneEl.systems['render-order'] ? this.el.sceneEl.systems['render-order'].order['ui'] : 7,
            opacity: 0 // Start at 0
        });
        this.previewEl.appendChild(this.labelEl);

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
                console.log('Identify component connected to starfield');
            }
        }, 100);

        this.onModeChange = (e) => {
            this.currentMode = window.currentMode;
            if (this.currentMode !== 'identify') {
                if (this.el.sceneEl.canvas) {
                    this.el.sceneEl.canvas.classList.remove('is-pointing');
                }
                this.targetPreviewOpacity = 0;
                this.targetLabelOpacity = 0;
            } else {
                if (this.el.sceneEl.canvas && !this.el.sceneEl.is('vr-mode')) {
                    this.el.sceneEl.canvas.classList.add('is-pointing');
                }
                console.log("Identify: Mode set to 'identify' - sweeping enabled");
            }
        };
        window.addEventListener('mode-change', this.onModeChange);

        this.wasIdentifyActive = false;
        this.isTouch = false;
        this.nearestObj = null;
        this.lastNearestName = null;
        this.mouse = new THREE.Vector2();

        window.addEventListener('pointermove', (e) => {
            this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
            this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.isTouch = (e.pointerType === 'touch');
        });

    },

    tick: function (time, dt) {
        if (!dt) return;
        if (!this.starfield || window.currentMode !== 'identify') {
            if (this.previewOpacity > 0.01 || this.labelOpacity > 0.01) {
                this.targetPreviewOpacity = 0;
                this.targetLabelOpacity = 0;
                this.wasIdentifyActive = false;
            } else {
                return;
            }
        }

        const isIdentifyMode = window.currentMode === 'identify';

        if (!isIdentifyMode) {
            // If not in identify mode, ensure targets are 0 and clear state
            this.targetPreviewOpacity = 0;
            this.targetLabelOpacity = 0;
            this.lastNearestName = null;
            this.nearestObj = null;
            this.wasIdentifyActive = false; // Ensure this is reset
        } else if (!this.wasIdentifyActive) {
            console.log("Identify: Mode active - Ready to sweep");
            this.wasIdentifyActive = true;
        }

        // Only perform raycasting and object search if in identify mode AND starfield is ready
        if (isIdentifyMode && this.starfield) {
            const isVR = this.el.sceneEl.is('vr-mode');
            let worldStart, worldDir;

            if (isVR) {
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

                worldStart = rayOriginLocal.clone().applyQuaternion(controllerQuat).add(controllerPos);
                worldDir = rayDirectionLocal.clone().applyQuaternion(controllerQuat).normalize();
            } else {
                // 2D Mode: Use camera ray based on mouse or center of FOV for touch
                if (!this.el.sceneEl.camera) return;

                // If touch-dragging, use center of screen (0,0)
                const pointMouse = this.isTouch ? new THREE.Vector2(0, 0) : this.mouse;
                this.raycaster.setFromCamera(pointMouse, this.el.sceneEl.camera);

                worldStart = this.raycaster.ray.origin.clone();
                worldDir = this.raycaster.ray.direction.clone();
            }

            // 1. Find pointing direction in celestial coordinates (radius 400 to match stars)
            const skyOrigin = new THREE.Vector3(0, 0, 0);
            const L = worldStart.clone().sub(skyOrigin);
            const b = L.dot(worldDir);
            const c = L.dot(L) - (400 * 400);
            const discriminant = b * b - c;

            // Calculate hit point regardless of whether it hits the exact detection sphere
            // If discriminant < 0, we can project to the sphere radius anyway for crosshair consistency
            let hitPointWorld;
            if (discriminant >= 0) {
                const t = -b + Math.sqrt(discriminant);
                hitPointWorld = worldStart.clone().add(worldDir.clone().multiplyScalar(t));
            } else {
                // Fallback: project out to radius
                hitPointWorld = worldStart.clone().add(worldDir.clone().multiplyScalar(400));
            }

            this.hitPointWorld = hitPointWorld; // Save for fading logic

            // Transform hit point to starfield local space (needed for nearest object search)
            const hitPoint = this.starfield.el.object3D.worldToLocal(hitPointWorld.clone());

            // Find nearest object
            let nearestObj = null;
            let minDistance = 30.0; // Increased radius to handle parallax and easier selection (approx 4 degrees)

            // Check Planets (including Moon)
            if (this.starfield.planetsData) {
                const bodyList = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
                for (let planet of this.starfield.planetsData) {
                    // Only snap to major bodies in the list
                    if (!bodyList.includes(planet.name)) continue;

                    if (!planet.currentPosition) continue;
                    const planetPos = planet.currentPosition;
                    // Compare at same radius for distance check
                    const comparePoint = planetPos.clone().normalize().multiplyScalar(400);
                    const dist = hitPoint.distanceTo(comparePoint);
                    if (dist < minDistance) {
                        minDistance = dist;
                        let infoStr = (planet.name === 'Sun') ? 'Star' : 'Planet';
                        if (planet.name === 'Moon') infoStr = '';

                        if (planet.mag !== undefined && planet.mag !== null) {
                            infoStr = `${infoStr ? infoStr + ', ' : ''}Mag ${planet.mag.toFixed(1)}`;
                        }

                        nearestObj = {
                            name: planet.name,
                            info: infoStr,
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
                    // Limit identifying to naked-eye visible stars (matches shader non-bino limit)
                    if (star.mag > this.magLimit) continue;

                    // Compare at same radius (400) for detection
                    const starPos = star.position.clone().normalize().multiplyScalar(400);
                    const dist = hitPoint.distanceTo(starPos);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestObj = {
                            name: star.name,
                            info: `Star, Mag: ${star.mag.toFixed(1)}${star.constellation ? ', ' + star.constellation : ''}`,
                            position: star.position.clone(),
                            type: 'star'
                        };
                    }
                }
            }

            this.nearestObj = nearestObj;
            if (nearestObj) {
                this.targetPreviewOpacity = 0.6;
                this.targetLabelOpacity = 0.5;
                this.previewEl.setAttribute('visible', true);
                this.labelEl.setAttribute('visible', true);

                // Move to 397 to hover slightly in front of stamped labels (398)
                const worldStarPos = this.starfield.el.object3D.localToWorld(nearestObj.position.clone().normalize().multiplyScalar(397));
                this.previewEl.setAttribute('position', worldStarPos);

                const labelText = nearestObj.info ? `${nearestObj.name}\n${nearestObj.info}` : nearestObj.name;
                this.labelEl.setAttribute('custom-fogless-text', 'value', labelText);

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
                this.targetPreviewOpacity = 0.2;
                this.previewEl.setAttribute('visible', true);

                // Also project non-target crosshair to 397 for consistency
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

        // Apply smooth updates
        const lerpFactor = 1 - Math.pow(0.001, dt / 1000);
        this.previewOpacity += (this.targetPreviewOpacity - this.previewOpacity) * lerpFactor;
        this.labelOpacity += (this.targetLabelOpacity - this.labelOpacity) * lerpFactor;

        this.crosshairEl.setAttribute('material', 'opacity', this.previewOpacity);
        if (this.labelEl) {
            this.labelEl.setAttribute('custom-fogless-text', 'opacity', this.labelOpacity);
            this.labelEl.setAttribute('visible', this.labelOpacity > 0.01);
        }

        // Hide if fully hidden
        if (this.previewOpacity < 0.01 && this.targetLabelOpacity === 0 && !isIdentifyMode) {
            this.previewEl.setAttribute('visible', false);
            this.labelEl.setAttribute('visible', false);
        }
    },

    // Optional: Add logic for 2D mode to identify objects via mouse
    on2DClick: function (mouse) {
        if (!this.starfield || window.currentMode !== 'identify') return;

        const cam = this.el.sceneEl.camera;
        if (!cam) return;

        // If touch, use center of screen
        const pointMouse = this.isTouch ? new THREE.Vector2(0, 0) : mouse;
        this.raycaster.setFromCamera(pointMouse, cam);

        // Use the same logic as tick but without the preview snapping logic
        // We can just rely on the nearestObj found in the last tick if we update it
        if (this.nearestObj) {
            this.stampInfo();
        }
    },

    stampInfo: function () {
        if (!this.nearestObj) return;

        // Snap to the actual object position for perfect projection
        // FIX: Pull in to radius 398 to prevent "Plane vs Sphere" Z-fighting (clipping at corners)
        let localPos = this.nearestObj.position.clone();
        localPos.normalize().multiplyScalar(398);

        const newLabel = {
            name: this.nearestObj.name,
            info: this.nearestObj.info,
            type: this.nearestObj.type || 'star',
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
            let labels = [];
            try {
                labels = JSON.parse(state.identifiedLabels || '[]');
            } catch (e) { labels = []; }

            // Check for duplicates
            const exists = labels.some(l => l.name === newLabel.name);
            if (exists) {
                console.log("Identify: Label already exists for", newLabel.name);
                return;
            }

            labels.push(newLabel);
            console.log("Identify: Adding label, count:", labels.length);
            skyMaster.setAttribute('sky-state', 'identifiedLabels', JSON.stringify(labels));

            // Force immediate local update
            if (typeof syncIdentifiedLabels === 'function') {
                syncIdentifiedLabels(labels);
            }
        }

        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.5, 30);
        }
    },

    removeLastInfo: function () {
        const skyMaster = document.getElementById('sky-master');
        if (skyMaster && skyMaster.components['sky-state']) {
            if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
                if (!NAF.utils.isMine(skyMaster)) {
                    NAF.utils.takeOwnership(skyMaster);
                }
            }
            const state = skyMaster.getAttribute('sky-state');
            let labels = [];
            try {
                labels = JSON.parse(state.identifiedLabels || '[]');
            } catch (e) { labels = []; }

            if (labels.length > 0) {
                labels.pop(); // Remove last added
                console.log("Identify: Removing last label, count:", labels.length);
                skyMaster.setAttribute('sky-state', 'identifiedLabels', JSON.stringify(labels));

                // Force immediate local update
                if (typeof syncIdentifiedLabels === 'function') {
                    syncIdentifiedLabels(labels);
                }
            }
        }

        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.2, 50);
        }
    },

    removeAllInfos: function () {
        console.log("Identify: Removing ALL identifications (Global)");
        const skyMaster = document.getElementById('sky-master');
        if (skyMaster && skyMaster.components['sky-state']) {
            if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
                if (!NAF.utils.isMine(skyMaster)) {
                    NAF.utils.takeOwnership(skyMaster);
                }
            }
            // Just clear the list
            skyMaster.setAttribute('sky-state', 'identifiedLabels', '[]');

            // Force immediate local update
            if (typeof syncIdentifiedLabels === 'function') {
                syncIdentifiedLabels([]);
            }
        }

        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.5, 200);
        }
    },

    remove: function () {
        if (this.checkForStarfield) clearInterval(this.checkForStarfield);
        window.removeEventListener('mode-change', this.onModeChange);
        if (this.previewEl && this.previewEl.parentNode) {
            this.previewEl.parentNode.removeChild(this.previewEl);
        }
    }
});
