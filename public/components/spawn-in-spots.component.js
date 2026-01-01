/* global AFRAME, THREE, NAF */
AFRAME.registerComponent('spawn-in-spots', {
    schema: {
        radius: { type: 'number', default: 4 }, // Diameter 8m = Radius 4m
        maxSpots: { type: 'int', default: 16 }
    },

    init: function () {
        this.hasSpawned = false;

        // Check if NAF is ready
        if (this.isNAFConnected()) {
            this.spawn();
        } else {
            // Listen for NAF connection
            document.body.addEventListener('connected', this.spawn.bind(this));
        }

        // Draw visual markers for spots
        // We need to wait for the schema to be initialized and data populated if we rely on it immediately?
        // init() runs after schema update.
        this.createMarkers();
    },

    isNAFConnected: function () {
        return window.NAF && window.NAF.connection && window.NAF.connection.isConnected();
    },

    spawn: function () {
        if (this.hasSpawned) return;

        // Safer spawn: wait until we see as many avatars as there are connected clients
        const checkAndSpawn = () => {
            if (this.hasSpawned) return;

            const connectedClients = NAF.connection.getConnectedClients();
            // NAF.connection.getConnectedClients() returns an object where keys are clientIds
            const clientCount = Object.keys(connectedClients).length;

            // We expect to see 'clientCount' remote avatars. 
            // NOTE: getConnectedClients() does NOT include the local client usually?
            // Let's verify: documentation says "returns dict of connected clients". unique IDs.
            // Usually does not include self.

            const visibleAvatars = document.querySelectorAll('.avatar-rig');

            console.log(`Spawn check: Clients=${clientCount}, Avatars=${visibleAvatars.length}`);

            if (visibleAvatars.length >= clientCount) {
                this.doSpawn();
            } else {
                // Not everyone has loaded yet, wait a bit
                console.log('Waiting for avatars to load before spawning...');
                setTimeout(checkAndSpawn, 250);
            }
        };

        // Initial delay to allow connection to stabilize
        setTimeout(checkAndSpawn, 500);
    },

    doSpawn: function () {
        if (this.hasSpawned) return;
        this.hasSpawned = true;

        const spots = this.generateSpots();
        // Recalculate occupancy now that we are sure avatars are loaded
        const occupiedIndices = this.getOccupiedSpotIndices(spots);
        const freeIndices = [];

        for (let i = 0; i < this.data.maxSpots; i++) {
            if (!occupiedIndices.has(i)) {
                freeIndices.push(i);
            }
        }

        let chosenIndex;
        if (freeIndices.length > 0) {
            // Pick a random free spot
            const randomPointer = Math.floor(Math.random() * freeIndices.length);
            chosenIndex = freeIndices[randomPointer];
            console.log('Spawning at free spot index:', chosenIndex);
        } else {
            // No free spots, pick random
            chosenIndex = Math.floor(Math.random() * this.data.maxSpots);
            console.warn('All spots occupied! Spawning at random spot index:', chosenIndex);
        }

        const spot = spots[chosenIndex];

        // Set Position
        const el = this.el;
        el.setAttribute('position', spot.position);

        // Set Rotation (Face center)
        // We use atan2(x, z) to get the angle to look at (0,0,0) from (x, z) in A-Frame's coord system
        const angleRad = Math.atan2(spot.position.x, spot.position.z);
        const angleDeg = THREE.MathUtils.radToDeg(angleRad);

        el.setAttribute('rotation', {
            x: 0,
            y: angleDeg,
            z: 0
        });

        console.log(`Spawned at index ${chosenIndex} (Radius: ${this.data.radius}, Angle: ${angleDeg.toFixed(1)})`);

        // IMPORTANT: Reset rig-follower if present, otherwise it might interpret the teleport as a huge step
        if (el.components['rig-follower'] && typeof el.components['rig-follower'].reset === 'function') {
            el.components['rig-follower'].reset();
        }
    },

    generateSpots: function () {
        const spots = [];
        const radius = this.data.radius;
        const count = this.data.maxSpots;

        for (let i = 0; i < count; i++) {
            const angleRad = (i / count) * Math.PI * 2;
            const x = Math.cos(angleRad) * radius;
            const z = Math.sin(angleRad) * radius;
            spots.push({
                index: i,
                position: new THREE.Vector3(x, 0, z) // Y is 0
            });
        }
        return spots;
    },

    getOccupiedSpotIndices: function (spots) {
        const occupied = new Set();
        // Look for other avatars
        const others = document.querySelectorAll('.avatar-rig');

        others.forEach(other => {
            const pos = new THREE.Vector3();
            other.object3D.getWorldPosition(pos);
            pos.y = 0;

            let closestIndex = -1;
            let minDist = Infinity;

            // Find closest spot to this player
            spots.forEach(spot => {
                const dist = pos.distanceToSquared(spot.position);
                if (dist < minDist) {
                    minDist = dist;
                    closestIndex = spot.index;
                }
            });

            // If the closest spot is within 1.5m, mark it occupied
            if (minDist < (1.5 * 1.5)) {
                occupied.add(closestIndex);
            }
        });

        return occupied;
    },

    createMarkers: function () {
        const scene = document.querySelector('a-scene');
        if (!scene) return;

        // Remove existing container if any (re-init case)
        const oldContainer = document.getElementById('spawn-markers-container');
        if (oldContainer) {
            oldContainer.parentNode.removeChild(oldContainer);
        }

        const container = document.createElement('a-entity');
        container.setAttribute('id', 'spawn-markers-container');

        const spots = this.generateSpots();
        spots.forEach(spot => {
            const marker = document.createElement('a-ring');
            // marker.setAttribute('position', spot.position); // set below
            marker.setAttribute('rotation', '-90 0 0');
            marker.setAttribute('radius-inner', '0.2');
            marker.setAttribute('radius-outer', '0.25');
            marker.setAttribute('color', '#ffffff');
            marker.setAttribute('opacity', '0.3');
            marker.setAttribute('shader', 'flat');
            // Lift slightly to avoid z-fighting
            marker.setAttribute('position', { x: spot.position.x, y: 0.01, z: spot.position.z });

            container.appendChild(marker);
        });

        scene.appendChild(container);
    }
});
