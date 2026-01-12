AFRAME.registerComponent('identify', {
    init: function () {
        this.starfield = null;
        this.currentMode = 'draw';
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
            color: '#00FF00',
            opacity: 0
        });
        this.crosshairEl.setAttribute('object-render-order', 100);
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
        this.targetPreviewOpacity = 0;
        this.labelOpacity = 0;
        this.targetLabelOpacity = 0;

        // Text label (now a child of previewEl for perfect snapping)
        this.labelEl = document.createElement('a-entity');
        this.labelEl.setAttribute('id', 'identify-preview-label');
        this.labelEl.setAttribute('position', '0 16 0');
        this.labelEl.setAttribute('custom-fogless-text', {
            fontSize: 80,
            textColor: '#00FF00',
            worldScale: 0.1,
            fixedWidth: 800,
            depthTest: false,
            renderOrder: 60,
            opacity: 0
        });
        this.previewEl.appendChild(this.labelEl);

        this.raycaster = new THREE.Raycaster();
        this.raycaster.far = 1000;

        // Wait for starfield to be ready
        this.checkForStarfield = setInterval(() => {
            const starfieldEl = document.getElementById('stars-point-cloud');
            if (starfieldEl && starfieldEl.components['starfield']) {
                this.starfield = starfieldEl.components['starfield'];
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

    tick: function () {
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
                for (let planet of this.starfield.planetsData) {
                    if (!planet.currentPosition) continue;
                    const planetPos = planet.currentPosition;
                    // Compare at same radius for distance check
                    const comparePoint = planetPos.clone().normalize().multiplyScalar(400);
                    const dist = hitPoint.distanceTo(comparePoint);
                    if (dist < minDistance) {
                        minDistance = dist;
                        let infoStr = `Planet`;

                        if (planet.name === 'Moon') {
                            infoStr = 'The Moon';
                        } else if (planet.mag !== undefined && planet.mag !== null) {
                            infoStr = `Data: Mag ${planet.mag.toFixed(1)}`;
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
                this.targetPreviewOpacity = 1;
                this.targetLabelOpacity = 1;
                this.previewEl.setAttribute('visible', true);
                this.labelEl.setAttribute('visible', true);
                const worldStarPos = this.starfield.el.object3D.localToWorld(nearestObj.position.clone());

                // Snap the entire previewEl (crosshair + label)
                this.previewEl.setAttribute('position', worldStarPos);

                const camWorldPos = new THREE.Vector3();
                if (this.el.sceneEl.camera) {
                    this.el.sceneEl.camera.getWorldPosition(camWorldPos);
                    this.previewEl.object3D.lookAt(camWorldPos);
                }

                this.labelEl.setAttribute('custom-fogless-text', 'value', `${nearestObj.name}\\n${nearestObj.info}`);
                this.labelEl.setAttribute('custom-fogless-text', 'opacity', this.labelOpacity);

                // Only pulse haptics on change
                if (this.lastNearestName !== nearestObj.name) {
                    if (this.el.components['haptics']) {
                        this.el.components['haptics'].pulse(0.2, 40);
                    }
                    this.lastNearestName = nearestObj.name;
                }
            } else {
                // No object nearby: crosshair follows pointer tip, label disappears
                this.targetPreviewOpacity = 0.5; // Dimmer crosshair when not snapped
                this.targetLabelOpacity = 0;
                this.previewEl.setAttribute('visible', true);
                this.previewEl.setAttribute('position', hitPointWorld);

                if (this.el.sceneEl.camera) {
                    const camWorldPos = new THREE.Vector3();
                    this.el.sceneEl.camera.getWorldPosition(camWorldPos);
                    this.previewEl.object3D.lookAt(camWorldPos);
                }

                this.lastNearestName = null;
            }
        }

        // Apply fading logic
        const fadeSpeed = 0.15;
        if (Math.abs(this.previewOpacity - this.targetPreviewOpacity) > 0.001) {
            this.previewOpacity += (this.targetPreviewOpacity - this.previewOpacity) * fadeSpeed;
            this.crosshairEl.setAttribute('material', 'opacity', this.previewOpacity);
        }
        if (Math.abs(this.labelOpacity - this.targetLabelOpacity) > 0.001) {
            this.labelOpacity += (this.targetLabelOpacity - this.labelOpacity) * fadeSpeed;
            this.labelEl.setAttribute('custom-fogless-text', 'opacity', this.labelOpacity);
        }

        // Hide if fully faded
        if (this.previewOpacity < 0.01 && this.labelOpacity < 0.01 && !isIdentifyMode) {
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
        const localPos = this.nearestObj.position;

        const el = document.createElement('a-entity');
        el.setAttribute('networked', {
            template: '#identified-info-template'
        });
        el.setAttribute('identified-info', {
            name: this.nearestObj.name,
            info: this.nearestObj.info
        });
        el.setAttribute('position', { x: localPos.x, y: localPos.y, z: localPos.z });

        const container = document.getElementById('stars-point-cloud');
        if (container) {
            container.appendChild(el);
            this.stampedInfos.push(el);
        }

        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.3, 100);
        }
    },

    removeLastInfo: function () {
        if (this.stampedInfos.length > 0) {
            const last = this.stampedInfos.pop();
            if (last) {
                console.log("Identify: Removing last stamp (fade)");
                // Use setAttribute to ensure it works even if component hasn't ticked yet
                last.setAttribute('identified-info', {
                    targetOpacity: 0,
                    isRemoving: true
                });
                // Fallback for non-networked or uninitialized components
                setTimeout(() => {
                    if (last && last.parentNode) last.parentNode.removeChild(last);
                }, 500); // 500ms allows the 300ms fade-out to finish
            }
        }
        if (this.el.components['haptics']) {
            this.el.components['haptics'].pulse(0.2, 50);
        }
    },

    removeAllInfos: function () {
        console.log("Identify: Removing all stamped information with fade");
        while (this.stampedInfos.length > 0) {
            const el = this.stampedInfos.pop();
            if (el) {
                el.setAttribute('identified-info', {
                    targetOpacity: 0,
                    isRemoving: true
                });
                setTimeout(() => {
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                }, 500);
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
