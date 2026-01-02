AFRAME.registerComponent('constellation-renderer', {
    schema: {
        constellationDataUrl: { type: 'string', default: '/assets/constellations/index.json' },
        starDataUrl: { type: 'string', default: '/data/hyglike_from_athyg_v31.csv' },
        lineColor: { type: 'color', default: '#4499ff' },
        lineOpacity: { type: 'number', default: 0.6 },
        lineWidth: { type: 'number', default: 2 },
        radius: { type: 'number', default: 394 },
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

        // Load data sequentially because constellation processing depends on star data
        this.loadStarData()
            .then(() => this.loadConstellationData())
            .then(() => {
                this.loadingComplete = true;
                if (this.data.showLines) {
                    this.renderConstellationLines();
                }
                console.log('Constellation system ready and data loaded. Total stars:', this.starPositions.size);
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
                        line.renderOrder = 30; // Above stars (20) and illustrations (10)

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
        if (constellation && constellation.image) {
            this.removePreview();

            const jitter = this.getZOffset(constellation.id);
            const illustRadius = 395 + jitter;
            const bounds = this.getConstellationBounds(constellation, illustRadius);
            const previewSet = new THREE.Group();
            previewSet.name = 'preview-group';

            const illustrationGeo = new THREE.PlaneGeometry(bounds.width, bounds.height, 16, 16);
            const texture = this.textureCache.get(constellation.id);

            if (texture) {
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: texture },
                        opacity: { value: 0.05 },
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
                mesh.renderOrder = 10;

                // Initial positioning (Parent entity center)
                const illustPos = bounds.center.clone().normalize().multiplyScalar(illustRadius);
                previewSet.position.copy(illustPos);
                previewSet.add(mesh);
                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;

                // Orientation logic handles rotation and fine-tuning via translateX/Y
                this.orientToAnchors(mesh, constellation);
            } else {
                // Fallback placeholder
                this.addPlaceholderToGroup(previewSet, illustrationGeo, 0.4);
                previewSet.position.copy(bounds.center.clone().normalize().multiplyScalar(illustRadius));
                previewSet.lookAt(0, 0, 0);
                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;
            }
        } else {
            this.removePreview();
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
        mesh.renderOrder = 10;
        group.add(mesh);
    },

    removePreview: function () {
        if (this.previewIllustration) {
            this.el.object3D.remove(this.previewIllustration);
            this.disposeHierarchy(this.previewIllustration);
            this.previewIllustration = null;
        }
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
    syncConstellations: function (activeIds) {
        if (!Array.isArray(activeIds)) return;

        // 1. Remove illustrations NOT in the new list
        for (let i = this.placedIllustrations.length - 1; i >= 0; i--) {
            const ent = this.placedIllustrations[i];
            // If it's a networked entity, it might have the component; if local, it definitely does.
            const attr = ent.getAttribute('constellation-illustration');
            const id = attr ? attr.constellationId : null;

            if (id && !activeIds.includes(id)) {
                this.removeIllustrationEntity(ent);
                this.placedIllustrations.splice(i, 1);
            }
        }

        // 2. Add illustrations that are NEW
        const currentIds = this.placedIllustrations.map(e => {
            const attr = e.getAttribute('constellation-illustration');
            return attr ? attr.constellationId : null;
        });

        activeIds.forEach(id => {
            if (id && !currentIds.includes(id)) {
                const constellation = this.constellationData.constellations.find(c => c.id === id);
                if (constellation) {
                    this.placeLocalIllustration(constellation);
                }
            }
        });
    },

    removeIllustrationEntity: function (entity) {
        if (entity.parentNode) {
            entity.parentNode.removeChild(entity);
        } else if (entity.isObject3D) {
            this.el.object3D.remove(entity);
            this.disposeHierarchy(entity);
        }
    },

    // Place illustration by updating Global State
    // Place illustration by updating Global State
    placeIllustration: function () {
        if (!this.currentPointedConstellation) {
            console.warn('placeIllustration: No pointed constellation');
            return;
        }
        const id = this.currentPointedConstellation.id;
        console.log('Attempting to stamp constellation:', id);

        const master = document.getElementById('sky-master');
        if (master) {
            const isConnected = typeof NAF !== 'undefined' && NAF.connection.isConnected();

            if (isConnected) {
                // Try to take ownership if we don't have it
                if (!NAF.utils.isMine(master) && !NAF.utils.takeOwnership(master)) {
                    console.warn('Failed to take ownership of sky-master. Cannot sync stamp.');
                    return;
                }

                // We own it (or are local), proceed to update state
                const skyState = master.getAttribute('sky-state');
                let currentList = [];
                try {
                    if (skyState && skyState.activeConstellations) {
                        // Handle both string (from schema-string) and potentially pre-parsed scenarios
                        const raw = skyState.activeConstellations;
                        currentList = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    }
                } catch (e) {
                    console.warn('Error parsing activeConstellations:', e);
                    currentList = [];
                }

                if (!Array.isArray(currentList)) currentList = [];

                if (!currentList.includes(id)) {
                    currentList.push(id);
                    const newString = JSON.stringify(currentList);
                    master.setAttribute('sky-state', 'activeConstellations', newString);
                    console.log('Updated global state activeConstellations:', newString);
                } else {
                    console.log('Constellation already active:', id);
                }
            } else {
                console.warn('NAF not connected. Fallback to local placement.');
                this.placeLocalIllustration(this.currentPointedConstellation);
            }
        } else {
            console.error('sky-master entity not found!');
            this.placeLocalIllustration(this.currentPointedConstellation);
        }
    },

    placeLocalIllustration: function (constellation, explicitRotation = null, explicitPosition = null) {
        let rotationToUse = explicitRotation;
        let positionToUse = explicitPosition;

        // If no explicit data provided, try to grab from preview
        if (!rotationToUse && this.previewIllustration && this.currentPointedConstellation?.id === constellation.id) {
            this.previewIllustration.traverse(node => {
                if (node.isObject3D && node.material && node.material.type === 'ShaderMaterial') {
                    rotationToUse = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
                    positionToUse = { x: node.position.x, y: node.position.y, z: node.position.z };
                }
            });
        }

        const entity = document.createElement('a-entity');
        entity.setAttribute('constellation-illustration', {
            constellationId: constellation.id,
            opacity: 0.1,
            rotation: rotationToUse || { x: 0, y: 0, z: 0 },
            position: positionToUse || { x: 0, y: 0, z: 0 }
        });
        this.el.appendChild(entity);
        this.placedIllustrations.push(entity);
        console.log(`Successfully placed local illustration for ${constellation.id}`);
    },

    // Remove the last placed illustration by updating Global State
    removeLastIllustration: function () {
        const master = document.getElementById('sky-master');
        if (master) {
            const isConnected = typeof NAF !== 'undefined' && NAF.connection.isConnected();
            if (isConnected) {
                // Try to take ownership if we don't have it
                if (!NAF.utils.isMine(master) && !NAF.utils.takeOwnership(master)) {
                    console.warn('Failed to take ownership of sky-master. Cannot sync remove.');
                    return;
                }

                const skyState = master.getAttribute('sky-state');
                let currentList = [];
                try {
                    if (skyState && skyState.activeConstellations) {
                        const raw = skyState.activeConstellations;
                        currentList = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    }
                } catch (e) {
                    console.warn('Error parsing activeConstellations for removal', e);
                    currentList = [];
                }

                if (Array.isArray(currentList) && currentList.length > 0) {
                    const removed = currentList.pop();
                    master.setAttribute('sky-state', 'activeConstellations', JSON.stringify(currentList));
                    console.log('Removed constellation from global state:', removed);
                } else {
                    console.log('No constellations to remove in global state');
                }
            } else {
                console.warn('NAF not connected. Fallback local removal.');
                if (this.placedIllustrations.length > 0) {
                    const illustrationMatch = this.placedIllustrations.pop();
                    this.removeIllustrationEntity(illustrationMatch);
                }
            }
        } else {
            // Fallback local removal
            if (this.placedIllustrations.length > 0) {
                const illustrationMatch = this.placedIllustrations.pop();
                this.removeIllustrationEntity(illustrationMatch);
            }
        }
    },

    // Clear all illustrations by updating Global State
    clearAllIllustrations: function () {
        const master = document.getElementById('sky-master');
        if (master) {
            const isConnected = typeof NAF !== 'undefined' && NAF.connection.isConnected();
            if (isConnected) {
                if (!NAF.utils.isMine(master) && !NAF.utils.takeOwnership(master)) {
                    console.warn('Failed to take ownership of sky-master. Cannot sync clear.');
                    return;
                }
                // Simply set to empty array
                master.setAttribute('sky-state', 'activeConstellations', '[]');
                console.log('Cleared all constellations from global state');
            } else {
                this.localClearAll();
            }
        } else {
            this.localClearAll();
        }
    },

    // Show illustrations for all constellations by updating Global State
    showAllIllustrations: function () {
        if (!this.loadingComplete || !this.constellationData) return;

        const master = document.getElementById('sky-master');
        if (master) {
            const isConnected = typeof NAF !== 'undefined' && NAF.connection.isConnected();
            if (isConnected) {
                if (!NAF.utils.isMine(master) && !NAF.utils.takeOwnership(master)) {
                    console.warn('Failed to take ownership of sky-master. Cannot sync show all.');
                    return;
                }

                const allIds = [];
                this.constellationData.constellations.forEach(constellation => {
                    if (constellation.image) {
                        allIds.push(constellation.id);
                    }
                });

                master.setAttribute('sky-state', 'activeConstellations', JSON.stringify(allIds));
                console.log('Set global state to show all constellations');
            } else {
                this.localShowAll();
            }
        } else {
            this.localShowAll();
        }
    },

    // Internal helper for local clearing
    localClearAll: function () {
        this.placedIllustrations.forEach(illustration => {
            this.removeIllustrationEntity(illustration);
        });
        this.placedIllustrations = [];
        console.log('Locally cleared all illustrations');
    },

    // Internal helper for local showing
    localShowAll: function () {
        this.localClearAll();
        this.constellationData.constellations.forEach(constellation => {
            if (constellation.image) {
                this.placeLocalIllustration(constellation);
            }
        });
        console.log('Locally showing all illustrations');
    },

    // Helper for depth stacking to avoid z-fighting
    getZOffset: function (constellationId) {
        let hash = 0;
        for (let i = 0; i < constellationId.length; i++) {
            hash = constellationId.charCodeAt(i) + ((hash << 5) - hash);
        }
        return (Math.abs(hash) % 1000) / 1000 * 0.5; // Small 0.5m jitter
    },

    getConstellationBounds: function (constellation, targetRadius = 395) {
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

    remove: function () {
        this.clearConstellationLines();
        this.clearAllIllustrations();
        this.removePreview();
    }
});
