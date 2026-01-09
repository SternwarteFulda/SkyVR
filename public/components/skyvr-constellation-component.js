AFRAME.registerComponent('constellation-renderer', {
    schema: {
        constellationDataUrl: { type: 'string', default: '/assets/constellations/index.json' },
        starDataUrl: { type: 'string', default: '/data/hyglike_from_athyg_v31.csv' },
        lineColor: { type: 'color', default: '#4499ff' },
        lineOpacity: { type: 'number', default: 0.6 },
        lineWidth: { type: 'number', default: 2 },
        stickFigureColor: { type: 'color', default: '#ffffff' },
        stickFigureWidth: { type: 'number', default: 3 },
        radius: { type: 'number', default: 400 },
        showLines: { type: 'boolean', default: false },
        showBoundaries: { type: 'boolean', default: false },
        boundaryColor: { type: 'color', default: '#ff4444' },
        boundaryOpacity: { type: 'number', default: 0.2 },
        illustrationOpacity: { type: 'number', default: 0.1 }
    },

    init: function () {
        this.loadingComplete = false;
        this.constellationData = null;
        this.starPositions = new Map();
        this.constellationLines = [];
        this.boundaryLines = [];
        this.placedIllustrations = [];
        this.currentPointedConstellation = null;
        this.textureCache = new Map();
        this.previewOpacity = 0;
        this.fadingOutPreviews = [];
        this.pendingSyncData = null;
        this.pulseOffset = Math.random() * 10000;

        // Fading controls for lines and boundaries
        this.currentLineOpacity = 0;
        this.targetLineOpacity = this.data.showLines ? this.data.lineOpacity : 0;
        this.currentBoundaryOpacity = 0;
        this.targetBoundaryOpacity = this.data.showBoundaries ? this.data.boundaryOpacity : 0;

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.data.lineColor),
            opacity: 0,
            transparent: true,
            fog: false,
            linewidth: this.data.lineWidth,
            depthWrite: false,
            depthTest: true
        });

        this.boundaryMaterial = new THREE.LineBasicMaterial({
            color: new THREE.Color(this.data.boundaryColor),
            opacity: 0,
            transparent: true,
            fog: false,
            linewidth: 1,
            depthWrite: false,
            depthTest: true
        });

        // Load data sequentially because constellation processing depends on star data
        this.loadStarData()
            .then(() => this.loadConstellationData())
            .then(() => {
                this.loadingComplete = true;
                if (this.data.showLines) {
                    this.renderConstellationLines();
                }
                if (this.data.showBoundaries) {
                    this.renderBoundaries();
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
                        const line = new THREE.Line(geometry, this.lineMaterial);
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
            if (line.parent) line.parent.remove(line);
            if (line.geometry) line.geometry.dispose();
            // Material is shared, so we don't dispose it here
        });
        this.constellationLines = [];
    },

    renderBoundaries: function () {
        this.clearBoundaries();
        if (!this.constellationData || !this.constellationData.edges) {
            console.warn('renderBoundaries: No edge data available');
            return;
        }

        let totalSegments = 0;
        this.constellationData.edges.forEach(edgeStr => {
            const parts = edgeStr.trim().split(/\s+/);
            if (parts.length < 6) return;

            // Format: "ID Type RA1 Dec1 RA2 Dec2 ..."
            const ra1 = this.parseHms(parts[2]);
            const dec1 = this.parseDms(parts[3]);
            const ra2 = this.parseHms(parts[4]);
            const dec2 = this.parseDms(parts[5]);

            if (isNaN(ra1) || isNaN(dec1) || isNaN(ra2) || isNaN(dec2)) return;

            // Normalize RA difference for shortest path across 0/24h meridian
            let dra = ra2 - ra1;
            if (dra > 12) dra -= 24;
            if (dra < -12) dra += 24;

            // Subdivide to follow curvature (roughly 1 step per degree of sky)
            const points = [];
            const steps = Math.max(1, Math.floor(Math.abs(dra) * 15 + Math.abs(dec2 - dec1)));

            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const r = ra1 + dra * t;
                const d = dec1 + (dec2 - dec1) * t;
                points.push(this.raDecToPosition(r, d, this.data.radius));
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geometry, this.boundaryMaterial);
            line.name = 'iau-boundary';
            line.renderOrder = 6;

            this.el.object3D.add(line);
            this.boundaryLines.push(line);
            totalSegments++;
        });

        console.log(`Rendered ${totalSegments} IAU boundary segments`);
    },

    clearBoundaries: function () {
        this.boundaryLines.forEach(line => {
            if (line.parent) line.parent.remove(line);
            if (line.geometry) line.geometry.dispose();
        });
        this.boundaryLines = [];
    },

    parseHms: function (hms) {
        if (!hms) return NaN;
        const parts = hms.split(':');
        if (parts.length < 2) return parseFloat(hms);
        return parseFloat(parts[0]) + (parseFloat(parts[1]) || 0) / 60 + (parseFloat(parts[2]) || 0) / 3600;
    },

    parseDms: function (dms) {
        if (!dms) return NaN;
        const sign = dms.startsWith('-') ? -1 : 1;
        const clean = dms.replace(/^[+-]/, '');
        const parts = clean.split(':');
        if (parts.length < 2) return parseFloat(dms);
        return sign * (parseFloat(parts[0]) + (parseFloat(parts[1]) || 0) / 60 + (parseFloat(parts[2]) || 0) / 3600);
    },



    // Find which constellation the user is pointing at
    findPointedConstellation: function (raycaster) {
        if (!this.loadingComplete || !this.constellationData) {
            return null;
        }

        const currentMode = window.currentMode || 'draw';
        const isConstMode = currentMode === 'constellation';
        const isStickMode = currentMode === 'stickfigure';

        if (!isConstMode && !isStickMode) {
            return null;
        }

        // Force matrix update
        this.el.object3D.updateWorldMatrix(true, false);
        const worldToLocal = new THREE.Matrix4().copy(this.el.object3D.matrixWorld).invert();

        // 1. Get Ray in Local Space
        const localRayOrigin = raycaster.ray.origin.clone().applyMatrix4(worldToLocal);
        const localRayDirection = raycaster.ray.direction.clone().transformDirection(worldToLocal).normalize();

        // 2. Ray-Sphere Intersection (radius = this.data.radius)
        // Ray: P = O + t*D. Sphere: |P|^2 = R^2
        // (O + t*D).(O + t*D) = R^2  => t^2 + 2t(O.D) + (O.O - R^2) = 0
        const R = this.data.radius;
        const b = localRayOrigin.dot(localRayDirection);
        const c = localRayOrigin.dot(localRayOrigin) - R * R;
        const disc = b * b - c;

        if (disc < 0) return null; // Ray doesn't hit the sphere

        // We want the intersection point in front of the ray. 
        // If inside the sphere, one root is positive, one is negative.
        const t = -b + Math.sqrt(disc);
        const hitPoint = localRayOrigin.clone().add(localRayDirection.clone().multiplyScalar(t));

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
    // Create or update preview illustration or stick figure
    updatePreview: function (constellation) {
        // Only skip if we already have a preview of THIS constellation
        if (this.previewIllustration && this.previewIllustration.userData.id === constellation?.id) {
            const currentMode = window.currentMode || 'draw';
            const isStick = currentMode === 'stickfigure';
            const prevWasStick = this.previewIllustration.userData.type === 'stick';
            // If mode changed (illustration <-> stick) for same constellation, we must recreate
            if (isStick === prevWasStick) return;
        }

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

        if (constellation) {
            const currentMode = window.currentMode || 'draw';

            if (currentMode === 'stickfigure') {
                // Stick Figure Preview
                const group = this.createStickFigure(constellation, this.data.stickFigureColor, 0); // Start opacity 0
                if (group) {
                    group.name = 'preview-group-stick';
                    group.userData.id = constellation.id;
                    group.userData.type = 'stick';
                    this.el.object3D.add(group);
                    this.previewIllustration = group;
                }
            } else if (constellation.image) {
                // Illustration Preview
                const illustRadius = 400;
                const bounds = this.getConstellationBounds(constellation, illustRadius);
                const previewSet = new THREE.Group();
                previewSet.name = 'preview-group-illust';

                const illustrationGeo = new THREE.PlaneGeometry(bounds.width, bounds.height, 16, 16);
                const texture = this.textureCache.get(constellation.id);

                if (texture) {
                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            map: { value: texture },
                            opacity: { value: 0 },
                            targetRadius: { value: illustRadius },
                            color: { value: new THREE.Color('#ffffff') }
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
                            uniform vec3 color;
                            varying vec2 vUv;
                            void main() {
                                vec4 tex = texture2D(map, vUv);
                                float brightness = max(tex.r, max(tex.g, tex.b));
                                if (brightness < 0.05) discard;
                                gl_FragColor = vec4(tex.rgb * color, tex.a * opacity);
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
                    previewSet.userData.type = 'illustration';
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
                    previewSet.userData.type = 'illustration';
                    this.el.object3D.add(previewSet);
                    this.previewIllustration = previewSet;
                }
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

        // 1. Remove items NOT in the new list (checking ID and TYPE)
        for (let i = this.placedIllustrations.length - 1; i >= 0; i--) {
            const ent = this.placedIllustrations[i];
            const datasetId = ent.dataset.constellationId;
            const datasetType = ent.dataset.type || 'illustration'; // Default to illustration

            // Check if this entity is still in the active list
            const stillActive = activeData.some(d => {
                const dId = d.id || d; // Handle string vs object
                const dType = d.type || 'illustration';
                return dId === datasetId && dType === datasetType;
            });

            if (!stillActive) {
                // Fade out and remove via component if available
                const illustComp = ent.components['constellation-illustration'];
                const stickComp = ent.components['constellation-stick-figure'];

                if (illustComp) illustComp.fadeOutAndRemove();
                else if (stickComp) stickComp.fadeOutAndRemove();
                else {
                    // Fallback for raw entities
                    this.removeIllustrationEntity(ent);
                }

                this.placedIllustrations.splice(i, 1);
            }
        }

        // 2. Add or update items
        activeData.forEach(data => {
            const id = data.id || data;
            const type = data.type || 'illustration';
            if (!id) return;

            // Check if already exists in our tracked list
            const existing = this.placedIllustrations.find(e => {
                return e.dataset.constellationId === id && (e.dataset.type || 'illustration') === type;
            });

            if (!existing) {
                const constellation = this.constellationData.constellations.find(c => c.id === id);
                if (constellation) {
                    const entity = document.createElement('a-entity');
                    entity.dataset.constellationId = id;
                    entity.dataset.type = type;

                    if (type === 'illustration') {
                        entity.setAttribute('constellation-illustration', {
                            constellationId: id,
                            opacity: 0.1
                        });
                    } else if (type === 'stick') {
                        entity.setAttribute('constellation-stick-figure', {
                            constellationId: id,
                            color: this.data.stickFigureColor,
                            opacity: 1.0
                        });

                        // Flash new stick figures as they bloom into being
                        entity.addEventListener('componentinitialized', (evt) => {
                            if (evt.detail.name === 'constellation-stick-figure') {
                                setTimeout(() => {
                                    if (entity.components['constellation-stick-figure']) {
                                        entity.components['constellation-stick-figure'].flash();
                                    }
                                }, 50);
                            }
                        });
                    }

                    this.el.appendChild(entity);
                    this.placedIllustrations.push(entity);
                }
            }
        });
        console.log(`constellation-renderer: Sync complete. Tracked items: ${this.placedIllustrations.length}`);
    },

    isZodiac: function (constellationId) {
        if (!constellationId) return false;
        const zodiacIds = [
            'Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir',
            'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'
        ];
        return zodiacIds.some(z => constellationId.includes(z));
    },

    createStickFigure: function (constellation, colorOverride, opacityOverride) {
        if (!constellation.lines) {
            console.warn('createStickFigure: No lines data for', constellation.id);
            return null;
        }

        // FORCE COLORS & ZODIAC DETECTION
        const isZod = this.isZodiac(constellation.id);
        const zodiacColor = '#ffd700'; // Golden
        const standardColor = '#00ffff'; // Cyan

        let colorStr = isZod ? zodiacColor : (colorOverride || standardColor);
        if (!colorStr || colorStr === '#ffffff' || colorStr === 'white' || colorStr === '#FFFFFF') {
            colorStr = standardColor;
        }

        const glowColor = new THREE.Color(colorStr);
        const alpha = opacityOverride !== undefined ? opacityOverride : 1.0;

        // LAYER 1: Core (Sharp, thin center)
        const coreMaterial = new THREE.LineBasicMaterial({
            color: isZod ? new THREE.Color('#fff4cc') : new THREE.Color('#ffffff'),
            opacity: alpha * 0.3,
            transparent: true,
            fog: false,
            linewidth: 1,
            depthWrite: false,
            depthTest: true
        });

        // LAYER 2: Inner Glow
        const innerGlowMaterial = new THREE.LineBasicMaterial({
            color: glowColor,
            opacity: alpha * 0.15,
            transparent: true,
            fog: false,
            linewidth: 2,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
        });

        // LAYER 3: Outer Soft Bloom
        const outerGlowMaterial = new THREE.LineBasicMaterial({
            color: glowColor,
            opacity: alpha * 0.08,
            transparent: true,
            fog: false,
            linewidth: 16,
            depthWrite: false,
            depthTest: true,
            blending: THREE.AdditiveBlending
        });

        const group = new THREE.Group();
        group.name = `stick-figure-${constellation.id}`;

        constellation.lines.forEach(lineGroup => {
            for (let i = 0; i < lineGroup.length - 1; i++) {
                const hip1 = lineGroup[i];
                const hip2 = lineGroup[i + 1];
                const p1 = this.starPositions.get(hip1);
                const p2 = this.starPositions.get(hip2);

                if (p1 && p2) {
                    const geometry = new THREE.BufferGeometry().setFromPoints([p1, p2]);

                    const lineOuter = new THREE.Line(geometry.clone(), outerGlowMaterial);
                    lineOuter.renderOrder = 7;
                    group.add(lineOuter);

                    const lineInner = new THREE.Line(geometry.clone(), innerGlowMaterial);
                    lineInner.renderOrder = 8;
                    group.add(lineInner);

                    const lineCore = new THREE.Line(geometry, coreMaterial);
                    lineCore.renderOrder = 9;
                    group.add(lineCore);
                }
            }
        });

        return group;
    },

    removeIllustrationEntity: function (entity) {
        if (entity.components && entity.components['constellation-illustration']) {
            entity.components['constellation-illustration'].fadeOutAndRemove();
        } else if (entity.components && entity.components['constellation-stick-figure']) {
            entity.components['constellation-stick-figure'].fadeOutAndRemove();
        } else if (entity.parentNode) {
            entity.parentNode.removeChild(entity);
        } else if (entity.isObject3D) {
            this.el.object3D.remove(entity);
            this.disposeHierarchy(entity);
        }
    },

    // Place item (illustration or stick figure)
    placeItem: function (type) {
        if (!this.loadingComplete) return;

        if (!this.currentPointedConstellation) {
            console.warn('placeItem: No pointed constellation');
            return;
        }

        const id = this.currentPointedConstellation.id;
        const finalType = type || 'illustration';
        console.log(`Attempting to stamp ${finalType}:`, id);

        // Get current shared state
        let activeData = this.getSharedActiveData() || [];

        // RESURRECTION logic omitted for brevity in this step, but ideally should be here or handled globally

        // Normalize activeData to objects for comparison
        // Check if already active
        const isDuplicate = activeData.some(d => {
            const dId = d.id || d;
            const dType = d.type || 'illustration';
            return dId === id && dType === finalType;
        });

        if (isDuplicate) {
            console.log(`placeItem: ${finalType} already active:`, id);
            return;
        }

        // Add to list
        if (finalType === 'illustration') {
            activeData.push(id); // Keep string format for backward compat where possible
        } else {
            activeData.push({ id: id, type: finalType });
        }

        this.updateSharedState(activeData);
        console.log('Updated shared state with new item:', id, finalType);
    },

    placeIllustration: function () {
        this.placeItem('illustration');
    },

    placeStickFigure: function () {
        this.placeItem('stick');
    },

    // Generalized removal
    removeItemById: function (id, type) {
        console.log('removeItemById:', id, type);
        let activeData = this.getSharedActiveData() || [];
        const finalType = type || 'illustration';

        const newData = activeData.filter(d => {
            const dId = d.id || d;
            const dType = d.type || 'illustration';
            return !(dId === id && dType === finalType);
        });

        if (newData.length !== activeData.length) {
            this.updateSharedState(newData);
            console.log('Removed item via ID/Type:', id, finalType);
        }
    },

    removeIllustrationById: function (id) {
        this.removeItemById(id, 'illustration');
    },

    highlightItem: function (id, type) {
        const item = this.placedIllustrations.find(e => {
            return e.dataset.constellationId === id && (e.dataset.type || 'illustration') === (type || 'illustration');
        });

        if (item) {
            const illustComp = item.components['constellation-illustration'];
            const stickComp = item.components['constellation-stick-figure'];
            if (illustComp) illustComp.setHighlight(true);
            else if (stickComp) stickComp.setHighlight(true);
        }
    },

    clearHighlights: function () {
        this.placedIllustrations.forEach(item => {
            const illustComp = item.components['constellation-illustration'];
            const stickComp = item.components['constellation-stick-figure'];
            if (illustComp) illustComp.setHighlight(false);
            else if (stickComp) stickComp.setHighlight(false);
        });
    },

    isItemActive: function (id, type) {
        const finalType = type || 'illustration';
        return this.placedIllustrations.some(ent => {
            return ent.dataset.constellationId === id && (ent.dataset.type || 'illustration') === finalType;
        });
    },

    isIllustrationActive: function (id) {
        return this.isItemActive(id, 'illustration');
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
        console.log('clearAllIllustrations: Fading out and clearing state');

        // 1. Locally fade out everything and clear the tracking list
        this.placedIllustrations.forEach(ent => {
            const illustComp = ent.components['constellation-illustration'];
            const stickComp = ent.components['constellation-stick-figure'];
            if (illustComp) illustComp.fadeOutAndRemove();
            else if (stickComp) stickComp.fadeOutAndRemove();
            else if (ent.parentNode) ent.parentNode.removeChild(ent);
        });

        this.placedIllustrations = [];

        // 2. Update shared state and trigger network sync
        this.updateSharedState([]);
        if (typeof syncSky === 'function') syncSky();
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
            const type = target.el.dataset.type || 'illustration';

            if (id) {
                this.removeItemById(id, type);
            }
        }
    },

    // Show illustrations for all constellations in shared state
    showAllIllustrations: function (typeOverride) {
        if (!this.loadingComplete || !this.constellationData) return;

        let activeData = this.getSharedActiveData() || [];
        const currentMode = window.currentMode || 'draw';
        const targetType = typeOverride || (currentMode === 'stickfigure' ? 'stick' : 'illustration');



        // RESURRECTION: Reconstruct from local if empty
        if (activeData.length === 0 && this.placedIllustrations.length > 0) {
            this.placedIllustrations.forEach(ent => {
                const datasetId = ent.dataset.constellationId;
                const type = ent.dataset.type || 'illustration';
                if (datasetId) {
                    if (type === 'illustration') activeData.push(datasetId);
                    else activeData.push({ id: datasetId, type: type });
                }
            });
        }

        // Convert to checkable list [ {id, type}, ... ]
        // We need to differentiate types in our check list to avoid re-adding
        const activeItems = activeData.map(d => {
            if (typeof d === 'string') return { id: d, type: 'illustration' };
            return { id: d.id, type: d.type || 'illustration' };
        });

        let addedCount = 0;
        this.constellationData.constellations.forEach(constellation => {
            // Check if this constellation + type is already active
            const isAlreadyActive = activeItems.some(item => item.id === constellation.id && item.type === targetType);

            if (constellation.image && !isAlreadyActive) {
                if (targetType === 'illustration') {
                    activeData.push(constellation.id);
                } else {
                    activeData.push({ id: constellation.id, type: targetType });
                }
                addedCount++;
            }
        });


        this.updateSharedState(activeData);
        console.log(`Added all constellations (${targetType}) to shared state`);
    },

    // Helper to get parsed active data, handling the INIT sentinel
    getSharedActiveData: function () {
        const skyMaster = document.getElementById('sky-master');
        if (!skyMaster) return [];

        const state = skyMaster.getAttribute('sky-state');
        const raw = state?.activeConstellations;
        if (!raw || raw === 'INIT') return null;

        try {
            return JSON.parse(raw);
        } catch (e) {
            console.error('Error parsing shared activeConstellations:', e);
            return [];
        }
    },

    // Periodic check to ensure local state matches shared state
    checkSharedState: function () {
        if (!this.loadingComplete || typeof NAF === 'undefined' || !NAF.connection.isConnected()) return;

        const sharedData = this.getSharedActiveData();

        if (sharedData === null) {
            // Resurrection logic if shared is INIT but local has stuff
            if (this.placedIllustrations.length > 0) {
                const localItems = this.placedIllustrations.map(e => {
                    const id = e.dataset.constellationId;
                    const type = e.dataset.type || 'illustration';
                    return type === 'illustration' ? id : { id: id, type: type };
                }).filter(x => x);

                if (localItems.length > 0) this.updateSharedState(localItems);
            }
            return;
        }

        // Compare logic is complex with objects/strings, simplistic check:
        // If counts differ, sync.
        if (this.placedIllustrations.length !== sharedData.length) {
            this.syncConstellations(sharedData);
        }
    },

    // Helper to take ownership and update NAF state
    updateSharedState: function (activeData) {
        const skyMaster = document.getElementById('sky-master');
        if (!skyMaster) return;

        if (typeof window.canUpdateSkyState === 'function' && !window.canUpdateSkyState()) {
            return;
        }

        if (typeof NAF !== 'undefined' && NAF.connection.isConnected()) {
            if (!NAF.utils.isMine(skyMaster)) {
                NAF.utils.takeOwnership(skyMaster);
            }
        }

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
                this.targetLineOpacity = this.data.showLines ? this.data.lineOpacity : 0;
                if (this.data.showLines && this.constellationLines.length === 0) {
                    this.renderConstellationLines();
                }
            }
            if (this.data.showBoundaries !== oldData.showBoundaries) {
                this.targetBoundaryOpacity = this.data.showBoundaries ? this.data.boundaryOpacity : 0;
                if (this.data.showBoundaries && this.boundaryLines.length === 0) {
                    this.renderBoundaries();
                }
            }
        }
    },

    tick: function (t, dt) {
        if (!dt) return;

        // Fast Responsive easing for previews
        const inLerp = 1 - Math.pow(0.01, dt / 1000);   // ~100ms for full preview
        const outLerp = 1 - Math.pow(0.001, dt / 1000); // Near instant clear
        const fadeLerp = 1 - Math.pow(0.05, dt / 1000);  // ~300ms for everything else

        // Fade constellation lines
        if (Math.abs(this.currentLineOpacity - this.targetLineOpacity) > 0.001) {
            this.currentLineOpacity += (this.targetLineOpacity - this.currentLineOpacity) * fadeLerp;
            this.lineMaterial.opacity = this.currentLineOpacity;
        }

        // Fade IAU boundaries
        if (Math.abs(this.currentBoundaryOpacity - this.targetBoundaryOpacity) > 0.001) {
            this.currentBoundaryOpacity += (this.targetBoundaryOpacity - this.currentBoundaryOpacity) * fadeLerp;
            this.boundaryMaterial.opacity = this.currentBoundaryOpacity;
        }

        // Handle Active Preview Fade & Pulse
        if (this.previewIllustration) {
            const id = this.currentPointedConstellation ? this.currentPointedConstellation.id : '';
            const isZod = this.isZodiac(id);
            const type = this.previewIllustration.userData.type || 'illustration';
            const target = (type === 'stick') ? 0.4 : 0.1;

            // Use inLerp for blooming
            this.previewOpacity += (target - this.previewOpacity) * inLerp;
            const pulse = (type === 'stick') ? (0.75 + Math.sin((t + this.pulseOffset) / 800) * 0.25) : 1.0;

            this.previewIllustration.traverse(node => {
                if (node.material) {
                    if (node.material.uniforms && node.material.uniforms.opacity) {
                        node.material.uniforms.opacity.value = this.previewOpacity * pulse;
                    } else if (node.material.transparent) {
                        // Apply base alpha for our 3-layer system
                        let base = 1.0;
                        if (node.renderOrder === 7) base = 0.08; // Bloom
                        if (node.renderOrder === 8) base = 0.15; // Inner Glow
                        if (node.renderOrder === 9) base = 0.3;  // Core
                        node.material.opacity = Math.min(this.previewOpacity * pulse * base, 1.0);

                        // Enforce colors in preview
                        if (node.renderOrder < 9) {
                            node.material.color.set(isZod ? '#ffd700' : '#00ffff');
                        } else if (node.renderOrder === 9) {
                            node.material.color.set(isZod ? '#fff4cc' : '#ffffff');
                        }
                    }
                }
            });
        }

        // Handle Fading Out Previews
        for (let i = this.fadingOutPreviews.length - 1; i >= 0; i--) {
            const item = this.fadingOutPreviews[i];

            // Balanced fade out for cleaning up
            item.opacity += (0 - item.opacity) * outLerp;

            item.obj.traverse(node => {
                if (node.material && node.material.transparent) {
                    let base = 1.0;
                    if (node.renderOrder === 7) base = 0.08;
                    if (node.renderOrder === 8) base = 0.15;
                    if (node.renderOrder === 9) base = 0.3;

                    const final = Math.min(item.opacity * base, 1.0);

                    if (node.material.uniforms && node.material.uniforms.opacity) {
                        node.material.uniforms.opacity.value = final;
                    } else {
                        node.material.opacity = final;
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
