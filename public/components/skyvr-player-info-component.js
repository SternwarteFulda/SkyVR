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
        spotId: { type: 'int', default: -1 }
    },

    init: function () {
        this.head = this.el.querySelector('.head');
        this.nametags = this.el.querySelectorAll('.nametag');
        this.eyelids = this.el.querySelectorAll('.eyelid');
        this.pointer = this.el.querySelector('.pointer');

        // Track initialization time to distinguish pre-existing players from new ones
        this.initTime = performance.now();
        this.lastSpawned = this.data.spawned;
        this.exiting = false;

        this.ownedByLocalUser = this.el.id === 'camera' || this.el.id === 'right-controller' || this.el.id === 'left-controller';

        // Initially hide if not spawned
        if (!this.data.spawned) {
            this.el.setAttribute('visible', false);
        }
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

        // Handle Spawn Visibility & Effect
        if (this.data.spawned && !this.lastSpawned) {
            this.lastSpawned = true; // Mark as handled immediately to prevent multiple loops

            const checkPositionAndShow = () => {
                const currentPos = new THREE.Vector3();
                const targetEl = this.el.id === 'camera' ? (this.el.parentElement || this.el) : this.el;
                targetEl.object3D.getWorldPosition(currentPos);

                // If they are a remote player and still at the origin, wait before showing.
                const horizontalDistSq = (currentPos.x * currentPos.x) + (currentPos.z * currentPos.z);
                if (!this.ownedByLocalUser && horizontalDistSq < 0.25) {
                    setTimeout(checkPositionAndShow, 100);
                    return;
                }

                // CRITICAL CHECK for pre-existing players:
                const timeSinceInit = performance.now() - this.initTime;
                const isInitialSync = timeSinceInit < 2000 && !this.ownedByLocalUser;

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
        const parts = this.el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag');
        parts.forEach(part => {
            if (part.tagName.toLowerCase() === 'a-text') {
                part.setAttribute('opacity', opacity);
            } else {
                // Ensure material is transparent
                part.setAttribute('material', {
                    transparent: true,
                    opacity: opacity
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
                const avatarParts = el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag');
                avatarParts.forEach(part => {
                    const property = part.tagName.toLowerCase() === 'a-text' ? 'opacity' : 'material.opacity';
                    part.setAttribute('animation__fadein', {
                        property: property, from: 0, to: 1, dur: 2000, delay: 500, easing: 'easeInOutQuad'
                    });
                });
                return;
            }

            // Create a temporary container for the effect
            const effectContainer = document.createElement('a-entity');
            effectContainer.setAttribute('data-no-sync', '');
            // Pass position as an object for A-Frame compatibility
            effectContainer.setAttribute('position', { x: currentPos.x, y: currentPos.y, z: currentPos.z });
            scene.appendChild(effectContainer);

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
                const parts = el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag');
                parts.forEach(part => {
                    const property = part.tagName.toLowerCase() === 'a-text' ? 'opacity' : 'material.opacity';
                    part.setAttribute('animation__fadein', {
                        property: property, from: 0, to: 1, dur: 2000, delay: 500, easing: 'easeInOutQuad'
                    });
                });
            } else {
                // Create phantom avatar for 'out' effect
                const visuals = el.querySelectorAll('.head, .face, .nametag, .eyelid');
                visuals.forEach(v => {
                    const clone = v.cloneNode(true);
                    clone.object3D.quaternion.copy(currentQuat);

                    if (clone.classList.contains('head') || clone.classList.contains('eyelid')) {
                        clone.setAttribute('material', {
                            color: color,
                            transparent: true,
                            opacity: 1,
                            depthWrite: false
                        });
                    }
                    if (clone.tagName.toLowerCase() === 'a-text') {
                        clone.setAttribute('value', this.data.name);
                    }

                    effectContainer.appendChild(clone);

                    const animateParts = clone.classList.contains('face') ? clone.querySelectorAll('.eye, .pupil, .eyelid') : [clone];
                    animateParts.forEach(part => {
                        const isText = part.tagName.toLowerCase() === 'a-text';
                        const property = isText ? 'opacity' : 'material.opacity';

                        if (!isText) {
                            part.setAttribute('material', 'depthWrite', false);
                        }

                        part.setAttribute('animation__fadeout', {
                            property: property, from: 1, to: 0, dur: 1500, delay: 200, easing: 'easeInQuad'
                        });
                    });
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
                    depthWrite: false // FIX: Prevents "shadow-like" depth artifacts
                });

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
                    depthWrite: false
                });

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
    }
});