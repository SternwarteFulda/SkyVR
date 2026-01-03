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
        spawned: { type: 'boolean', default: false }
    },

    init: function () {
        this.head = this.el.querySelector('.head');
        this.nametags = this.el.querySelectorAll('.nametag');
        this.eyelids = this.el.querySelectorAll('.eyelid');
        this.pointer = this.el.querySelector('.pointer');
        this.lastSpawned = false;
        this.exiting = false;

        this.ownedByLocalUser = this.el.id === 'camera' || this.el.id === 'right-controller';

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
            // Set opacity to 0 before making visible to allow fade-in
            this.setAvatarOpacity(0);
            this.el.setAttribute('visible', true);
            this.playTeleportEffect('in');
            this.lastSpawned = true;
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

        // For "out", we need to capture position immediately before removal
        const finalWorldPos = new THREE.Vector3();
        const finalWorldQuat = new THREE.Quaternion();
        el.object3D.getWorldPosition(finalWorldPos);
        el.object3D.getWorldQuaternion(finalWorldQuat);
        const finalWorldRot = el.object3D.rotation.clone();

        const runEffect = () => {
            // Recalculate position for "in" after the delay to avoid (0,0,0)
            const currentPos = new THREE.Vector3();
            const currentQuat = new THREE.Quaternion();
            if (mode === 'in') {
                el.object3D.getWorldPosition(currentPos);
                el.object3D.getWorldQuaternion(currentQuat);
            } else {
                currentPos.copy(finalWorldPos);
                currentQuat.copy(finalWorldQuat);
            }

            // Create a temporary container for the effect
            const effectContainer = document.createElement('a-entity');
            effectContainer.setAttribute('data-no-sync', '');
            effectContainer.setAttribute('position', currentPos);
            // Apply world rotation to container to match original avatar orientation
            effectContainer.object3D.quaternion.copy(currentQuat);
            scene.appendChild(effectContainer);

            // Add a temporary light burst
            const light = document.createElement('a-entity');
            light.setAttribute('light', {
                type: 'point',
                intensity: 1.5,
                distance: 4,
                color: '#fff',
                decay: 2
            });
            light.setAttribute('position', '0 1 0');
            light.setAttribute('animation', {
                property: 'light.intensity',
                from: 1.5,
                to: 0,
                dur: 1500,
                easing: 'linear'
            });
            effectContainer.appendChild(light);

            if (mode === 'in') {
                // FADE IN AVATAR COMPONENTS (on the original element)
                const parts = el.querySelectorAll('.head, .eye, .pupil, .eyelid, .nametag');
                parts.forEach(part => {
                    const property = part.tagName.toLowerCase() === 'a-text' ? 'opacity' : 'material.opacity';
                    part.setAttribute('animation__fadein', {
                        property: property,
                        from: 0,
                        to: 1,
                        dur: 2000,
                        delay: 500,
                        easing: 'easeInOutQuad'
                    });
                });
            } else {
                // FADE OUT: Create a phantom avatar
                // Instead of full cloning which is messy with components, let's clone just visuals
                const visuals = el.querySelectorAll('.head, .face, .nametag');
                visuals.forEach(v => {
                    const clone = v.cloneNode(true);
                    // If it's a head or eyelid, ensure color is copied manually since it might be in material attribute
                    if (clone.classList.contains('head') || clone.classList.contains('eyelid')) {
                        clone.setAttribute('material', 'color', color);
                        clone.setAttribute('material', 'transparent', true);
                        clone.setAttribute('material', 'opacity', 1);
                    }
                    if (clone.tagName.toLowerCase() === 'a-text') {
                        clone.setAttribute('value', this.data.name);
                    }

                    effectContainer.appendChild(clone);

                    // Add fade out animation to children of phantom
                    const parts = clone.classList.contains('face') ? clone.querySelectorAll('.eye, .pupil, .eyelid') : [clone];
                    parts.forEach(part => {
                        const property = part.tagName.toLowerCase() === 'a-text' ? 'opacity' : 'material.opacity';
                        if (property === 'material.opacity') {
                            part.setAttribute('material', 'transparent', true);
                            part.setAttribute('material', 'opacity', 1);
                        }
                        part.setAttribute('animation__fadeout', {
                            property: property,
                            from: 1,
                            to: 0,
                            dur: 1500,
                            delay: 200,
                            easing: 'easeInQuad'
                        });
                    });
                });
            }

            // Energy needles
            for (let i = 0; i < 16; i++) {
                const beam = document.createElement('a-cylinder');
                const angle = Math.random() * Math.PI * 2;
                const dist = Math.random() * 0.35;
                const x = Math.cos(angle) * dist;
                const z = Math.sin(angle) * dist;

                beam.setAttribute('radius', 0.002 + Math.random() * 0.004);
                beam.setAttribute('height', 0.1);
                beam.setAttribute('position', { x: x, y: 0.1, z: z });
                beam.setAttribute('material', {
                    shader: 'flat',
                    color: i % 4 === 0 ? '#ffffff' : color,
                    transparent: true,
                    opacity: 0,
                    blending: 'additive'
                });

                const dur = 1000 + Math.random() * 1000;
                const startDelay = Math.random() * 500;

                beam.setAttribute('animation__scale', {
                    property: 'height',
                    from: 0.1,
                    to: 2.2 + Math.random() * 0.6,
                    dur: dur,
                    delay: startDelay,
                    easing: 'easeOutQuad'
                });
                beam.setAttribute('animation__pos', {
                    property: 'position',
                    to: `${x} ${1.2 + Math.random() * 0.3} ${z}`,
                    dur: dur,
                    delay: startDelay,
                    easing: 'easeOutQuad'
                });
                beam.setAttribute('animation__fade_in', {
                    property: 'material.opacity',
                    to: 0.9,
                    dur: 200,
                    delay: startDelay,
                    easing: 'linear'
                });
                beam.setAttribute('animation__fade_out', {
                    property: 'material.opacity',
                    to: 0,
                    dur: 600,
                    delay: startDelay + dur - 600,
                    easing: 'linear'
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
                sparkle.setAttribute('material', {
                    shader: 'flat',
                    color: i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? color : '#ffeeaa'),
                    transparent: true,
                    opacity: 0,
                    blending: 'additive'
                });

                const duration = 1500 + Math.random() * 1000;
                const startDelay = Math.random() * 1000;

                sparkle.setAttribute('animation__up', {
                    property: 'position',
                    to: `${x} ${2.5 + Math.random() * 1.5} ${z}`,
                    dur: duration,
                    delay: startDelay,
                    easing: 'easeOutQuad'
                });

                sparkle.setAttribute('animation__flicker', {
                    property: 'material.opacity',
                    from: 0.2,
                    to: 1,
                    dur: 100 + Math.random() * 100,
                    dir: 'alternate',
                    loop: true
                });

                sparkle.setAttribute('animation__fade_in', {
                    property: 'material.opacity',
                    to: 1,
                    dur: 200,
                    delay: startDelay,
                    easing: 'linear'
                });

                sparkle.setAttribute('animation__fade_out', {
                    property: 'material.opacity',
                    to: 0,
                    dur: 500,
                    delay: startDelay + duration - 500,
                    easing: 'linear'
                });

                effectContainer.appendChild(sparkle);
            }

            // Clean up
            setTimeout(() => {
                if (effectContainer.parentNode) {
                    scene.removeChild(effectContainer);
                }
            }, 5000);
        };

        if (mode === 'in') {
            setTimeout(runEffect, 150); // Increased delay to ensure world positioning is settled
        } else {
            runEffect();
        }
    }
});