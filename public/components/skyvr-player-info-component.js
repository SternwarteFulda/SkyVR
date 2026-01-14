window.ntExample = {
    randomColor: () => {
        return '#' + new THREE.Color(Math.random(), Math.random(), Math.random()).getHexString();
    }
};

AFRAME.registerComponent('player-info', {
    // notice that color and name are both listed in the schema; NAF will only keep
    // properties declared in the schema in sync.
    schema: {
        name: { type: 'string', default: 'user-' + Math.round(Math.random() * 10000) },
        color: {
            type: 'color', // btw: color is just a string under the hood in A-Frame
            default: window.ntExample.randomColor()
        },
        spawned: { type: 'boolean', default: false },
        spotId: { type: 'int', default: -1 },
        micStatus: { type: 'string', default: 'none' },
        presence: { type: 'string', default: 'avatar' },
        videoEnabled: { type: 'boolean', default: true }
    },

    init: function () {
        this.head = this.el.querySelector('.head');
        this.nametags = this.el.querySelectorAll('.nametag');
        this.eyelids = this.el.querySelectorAll('.eyelid');
        this.pointer = this.el.querySelector('.pointer');
        this.micIndicator = this.el.querySelector('.mic-indicator');
        this.micIcons = this.el.querySelectorAll('.mic-icon');
        this.face = this.el.querySelector('.face');
        // Flattened structure: no container
        this.webcamGroup = this.el.querySelector('.webcam-group');
        this.webcamFrame = this.el.querySelector('.webcam-frame');

        // Initial render order setup to fix "transparent sorting" (head occluding eyes)
        const renderSystem = this.el.sceneEl.systems['render-order'];
        const avatarBase = renderSystem ? renderSystem.order['avatars'] : 10;

        if (this.head) this.head.object3D.renderOrder = avatarBase;
        this.el.querySelectorAll('.eye, .pupil, .eyelid').forEach(p => p.object3D.renderOrder = avatarBase + 2);
        this.nametags.forEach(p => p.object3D.renderOrder = avatarBase + 5);
        if (this.micIcons) this.micIcons.forEach(p => p.object3D.renderOrder = avatarBase + 6);

        // Track initialization time to distinguish pre-existing players from new ones
        this.initTime = performance.now();
        this.lastSpawned = this.data.spawned;
        this.exiting = false;

        this.ownedByLocalUser = this.el.id === 'camera' || this.el.id === 'right-controller' || this.el.id === 'left-controller';

        // Initially hide if not spawned
        if (!this.data.spawned) {
            this.el.setAttribute('visible', false);
        }

        // Initialize blinking timer
        this.nextBlink = 0;
    },

    // here as an example, not used in current demo. Could build a user list, expanding on this.
    listUsers: function () {
        console.log(
            'userlist',
            [...document.querySelectorAll('[player-info]')].map((el) => el.components['player-info'].data.name)
        );
    },

    newRandomColor: function () {
        this.el.setAttribute('player-info', 'color', window.ntExample.randomColor());
    },

    tick: function (time, deltaTime) {
        if (!this.data.spawned || this.exiting) return;

        // Initialize timer on first active tick
        if (this.nextBlink === 0) {
            this.nextBlink = time + 2000 + Math.random() * 5000;
        }

        if (time > this.nextBlink) {
            this.blink();
        }

        // Update local mic status
        if (this.ownedByLocalUser && this.el.id === 'camera') {
            const urlParams = new URLSearchParams(window.location.search);
            const micAllowed = urlParams.get('mic') !== 'false' && (urlParams.get('room') !== 'none');

            let currentStatus = 'none';
            if (micAllowed) {
                currentStatus = window.micEnabled ? 'unmuted' : 'muted';
            }

            if (this.data.micStatus !== currentStatus) {
                this.el.setAttribute('player-info', 'micStatus', currentStatus);
            }
        }

        // Remote Player Logic: Billboarding (Nametags & Mic)
        if (!this.ownedByLocalUser && this.data.spawned) {
            this.updateBillboarding();
        }
    },

    updateBillboarding: function () {
        // Ensure we have children
        if (!this.nametags || this.nametags.length === 0) {
            this.nametags = this.el.querySelectorAll('.nametag');
        }
        if (!this.micIndicator) {
            this.micIndicator = this.el.querySelector('.mic-indicator');
        }

        const scene = this.el.sceneEl;
        if (!scene || !scene.camera) return;

        const camera = scene.camera;
        if (!this._tmp) {
            this._tmp = {
                camPos: new THREE.Vector3(),
                avatarPos: new THREE.Vector3(),
                objPos: new THREE.Vector3(),
                target: new THREE.Vector3()
            };
        }

        // Get world positions of interest
        camera.getWorldPosition(this._tmp.camPos);
        this.el.object3D.getWorldPosition(this._tmp.avatarPos);

        const apply = (el, offset) => {
            if (!el || !el.object3D || !el.object3D.parent) return;

            // 1. POSITION: Stay centered vertically relative to the avatar root (ignoring head tilt/rotation)
            // Desired position is directly above/below the avatar world position
            this._tmp.target.set(this._tmp.avatarPos.x, this._tmp.avatarPos.y + offset, this._tmp.avatarPos.z);

            // Convert this world target back to local space of the parent (the head/camera entity)
            // This ensures that even if the head tilts, the label stays at the absolute vertical offset.
            el.object3D.parent.worldToLocal(this._tmp.target);
            el.object3D.position.copy(this._tmp.target);

            // 2. FACING: Billboard to face the local user's camera (Yaw only)
            // lookAt ensures the object rotates such that its front (+Z) faces the target
            this._tmp.target.set(this._tmp.camPos.x, this._tmp.avatarPos.y + offset, this._tmp.camPos.z);
            el.object3D.lookAt(this._tmp.target);
        };

        if (this.nametags) {
            this.nametags.forEach(n => apply(n, -0.35));
        }
        if (this.micIndicator) {
            apply(this.micIndicator, 0.42);
        }

        // 3. DYNAMIC SCALING: Scale remote video based on distance (2D devices only)
        if (this.webcamGroup && !AFRAME.utils.device.checkHeadsetConnected()) {
            const dist = this._tmp.camPos.distanceTo(this._tmp.avatarPos);
            // Max distance on the 4m circle is 8m. 
            // Scale linearly from 1.0 (at 0m) to 2.0 (at 8m)
            const s = Math.min(2.0, Math.max(1.0, 1.0 + (dist / 8.0)));
            this.webcamGroup.object3D.scale.set(s, s, s);
        }
    },

    update: function (oldData) {
        if (this.head) this.head.setAttribute('material', 'color', this.data.color);
        if (this.eyelids) {
            this.eyelids.forEach(eyelid => {
                eyelid.setAttribute('material', 'color', this.data.color);
            });
        }
        if (this.nametags) {
            this.nametags.forEach(nametag => {
                nametag.setAttribute('value', this.data.name);
            });
        }
        if (this.pointer) {
            this.pointer.setAttribute('bottom-origin-cylinder', 'color', this.data.color);
        }

        // Handle Presence Mode (Avatar vs Webcam)
        const isWebcamMode = this.data.presence === 'webcam';
        const isVideoActive = this.data.videoEnabled;
        const showWebcam = isWebcamMode && isVideoActive;

        if (this.head) this.head.setAttribute('visible', !showWebcam);
        if (this.face) this.face.setAttribute('visible', !showWebcam);

        if (this.webcamGroup) this.webcamGroup.setAttribute('visible', showWebcam);
        if (this.webcamFrame) this.webcamFrame.setAttribute('material', 'color', this.data.color);

        // Handle mic indicator visuals
        if (this.micIndicator) {
            const status = this.data.micStatus;

            if (status === 'none') {
                this.micIndicator.setAttribute('visible', false);
            } else {
                this.micIndicator.setAttribute('visible', true);
                let micSrc, micColor;
                if (status === 'muted') {
                    micSrc = 'assets/icons/mic-off.svg';
                    micColor = '#888'; // Gray for muted
                } else {
                    micSrc = 'assets/icons/mic-on.svg';
                    micColor = '#ff0000'; // Red for unmuted
                }

                if (this.micIcons) {
                    this.micIcons.forEach(icon => {
                        icon.setAttribute('material', 'src', micSrc);
                        icon.setAttribute('material', 'color', micColor);
                    });
                }
            }
        }

        // Apply same color to laser ray and drawing (local only)
        if (this.ownedByLocalUser && (this.el.id === 'right-controller' || this.el.id === 'camera')) {
            if (this.el.hasAttribute('raycaster')) {
                this.el.setAttribute('raycaster', 'lineColor', this.data.color);
            }
            if (this.el.hasAttribute('drawing')) {
                this.el.setAttribute('drawing', 'color', this.data.color);
            }
        }

        // Handle Spawn Visibility & Effect
        if (this.data.spawned && !this.lastSpawned) {
            this.lastSpawned = true; // Mark as handled immediately to prevent multiple loops

            let posWaitAttempts = 0;
            const checkPositionAndShow = () => {
                posWaitAttempts++;
                const currentPos = new THREE.Vector3();
                const targetEl = this.el.id === 'camera' ? (this.el.parentElement || this.el) : this.el;
                targetEl.object3D.getWorldPosition(currentPos);

                // If they are a remote player and still at the origin, wait before showing (max 3 seconds).
                const horizontalDistSq = (currentPos.x * currentPos.x) + (currentPos.z * currentPos.z);
                if (!this.ownedByLocalUser && horizontalDistSq < 0.25 && posWaitAttempts < 30) {
                    setTimeout(checkPositionAndShow, 100);
                    return;
                }

                // CRITICAL CHECK for pre-existing players:
                // If the scene has been running for a while, this is a new joiner (play beam).
                // If we JUST joined, any existing players should appear immediately (skip beam).
                const isInitialSync = (this.el.sceneEl.time < 6000) && !this.ownedByLocalUser;

                if (isInitialSync) {
                    // Pre-existing player detected. Show immediately, NO beam.
                    this.el.setAttribute('visible', true);
                    this.setAvatarOpacity(1);
                } else {
                    // New join event or reload: Use the teleport effect
                    this.setAvatarOpacity(0);
                    this.el.setAttribute('visible', true);
                    this.playTeleportEffect('in');
                }

                // Signal local spawn
                if (this.ownedByLocalUser && this.el.id === 'camera') {
                    window.localPlayerSpawned = true;
                    if (typeof window.onLocalPlayerSpawned === 'function') {
                        window.onLocalPlayerSpawned();
                    }
                }
            };

            checkPositionAndShow();
        } else if (!this.data.spawned) {
            this.el.setAttribute('visible', false);
            this.lastSpawned = false;
        }
    },

    remove: function () {
        // When a player leaves, NAF removes the entity.
        if (this.data.spawned && !this.exiting) {
            this.exiting = true;
            this.playTeleportEffect('out');
        }
    },

    setAvatarOpacity: function (opacity) {
        // Find all parts that should fade
        const parts = this.el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag, .mic-icon');
        parts.forEach(part => {
            if (part.tagName.toLowerCase() === 'a-text') {
                part.setAttribute('opacity', opacity);
            } else {
                // Ensure material is transparent
                part.setAttribute('material', {
                    transparent: true,
                    opacity: opacity,
                    depthWrite: true // Keep depthWrite to allow head to mask eyes during fade
                });
            }
        });
    },

    playTeleportEffect: function (mode = 'in') {
        const el = this.el;
        const color = this.data.color;
        const scene = el.sceneEl;

        let runAttempts = 0;
        const runEffect = () => {
            runAttempts++;

            // POSITION FIX: Use the parent rig's world position if available, 
            // so the teleport beam starts from the ground (y=0) instead of the head.
            const currentPos = new THREE.Vector3();
            const currentQuat = new THREE.Quaternion();

            // player-info is on the camera; its parent is the rig.
            const targetEl = el.id === 'camera' ? (el.parentElement || el) : el;
            targetEl.object3D.getWorldPosition(currentPos);
            el.object3D.getWorldQuaternion(currentQuat);

            // DESTINATION DETECTION: For remote players joining ('in'), 
            // wait until they reach their intended spot.
            if (mode === 'in' && !this.ownedByLocalUser) {
                // If we don't have a spotId yet, wait for sync (up to 3 seconds)
                if (this.data.spotId === -1) {
                    if (runAttempts < 60) {
                        setTimeout(runEffect, 50);
                        return;
                    }
                } else {
                    // Calculate intended spot position (Radius 4m, 16 spots)
                    const radius = 4;
                    const count = 16;
                    const angleRad = (this.data.spotId / count) * Math.PI * 2;
                    const targetPos = new THREE.Vector3(Math.cos(angleRad) * radius, 0, Math.sin(angleRad) * radius);

                    // Wait until the sliding avatar is close to the target (within 0.5m)
                    // or until too much time has passed (safety fallback)
                    const distToTargetSq = currentPos.distanceToSquared(targetPos);
                    if (distToTargetSq > 0.25 && runAttempts < 80) {
                        setTimeout(runEffect, 50);
                        return;
                    }

                    // Anchor the effect EXACTLY to the spot for perfect centering
                    currentPos.copy(targetPos);
                }
            } else if (mode === 'in' && this.ownedByLocalUser) {
                // For local player, just check if we have moved away from origin (safety)
                const horizontalDistSq = (currentPos.x * currentPos.x) + (currentPos.z * currentPos.z);
                if (horizontalDistSq < 0.25) {
                    setTimeout(runEffect, 50);
                    return;
                }
            }

            // BEAM VISIBILITY CHECK:
            // Only show 'in' beams if this is a remote player.
            if (mode === 'in' && this.ownedByLocalUser) {
                const avatarParts = el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag, .mic-icon');
                avatarParts.forEach(part => {
                    const isText = part.tagName.toLowerCase() === 'a-text';
                    const property = isText ? 'opacity' : 'material.opacity';

                    part.setAttribute('animation__fadein', {
                        property: property, from: 0, to: 1, dur: 2000, delay: 500, easing: 'easeInOutQuad'
                    });
                });
                return;
            }

            // Create a temporary container for the effect
            const effectContainer = document.createElement('a-entity');
            effectContainer.setAttribute('data-no-sync', '');

            // The root container stays VERTICAL (no rotation) for the beams
            effectContainer.setAttribute('position', { x: currentPos.x, y: currentPos.y, z: currentPos.z });
            scene.appendChild(effectContainer);

            // Create a sub-container for the visual avatar clones (rotated)
            const visualsContainer = document.createElement('a-entity');
            const euler = new THREE.Euler().setFromQuaternion(currentQuat, 'YXZ');
            visualsContainer.setAttribute('rotation', {
                x: THREE.MathUtils.radToDeg(euler.x),
                y: THREE.MathUtils.radToDeg(euler.y),
                z: THREE.MathUtils.radToDeg(euler.z)
            });
            effectContainer.appendChild(visualsContainer);

            // Add a temporary light burst
            const light = document.createElement('a-entity');
            light.setAttribute('light', {
                type: 'point', intensity: 1.5, distance: 4, color: '#fff', decay: 2, castShadow: false
            });
            light.setAttribute('position', '0 1 0');
            light.setAttribute('animation', {
                property: 'light.intensity', from: 1.5, to: 0, dur: 1500, easing: 'linear'
            });
            effectContainer.appendChild(light);

            if (mode === 'in') {
                // Fade in original avatar components
                // Fade in original avatar components
                // Include webcam parts in the fade-in logic
                const parts = el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag, .mic-icon');
                parts.forEach(part => {
                    const isText = part.tagName.toLowerCase() === 'a-text';
                    const property = isText ? 'opacity' : 'material.opacity';

                    part.setAttribute('animation__fadein', {
                        property: property, from: 0, to: 1, dur: 2000, delay: 500, easing: 'easeInOutQuad'
                    });
                });
            } else {
                // Create phantom avatar for 'out' effect
                // We only query the top-level parts we want to clone.
                const visuals = el.querySelectorAll('.head, .face, .nametag, .mic-indicator');
                visuals.forEach(v => {
                    const clone = v.cloneNode(true);

                    // Recursive function to apply properties to all mesh/text children
                    const applyProperties = (node) => {
                        const isText = node.tagName && node.tagName.toLowerCase() === 'a-text';
                        const isHead = node.classList && node.classList.contains('head');
                        const isFace = node.classList && node.classList.contains('face');
                        const isEyePart = node.classList && (node.classList.contains('eye') || node.classList.contains('pupil') || node.classList.contains('eyelid'));

                        // Ensure avatar is visible for the exit effect even if it was hidden (e.g. in webcam mode)
                        if (isHead || isFace) {
                            node.setAttribute('visible', true);
                        }

                        if (node.removeAttribute) {
                            // Strip networked components from clones to prevent initialization errors
                            node.removeAttribute('networked-audio-source');
                            node.removeAttribute('networked-video-source');
                            node.removeAttribute('id');
                        }

                        if (!isText && node.setAttribute) {
                            // Enable depthWrite to allow head to mask eyes
                            node.setAttribute('material', 'depthWrite', true);
                            node.setAttribute('material', 'transparent', true);

                            // Apply consistent color
                            if (isHead || node.classList.contains('eyelid')) {
                                node.setAttribute('material', 'color', color);
                            }
                        }

                        if (isText) {
                            node.setAttribute('value', this.data.name);
                        }

                        // Apply renderOrder to fix sorting
                        const setRO = () => {
                            const rs = this.el.sceneEl.systems['render-order'];
                            const base = rs ? rs.order['avatars'] : 10;
                            if (isHead) node.object3D.renderOrder = base;
                            else if (isEyePart) node.object3D.renderOrder = base + 2;
                            else if (isText) node.object3D.renderOrder = base + 5;
                        };
                        if (node.hasLoaded) setRO();
                        else node.addEventListener('loaded', setRO, { once: true });

                        // ANIMATION: Wait for 'loaded' to prevent mesh flicker
                        const startFade = () => {
                            const property = isText ? 'opacity' : 'material.opacity';
                            node.setAttribute('animation__fadeout', {
                                property: property, from: 1, to: 0, dur: 1500, delay: 200, easing: 'easeInQuad'
                            });
                        };

                        if (node.hasLoaded) {
                            startFade();
                        } else {
                            node.addEventListener('loaded', startFade, { once: true });
                        }

                        // Recurse children
                        for (let i = 0; i < node.children.length; i++) {
                            applyProperties(node.children[i]);
                        }
                    };

                    applyProperties(clone);
                    visualsContainer.appendChild(clone);
                });
            }

            // Energy needles (Beams)
            for (let i = 0; i < 16; i++) {
                const beam = document.createElement('a-cylinder');
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 0.35;
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                beam.setAttribute('radius', 0.002 + Math.random() * 0.004);
                beam.setAttribute('height', 0.1);
                beam.setAttribute('position', { x: x, y: 0.1, z: z });
                beam.setAttribute('shadow', 'cast: false; receive: false'); // FIX: Disable shadows
                beam.setAttribute('material', {
                    shader: 'flat',
                    color: i % 4 === 0 ? '#ffffff' : color,
                    transparent: true,
                    opacity: 0,
                    blending: 'additive',
                    depthTest: false, // Bypass depth check to avoid shadow artifact from the avatar
                    depthWrite: false
                });
                const renderSystem = this.el.sceneEl.systems['render-order'];
                beam.object3D.renderOrder = renderSystem ? renderSystem.order['ui'] : 100; // Render over the avatar

                const dur = 1000 + Math.random() * 1000;
                const startDelay = Math.random() * 500;

                beam.setAttribute('animation__scale', {
                    property: 'height', from: 0.1, to: 2.2 + Math.random() * 0.6, dur: dur, delay: startDelay, easing: 'easeOutQuad'
                });
                beam.setAttribute('animation__pos', {
                    property: 'position', to: `${x} ${1.2 + Math.random() * 0.3} ${z}`, dur: dur, delay: startDelay, easing: 'easeOutQuad'
                });
                beam.setAttribute('animation__fade_in', {
                    property: 'material.opacity', to: 0.9, dur: 200, delay: startDelay, easing: 'linear'
                });
                beam.setAttribute('animation__fade_out', {
                    property: 'material.opacity', to: 0, dur: 600, delay: startDelay + dur - 600, easing: 'linear'
                });
                effectContainer.appendChild(beam);
            }

            // Sparkles
            for (let i = 0; i < 45; i++) {
                const sparkle = document.createElement('a-sphere');
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 0.5;
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                sparkle.setAttribute('position', { x: x, y: Math.random() * 0.5, z: z });
                sparkle.setAttribute('radius', 0.008 + Math.random() * 0.015);
                sparkle.setAttribute('shadow', 'cast: false; receive: false');
                sparkle.setAttribute('material', {
                    shader: 'flat', color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? color : '#ffeeaa'),
                    transparent: true, opacity: 0, blending: 'additive',
                    depthTest: false, // Bypass depth check
                    depthWrite: false
                });
                const renderSystem = this.el.sceneEl.systems['render-order'];
                sparkle.object3D.renderOrder = renderSystem ? renderSystem.order['ui'] : 100;

                const duration = 1500 + Math.random() * 1000;
                const startDelay = Math.random() * 1000;

                sparkle.setAttribute('animation__up', {
                    property: 'position', to: `${x} ${2.5 + Math.random() * 1.5} ${z}`, dur: duration, delay: startDelay, easing: 'easeOutQuad'
                });
                sparkle.setAttribute('animation__flicker', {
                    property: 'material.opacity', from: 0.2, to: 1, dur: 100 + Math.random() * 100, dir: 'alternate', loop: true
                });
                sparkle.setAttribute('animation__fade_in', {
                    property: 'material.opacity', to: 1, dur: 200, delay: startDelay, easing: 'linear'
                });
                sparkle.setAttribute('animation__fade_out', {
                    property: 'material.opacity', to: 0, dur: 500, delay: startDelay + duration - 500, easing: 'linear'
                });
                effectContainer.appendChild(sparkle);
            }

            // Clean up: Remove from DOM much faster (3s instead of 5s)
            setTimeout(() => {
                if (effectContainer.parentNode) {
                    scene.removeChild(effectContainer);
                }
            }, 3000);
        };

        // Start checking for valid position
        runEffect();
    },

    blink: function () {
        if (!this.eyelids || this.eyelids.length === 0) {
            this.eyelids = this.el.querySelectorAll('.eyelid');
        }
        if (!this.eyelids || this.eyelids.length === 0) return;

        const isDouble = Math.random() < 0.1;
        const duration = 120;
        const loops = isDouble ? 4 : 2;

        // Blinking is handled locally for each client to avoid unnecessary network traffic.
        this.eyelids.forEach(eyelid => {
            eyelid.setAttribute('animation__blink', {
                property: 'rotation',
                from: '20 0 0',
                to: '-70 0 0',
                dur: duration,
                dir: 'alternate',
                loop: loops,
                easing: 'easeInOutQuad'
            });
        });

        // Schedule next blink
        const nextDelay = Math.random() * 6000 + 2000;
        this.nextBlink = this.el.sceneEl.time + (loops * duration) + nextDelay;
    }
});