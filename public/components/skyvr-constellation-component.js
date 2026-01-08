AFRAME.registerComponent('constellation-renderer', {
    schema: {
        constellationDataUrl: { type: 'string', default: '/assets/constellations/index.json' },
        starDataUrl: { type: 'string', default: '/data/hyglike_from_athyg_v31.csv' },
        lineColor: { type: 'color', default: '#4499ff' },
        lineOpacity: { type: 'number', default: 0.6 },
        lineWidth: { type: 'number', default: 2 },
        radius: { type: 'number', default: 400 },
        showLines: { type: 'boolean', default: false },
        illustrationOpacity: { type: 'number', default: 0.1 }
    },

    init: function () {
        this.loadingComplete = false;
        this.constellationData = null;
        this.starPositions = new Map();
        this.constellationLines = [];
        this.placedIllustrations = [];
        this.currentPointedConstellation = null;
        this.textureCache = new Map();
        this.previewOpacity = 0;
        this.fadingOutPreviews = [];
        this.pendingSyncData = null;

        // Load data sequentially because constellation processing depends on star data
        this.loadStarData()
            .then(() => this.loadConstellationData())
            .then(() => {
                this.loadingComplete = true;
                if (this.data.showLines) {
                    this.renderConstellationLines();
                }
                if (this.pendingSyncData) {
                    console.log('Applying pending constellation sync after load');
                    this.syncConstellations(this.pendingSyncData);
                    this.pendingSyncData = null;
                } else {
                    const sharedData = this.getSharedActiveData();
                    if (sharedData && sharedData.length > 0) {
                        console.log('Applying initial shared constellations:', sharedData);
                        this.syncConstellations(sharedData);
                    }
                }
                console.log('Constellation system ready and data loaded. Total stars:', this.starPositions.size);

                // Start a periodic check in case we missed a sync during loading
                this.checkInterval = setInterval(() => this.checkSharedState(), 5000);
            })
            .catch(err => {
                console.error('Error loading constellation data:', err);
                this.loadingComplete = false;
            });
    },

    loadStarData: async function () {
        try {
            const response = await fetch(this.data.starDataUrl);
            const csvText = await response.text();
            const lines = csvText.trim().split('\n');

            const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const hipIndex = header.indexOf('hip');
            const idIndex = header.indexOf('id');
            const raIndex = header.indexOf('ra');
            const decIndex = header.indexOf('dec');

            console.log('Loading star data with indices:', { hipIndex, raIndex, decIndex });

            for (let i = 1; i < lines.length; i++) {
                const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
                if (values.length > Math.max(idIndex, raIndex, decIndex)) {
                    const hip = parseInt(values[hipIndex]);
                    const ra = parseFloat(values[raIndex]);
                    const dec = parseFloat(values[decIndex]);

                    if (!isNaN(hip) && !isNaN(ra) && !isNaN(dec)) {
                        const pos = this.raDecToPosition(ra, dec, this.data.radius);
                        this.starPositions.set(hip, pos);
                    }
                }
            }

            console.log(`Loaded ${this.starPositions.size} star positions from ${lines.length} lines`);
        } catch (error) {
            console.error('Error loading star data:', error);
            throw error;
        }
    },

    loadConstellationData: async function () {
        try {
            const response = await fetch(this.data.constellationDataUrl);
            this.constellationData = await response.json();

            // Pre-calculate centers for "area-based" pointing
            this.constellationData.constellations.forEach(c => {
                const bounds = this.getConstellationBounds(c);
                c.hitCenter = bounds.center.clone().normalize();
                // Radius in distance units on unit sphere (1.0 = 57 deg)
                // We want a minimum of roughly 20-30 degrees for easy pointing
                c.hitRadius = Math.max(Math.max(bounds.width, bounds.height) / 400 * 1.5, 0.4);
            });

            // Preload textures
            const loader = new THREE.TextureLoader();
            console.log('Preloading constellation illustrations...');
            this.constellationData.constellations.forEach(c => {
                if (c.image && c.image.file) {
                    const url = `/assets/constellations/${c.image.file}`;
                    loader.load(url, (tex) => {
                        this.textureCache.set(c.id, tex);
                    });
                }
            });

            console.log(`Loaded ${this.constellationData.constellations.length} constellation definitions`);
        } catch (error) {
            console.error('Error loading constellation data:', error);
            throw error;
        }
    },

    raDecToPosition: function (ra, dec, radius) {
        const raRad = (ra / 12) * Math.PI;
        const decRad = (dec * Math.PI) / 180;

        const x = radius * Math.cos(decRad) * Math.cos(raRad);
        const y = radius * Math.cos(decRad) * Math.sin(raRad);
        const z = radius * Math.sin(decRad);

        return new THREE.Vector3(x, y, z);
    },

    renderConstellationLines: function () {
        this.clearConstellationLines();

        const lineMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.data.lineColor),
            opacity: this.data.lineOpacity,
            transparent: true,
            fog: false,
            linewidth: this.data.lineWidth,
            depthWrite: false,
            depthTest: true
        });

        let totalLines = 0;

        this.constellationData.constellations.forEach(constellation => {
            if (!constellation.lines) return;

            constellation.lines.forEach(lineGroup => {
                for (let i = 0; i < lineGroup.length - 1; i++) {
                    const hip1 = lineGroup[i];
                    const hip2 = lineGroup[i + 1];

                    const pos1 = this.starPositions.get(hip1);
                    const pos2 = this.starPositions.get(hip2);

                    if (pos1 && pos2) {
                        const geometry = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
                        const line = new THREE.Line(geometry, lineMaterial);
                        line.name = `constellation-line-${constellation.id}`;
                        line.renderOrder = 7; // Below avatar (10)

                        this.el.object3D.add(line);
                        this.constellationLines.push(line);
                        totalLines++;
                    }
                }
            });
        });

        console.log(`Rendered ${totalLines} constellation line segments`);
    },

    clearConstellationLines: function () {
        this.constellationLines.forEach(line => {
            this.el.object3D.remove(line);
            if (line.geometry) line.geometry.dispose();
        });
        this.constellationLines = [];
    },



    // Find which constellation the user is pointing at
    findPointedConstellation: function (raycaster) {
        if (!this.loadingComplete || !this.constellationData) {
            return null;
        }

        const currentMode = window.currentMode || 'draw';
        const isConstMode = currentMode === 'constellation';

        if (!isConstMode) {
            return null;
        }

        // Force matrix update
        this.el.object3D.updateWorldMatrix(true, false);
        const worldToLocal = new THREE.Matrix4().copy(this.el.object3D.matrixWorld).invert();

        // 1. Get Ray in Local Space
        const localRayOrigin = raycaster.ray.origin.clone().applyMatrix4(worldToLocal);
        const localRayDirection = raycaster.ray.direction.clone().transformDirection(worldToLocal).normalize();

        // 2. Project local ray direction onto the sphere (since user is roughly at center)
        const hitPoint = localRayDirection.clone().multiplyScalar(this.data.radius);

        // 3. Direction from center to hit point is what we compare with stars
        const hitDir = hitPoint.clone().normalize();

        // Find the closest constellation based on center-point proximity
        let closestConstellation = null;
        let minDistance = Infinity;

        this.constellationData.constellations.forEach(constellation => {
            if (!constellation.hitCenter) return;

            const dist = hitDir.distanceTo(constellation.hitCenter);
            // check if we are within the constellation's area
            if (dist < constellation.hitRadius && dist < minDistance) {
                minDistance = dist;
                closestConstellation = constellation;
            }
        });



        return closestConstellation;
    },

    vectorToRaDec: function (vector) {
        const x = vector.x;
        const y = vector.y;
        const z = vector.z;

        const dec = Math.asin(y) * 180 / Math.PI;
        let ra = Math.atan2(x, z) * 12 / Math.PI;
        if (ra < 0) ra += 24;

        return { ra, dec };
    },

    // Create or update preview illustration
    updatePreview: function (constellation) {
        // Only skip if we already have a preview of THIS constellation
        if (this.previewIllustration && this.previewIllustration.userData.id === constellation?.id) return;

        // Old preview becomes a fading-out preview
        if (this.previewIllustration) {
            this.fadingOutPreviews.push({
                obj: this.previewIllustration,
                opacity: this.previewOpacity
            });
            this.previewIllustration = null;
        }

        this.currentPointedConstellation = constellation;
        this.previewOpacity = 0;

        if (constellation && constellation.image) {
            const illustRadius = 400;
            const bounds = this.getConstellationBounds(constellation, illustRadius);
            const previewSet = new THREE.Group();
            previewSet.name = 'preview-group';

            const illustrationGeo = new THREE.PlaneGeometry(bounds.width, bounds.height, 16, 16);
            const texture = this.textureCache.get(constellation.id);

            if (texture) {
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: texture },
                        opacity: { value: 0 },
                        targetRadius: { value: illustRadius }
                    },
                    vertexShader: `
                        uniform float targetRadius;
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            vec4 worldPos = modelMatrix * vec4(position, 1.0);
                            vec3 projected = normalize(worldPos.xyz) * targetRadius;
                            gl_Position = projectionMatrix * viewMatrix * vec4(projected, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform sampler2D map;
                        uniform float opacity;
                        varying vec2 vUv;
                        void main() {
                            vec4 tex = texture2D(map, vUv);
                            float brightness = max(tex.r, max(tex.g, tex.b));
                            if (brightness < 0.05) discard;
                            gl_FragColor = vec4(tex.rgb, tex.a * opacity);
                        }
                    `,
                    transparent: true,
                    side: THREE.DoubleSide,
                    depthTest: true,
                    depthWrite: false,
                    blending: THREE.NormalBlending
                });
                const mesh = new THREE.Mesh(illustrationGeo, material);
                mesh.renderOrder = 3;

                // Initial positioning (Parent entity center)
                const illustPos = bounds.center.clone().normalize().multiplyScalar(illustRadius);
                previewSet.position.copy(illustPos);
                previewSet.add(mesh);
                previewSet.userData.id = constellation.id;
                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;

                // Orientation logic handles rotation and fine-tuning via translateX/Y
                this.orientToAnchors(mesh, constellation);
            } else {
                // Fallback placeholder
                this.addPlaceholderToGroup(previewSet, illustrationGeo, 0.1);
                previewSet.position.copy(bounds.center.clone().normalize().multiplyScalar(illustRadius));
                previewSet.lookAt(0, 0, 0);
                previewSet.userData.id = constellation.id;
                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;
            }
        }
    },

    addPlaceholderToGroup: function (group, geometry, opacity) {
        const material = new THREE.MeshBasicMaterial({
            color: '#4499ff',
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            wireframe: true,
            fog: false,
            depthTest: false
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 3;
        group.add(mesh);
    },

    removePreview: function () {
        if (this.previewIllustration) {
            this.fadingOutPreviews.push({
                obj: this.previewIllustration,
                opacity: this.previewOpacity
            });
            this.previewIllustration = null;
        }
        this.currentPointedConstellation = null;
    },

    disposeHierarchy: function (obj) {
        obj.traverse(node => {
            if (node.geometry) node.geometry.dispose();
            if (node.material) {
                if (Array.isArray(node.material)) {
                    node.material.forEach(m => {
                        if (m.map) m.map.dispose();
                        m.dispose();
                    });
                } else {
                    if (node.material.map) node.material.map.dispose();
                    node.material.dispose();
                }
            }
        });
    },

    // State-based sync: Reconcile visible illustrations with the active list
    syncConstellations: function (activeItems) {
        if (!this.loadingComplete) {
            console.log('constellation-renderer: Data still loading, deferring sync');
            this.pendingSyncData = activeItems;
            return;
        }

        if (!Array.isArray(activeItems)) {
            console.warn('syncConstellations: Expected array, got', activeItems);
            return;
        }

        const activeData = activeItems.map(item => {
            if (typeof item === 'string') return { id: item, rot: null, pos: null };
            return item; // Keep objects for backward compatibility during transitions
        });
        const activeIds = activeData.map(d => d.id);

        // 1. Remove illustrations NOT in the new list
        for (let i = this.placedIllustrations.length - 1; i >= 0; i--) {
            const ent = this.placedIllustrations[i];
            const attr = ent.getAttribute('constellation-illustration');
            const id = (typeof attr === 'object' && attr !== null) ? attr.constellationId : ent.dataset.constellationId;

            if (id && !activeIds.includes(id)) {
                this.removeIllustrationEntity(ent);
                this.placedIllustrations.splice(i, 1);
            }
        }

        // 2. Add or update illustrations
        activeData.forEach(data => {
            if (!data.id) return;

            // Check if already exists
            const existing = this.placedIllustrations.find(e => {
                const attr = e.getAttribute('constellation-illustration');
                return (typeof attr === 'object' && attr !== null && attr.constellationId === data.id) || e.dataset.constellationId === data.id;
            });

            if (!existing) {
                const constellation = this.constellationData.constellations.find(c => c.id === data.id);
                if (constellation) {
                    console.log('constellation-renderer: Spawning local illustration for', data.id);
                    const entity = document.createElement('a-entity');
                    entity.dataset.constellationId = data.id;
                    entity.setAttribute('constellation-illustration', {
                        constellationId: data.id,
                        opacity: 0.1
                    });
                    this.el.appendChild(entity);
                    this.placedIllustrations.push(entity);
                } else {
                    console.warn('constellation-renderer: Could not find definition for', data.id);
                }
            }
        });
        console.log(`constellation-renderer: Sync complete. Active local illustrations: ${this.placedIllustrations.length}`);
    },

    removeIllustrationEntity: function (entity) {
        if (entity.components && entity.components['constellation-illustration']) {
            entity.components['constellation-illustration'].fadeOutAndRemove();
        } else if (entity.parentNode) {
            entity.parentNode.removeChild(entity);
        } else if (entity.isObject3D) {
            this.el.object3D.remove(entity);
            this.disposeHierarchy(entity);
        }
    },

    // Place illustration by updating the shared state
    placeIllustration: function () {
        if (!this.loadingComplete) return;

        if (!this.currentPointedConstellation) {
            console.warn('placeIllustration: No pointed constellation');
            return;
        }

        const id = this.currentPointedConstellation.id;
        console.log('Attempting to stamp constellation:', id);

        // Get current shared state, default to empty array if still INIT
        let activeData = this.getSharedActiveData() || [];
        console.log('placeIllustration: current shared state has', activeData.length, 'items');

        // RESURRECTION LOGIC:
        // If shared state is empty, but we have local illustrations, the network state might have been clobbered.
        // We should merge our local state to restore it.
        if (activeData.length === 0 && this.placedIllustrations.length > 0) {
            console.warn('placeIllustration: Shared state empty but local exists. Attempting resurrection.');
            this.placedIllustrations.forEach(ent => {
                const attr = ent.getAttribute('constellation-illustration');
                const localId = (typeof attr === 'object' && attr !== null) ? attr.constellationId : ent.dataset.constellationId;
                if (localId && !activeData.includes(localId)) {
                    activeData.push(localId);
                }
            });
            console.log('placeIllustration: Resurrected', activeData.length, 'items from local state.');
        }

        // Check if already active (one per ID for now)
        const isDuplicate = activeData.some(d => (typeof d === 'string' ? d === id : d.id === id));
        if (isDuplicate) {
            console.log('placeIllustration: Constellation already active:', id);
            return;
        }

        // Add to list as a simple ID string. Transforms are redundant since
        // the renderer calculates them from star data automatically.
        activeData.push(id);

        // Update shared state
        this.updateSharedState(activeData);
        console.log('Updated shared state with new illustration:', id);
    },

    // Remove the last placed illustration by updating shared state
    removeLastIllustration: function () {
        let activeData = this.getSharedActiveData() || [];

        // RESURRECTION: If network says empty but we have local items, use our local state
        if (activeData.length === 0 && this.placedIllustrations.length > 0) {
            console.warn('removeLastIllustration: Shared empty/local mismatch. Reconstructing from local.');
            this.placedIllustrations.forEach(ent => {
                const attr = ent.getAttribute('constellation-illustration');
                const localId = (typeof attr === 'object' && attr !== null) ? attr.constellationId : ent.dataset.constellationId;
                if (localId && !activeData.includes(localId)) {
                    activeData.push(localId);
                }
            });
        }

        if (activeData.length > 0) {
            const removed = activeData.pop();
            this.updateSharedState(activeData);
            console.log('Removed last illustration from shared state:', removed);
        }
    },

    // Clear all illustrations in shared state
    clearAllIllustrations: function () {
        this.updateSharedState([]);
        console.log('Cleared all illustrations in shared state');
    },

    // Remove specific illustration by its Object3D
    removeIllustrationByObject: function (obj) {
        let target = obj;
        // Traverse up to find the entity or ID
        while (target) {
            if (target.el && (target.el.dataset.constellationId || target.el.getAttribute('constellation-illustration'))) {
                break;
            }
            target = target.parent;
            if (!target || target.type === 'Scene') return;
        }

        if (target && target.el) {
            const attr = target.el.getAttribute('constellation-illustration');
            const id = (typeof attr === 'object' && attr !== null) ? attr.constellationId : target.el.dataset.constellationId;

            if (id) {
                console.log('removeIllustrationByObject: found ID', id);
                let activeData = this.getSharedActiveData() || [];
                // Filter out the ID
                const newData = activeData.filter(d => (typeof d === 'string' ? d : d.id) !== id);

                if (newData.length !== activeData.length) {
                    this.updateSharedState(newData);
                    console.log('Removed illustration via object match:', id);
                }
            }
        }
    },

    // Show illustrations for all constellations in shared state
    showAllIllustrations: function () {
        if (!this.loadingComplete || !this.constellationData) return;

        let activeData = this.getSharedActiveData() || [];

        // RESURRECTION: Reconstruct if needed
        if (activeData.length === 0 && this.placedIllustrations.length > 0) {
            console.log('showAllIllustrations: Reconstructing baseline from local state.');
            this.placedIllustrations.forEach(ent => {
                const attr = ent.getAttribute('constellation-illustration');
                const localId = (typeof attr === 'object' && attr !== null) ? attr.constellationId : ent.dataset.constellationId;
                if (localId && !activeData.includes(localId)) {
                    activeData.push(localId);
                }
            });
        }

        const currentIds = activeData.map(d => typeof d === 'string' ? d : d.id);

        this.constellationData.constellations.forEach(constellation => {
            if (constellation.image && !currentIds.includes(constellation.id)) {
                activeData.push(constellation.id); // Simple ID for non-stamped
            }
        });

        this.updateSharedState(activeData);
        console.log('Added all constellations to shared state');
    },

    // Helper to get parsed active data, handling the INIT sentinel
    getSharedActiveData: function () {
        const skyMaster = document.getElementById('sky-master');
        if (!skyMaster) return [];

        const state = skyMaster.getAttribute('sky-state');
        const raw = state?.activeConstellations;
        console.log('constellation-renderer: getSharedActiveData raw:', raw);
        if (!raw || raw === 'INIT') return null;

        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('constellation-renderer: Error parsing shared activeConstellations:', e, raw);
            return [];
        }
    },
    // Periodic check to ensure local state matches shared state
    checkSharedState: function () {
        if (!this.loadingComplete || typeof NAF === 'undefined' || !NAF.connection.isConnected()) return;

        const sharedData = this.getSharedActiveData();

        // RESURRECTION: If shared state is null (INIT) but we have valid local illustrations, 
        // it means the state was wiped (likely by a new master). We must fix it.
        if (sharedData === null) {
            if (this.placedIllustrations.length > 0) {
                console.warn("checkSharedState: Shared state is INIT but local is NOT. Triggering resurrection sync.");
                const localIds = this.placedIllustrations.map(e => {
                    const attr = e.getAttribute('constellation-illustration');
                    return (typeof attr === 'object' && attr !== null) ? attr.constellationId : e.dataset.constellationId;
                });
                // Only valid IDs
                const validIds = localIds.filter(id => id);
                if (validIds.length > 0) {
                    this.updateSharedState(validIds);
                }
            }
            return;
        }

        const localIds = this.placedIllustrations.map(e => {
            const attr = e.getAttribute('constellation-illustration');
            return (typeof attr === 'object' && attr !== null) ? attr.constellationId : e.dataset.constellationId;
        });

        const sharedIds = sharedData.map(d => typeof d === 'string' ? d : d.id);

        // If there is a mismatch, trigger a sync
        if (localIds.length !== sharedIds.length || localIds.some(id => !sharedIds.includes(id))) {
            console.log('constellation-renderer: Periodic check found mismatch, syncing...');
            this.syncConstellations(sharedData);
        }
    },


    // Helper to take ownership and update NAF state
    updateSharedState: function (activeData) {
        const skyMaster = document.getElementById('sky-master');
        if (!skyMaster) return;

        // AUTH CHECK: If we haven't received the room state yet, we are not allowed 
        // to take ownership or broadcast anything, as it would wipe the room.
        if (typeof window.canUpdateSkyState === 'function' && !window.canUpdateSkyState()) {
            console.warn('updateSharedState: Blocked update - still waiting for room state initialization.');
            return;
        }

        if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
            if (!NAF.utils.isMine(skyMaster)) {
                console.log('updateSharedState: Taking ownership of sky-master');
                NAF.utils.takeOwnership(skyMaster);
            }
        }

        // Use an object setAttribute to be consistent with syncSky in index.html
        // This ensures the property change is recognized by A-Frame and NAF correctly.
        const currentData = skyMaster.getAttribute('sky-state') || {};
        skyMaster.setAttribute('sky-state', {
            ...currentData,
            activeConstellations: JSON.stringify(activeData)
        });
    },

    // Distance jitter no longer needed as we use renderOrder
    getZOffset: function (constellationId) {
        return 0;
    },

    getConstellationBounds: function (constellation, targetRadius = 400) {
        if (!constellation.lines) {
            return {
                center: new THREE.Vector3(0, targetRadius, 0),
                width: 120,
                height: 120
            };
        }

        const positions = [];
        constellation.lines.forEach(lineGroup => {
            lineGroup.forEach(hipId => {
                const pos = this.starPositions.get(hipId);
                if (pos) positions.push(pos);
            });
        });

        const center = new THREE.Vector3();
        let finalWidth = 0;
        let finalHeight = 0;

        // Use anchor midpoint as the positioning center
        if (constellation.image && constellation.image.anchors && constellation.image.anchors.length >= 2) {
            const anchors = constellation.image.anchors;
            const p1 = this.starPositions.get(anchors[0].hip);
            const p2 = this.starPositions.get(anchors[1].hip);

            if (p1 && p2) {
                // Pin parent to the midpoint of the anchors
                center.copy(p1).add(p2).multiplyScalar(0.5);

                const p1_scaled = p1.clone().normalize().multiplyScalar(targetRadius);
                const p2_scaled = p2.clone().normalize().multiplyScalar(targetRadius);
                const worldDist = p1_scaled.distanceTo(p2_scaled);
                const dxPx = anchors[1].pos[0] - anchors[0].pos[0];
                const dyPx = anchors[1].pos[1] - anchors[0].pos[1];
                const pixelDist = Math.sqrt(dxPx * dxPx + dyPx * dyPx);

                if (pixelDist > 0) {
                    const scale = worldDist / pixelDist;
                    finalWidth = constellation.image.size[0] * scale * 1.05;
                    finalHeight = constellation.image.size[1] * scale * 1.05;
                }
            }
        }

        if (center.length() === 0) {
            positions.forEach(p => center.add(p));
            center.divideScalar(positions.length || 1);
        }

        if (!finalWidth || !finalHeight) {
            const box = new THREE.Box3().setFromPoints(positions);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = size.length();
            finalWidth = Math.max(maxDim * 1.1, 100);
            finalHeight = finalWidth;
        }

        return {
            center: center.normalize().multiplyScalar(targetRadius),
            width: finalWidth,
            height: finalHeight
        };
    },

    // Spherize logic moved to Vertex Shader for perfect projection
    spherizeGeometry: function (geometry, radius) {
        // No-op: handled by GPU now
    },

    orientToAnchors: function (object3D, constellation) {
        if (!constellation.image || !constellation.image.anchors || constellation.image.anchors.length < 2) {
            object3D.lookAt(0, 0, 0);
            return;
        }

        // Reset position/rotation for clean calculation
        object3D.position.set(0, 0, 0);
        object3D.rotation.set(0, 0, 0);

        const anchors = constellation.image.anchors;
        const star1Id = anchors[0].hip;
        const star2Id = anchors[1].hip;
        const p1_img = anchors[0].pos; // [x, y] pixels
        const p2_img = anchors[1].pos;

        const p1_renderer = this.starPositions.get(star1Id);
        const p2_renderer = this.starPositions.get(star2Id);

        if (!p1_renderer || !p2_renderer) {
            object3D.lookAt(0, 0, 0);
            return;
        }

        // Ensure matrices are up to date for space conversions
        this.el.object3D.updateWorldMatrix(true, false);
        object3D.updateWorldMatrix(true, true);

        // Convert star positions from renderer-local to world space
        const p1_3d = p1_renderer.clone().applyMatrix4(this.el.object3D.matrixWorld);
        const p2_3d = p2_renderer.clone().applyMatrix4(this.el.object3D.matrixWorld);

        // 1. Look at center (world 0,0,0)
        object3D.lookAt(0, 0, 0);
        object3D.updateWorldMatrix(true, false);

        // 2. Calculate roll
        // Transform world star positions to object's local space
        const localP1 = object3D.worldToLocal(p1_3d.clone());
        const localP2 = object3D.worldToLocal(p2_3d.clone());
        const localV3D = new THREE.Vector3().subVectors(localP2, localP1);

        // Target angle in local XY plane (Stars)
        const targetAngle = Math.atan2(localV3D.y, localV3D.x);

        // Image angle in pixel space
        const imgDX = p2_img[0] - p1_img[0];
        const imgDY = p1_img[1] - p2_img[1]; // Flipped for Cartesian
        const imgAngle = Math.atan2(imgDY, imgDX);

        // Rotate object around its local Z (Forward axis pointing at observer)
        const roll = targetAngle - imgAngle;
        object3D.rotateZ(roll);

        // 3. APPLY POSITION OFFSET
        // Shift the mesh so that the anchor midpoint matches the star midpoint
        const worldDist = p1_3d.distanceTo(p2_3d);
        const pixelDist = Math.sqrt(imgDX * imgDX + (p1_img[1] - p2_img[1]) * (p1_img[1] - p2_img[1]));

        if (pixelDist > 0) {
            const scale = worldDist / pixelDist;
            const imgSize = constellation.image.size;
            const mx = (anchors[0].pos[0] + anchors[1].pos[0]) / 2;
            const my = (anchors[0].pos[1] + anchors[1].pos[1]) / 2;
            const dx = (imgSize[0] / 2) - mx;
            const dy = (imgSize[1] / 2) - my;

            object3D.translateX(dx * scale);
            object3D.translateY(-dy * scale);
        }
    },

    update: function (oldData) {
        if (this.loadingComplete) {
            if (this.data.showLines !== oldData.showLines) {
                if (this.data.showLines) {
                    this.renderConstellationLines();
                } else {
                    this.clearConstellationLines();
                }
            }
        }
    },

    tick: function (t, dt) {
        if (!dt) return;
        const lerpFactor = 1 - Math.pow(0.001, dt / 1000); // 100ms halflife roughly

        // Handle Active Preview Fade
        if (this.previewIllustration) {
            const target = 0.1; // Reduced from 0.15
            this.previewOpacity += (target - this.previewOpacity) * lerpFactor;
            this.previewIllustration.traverse(node => {
                if (node.material) {
                    if (node.material.uniforms && node.material.uniforms.opacity) {
                        node.material.uniforms.opacity.value = this.previewOpacity;
                    } else if (node.material.transparent) {
                        node.material.opacity = this.previewOpacity * (0.1 / target);
                    }
                }
            });
        }

        // Handle Fading Out Previews
        for (let i = this.fadingOutPreviews.length - 1; i >= 0; i--) {
            const item = this.fadingOutPreviews[i];
            item.opacity += (0 - item.opacity) * lerpFactor;

            item.obj.traverse(node => {
                if (node.material) {
                    if (node.material.uniforms && node.material.uniforms.opacity) {
                        node.material.uniforms.opacity.value = item.opacity;
                    } else if (node.material.transparent) {
                        node.material.opacity = item.opacity * (0.1 / 0.1);
                    }
                }
            });

            if (item.opacity < 0.001) {
                this.el.object3D.remove(item.obj);
                this.disposeHierarchy(item.obj);
                this.fadingOutPreviews.splice(i, 1);
            }
        }
    },

    remove: function () {
        this.clearConstellationLines();
        this.clearAllIllustrations();
        this.removePreview();
    }
});
