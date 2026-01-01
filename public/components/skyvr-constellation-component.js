AFRAME.registerComponent('constellation-renderer', {
    schema: {
        constellationDataUrl: { type: 'string', default: '/assets/constellations/index.json' },
        starDataUrl: { type: 'string', default: '/data/hyglike_from_athyg_v31.csv' },
        lineColor: { type: 'color', default: '#4499ff' },
        lineOpacity: { type: 'number', default: 0.6 },
        lineWidth: { type: 'number', default: 2 },
        radius: { type: 'number', default: 394 },
        showLines: { type: 'boolean', default: false },
        illustrationOpacity: { type: 'number', default: 0.4 }
    },

    init: function () {
        this.loadingComplete = false;
        this.constellationData = null;
        this.starPositions = new Map();
        this.constellationLines = [];
        this.placedIllustrations = [];
        this.currentPointedConstellation = null;
        this.targetSphere = null;
        this.textureCache = new Map();

        this.createTargetSphere();

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
            linewidth: this.data.lineWidth
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

    createTargetSphere: function () {
        const geo = new THREE.SphereGeometry(4, 16, 16);
        const mat = new THREE.MeshBasicMaterial({
            color: '#ff00ff', // Magenta
            transparent: true,
            opacity: 0,
            depthTest: false,
            fog: false
        });
        this.targetSphere = new THREE.Mesh(geo, mat);
        this.targetSphere.renderOrder = 9999;
        this.targetSphere.name = 'constellation-target-diagnostic';

        // Add directly to the entity's object3D
        this.el.object3D.add(this.targetSphere);
    },

    // Find which constellation the user is pointing at
    findPointedConstellation: function (raycaster) {
        if (!this.loadingComplete || !this.constellationData) {
            if (this.targetSphere) this.targetSphere.material.opacity = 0;
            return null;
        }

        const currentMode = window.currentMode || 'draw';
        const isConstMode = currentMode === 'constellation';

        if (!isConstMode) {
            if (this.targetSphere) this.targetSphere.material.opacity = 0;
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

        // Update diagnostic sphere
        if (this.targetSphere) {
            this.targetSphere.position.copy(hitPoint);
            this.targetSphere.material.opacity = 0.8;
            this.targetSphere.visible = true;
            this.targetSphere.material.color.set('#ff00ff');
        }

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

        if (this.targetSphere && closestConstellation) {
            this.targetSphere.material.opacity = isConstMode ? 1.0 : 0;
            this.targetSphere.material.color.set('#00ff00'); // Turn green on hit
            this.targetSphere.scale.set(1.5, 1.5, 1.5);
        } else if (this.targetSphere) {
            this.targetSphere.scale.set(1.0, 1.0, 1.0);
            this.targetSphere.material.color.set('#ff00ff');
            this.targetSphere.material.opacity = isConstMode ? 0.3 : 0;
        }

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
        // Redraw preview
        if (constellation && constellation.image) {
            this.removePreview();

            const bounds = this.getConstellationBounds(constellation);
            const previewSet = new THREE.Group();
            previewSet.name = 'preview-group';

            // Illustration
            const texture = this.textureCache.get(constellation.id);
            const illustrationGeo = new THREE.PlaneGeometry(bounds.width * 1.2, bounds.height * 1.2, 16, 16);
            this.spherizeGeometry(illustrationGeo, 398);

            if (texture) {
                const material = new THREE.ShaderMaterial({
                    uniforms: {
                        map: { value: texture },
                        opacity: { value: 0.2 }
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
                mesh.renderOrder = 20;

                // Initial positioning (pushed back to 398)
                const illustPos = bounds.center.clone().normalize().multiplyScalar(398);
                previewSet.position.copy(illustPos);
                previewSet.add(mesh);

                // Correct orientation using anchors
                this.orientToAnchors(mesh, constellation);

                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;
            } else {
                // Fallback placeholder
                this.addPlaceholderToGroup(previewSet, illustrationGeo, 0.4);
                previewSet.position.copy(bounds.center.clone().normalize().multiplyScalar(398));
                previewSet.lookAt(0, 0, 0);
                this.el.object3D.add(previewSet);
                this.previewIllustration = previewSet;
            }
        } else {
            this.removePreview(); // Remove preview if no constellation or image
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

    // Place the current preview as a permanent illustration
    placeIllustration: function () {
        console.log('placeIllustration called. Current pointed:', this.currentPointedConstellation?.id);

        if (!this.currentPointedConstellation) {
            console.warn('Cannot place illustration: No constellation currently pointed at.');
            return;
        }

        const constellation = this.currentPointedConstellation;
        const name = constellation.common_name?.english || constellation.id;

        // Capture rotation from preview
        let meshRotation = { x: 0, y: 0, z: 0 };
        if (this.previewIllustration) {
            this.previewIllustration.traverse(node => {
                if (node.isMesh && node.material && node.material.type === 'ShaderMaterial') {
                    meshRotation = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
                }
            });
        }

        if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter && NAF.connection.adapter.getConnectStatus() === NAF.adapters.IS_CONNECTED) {
            console.log(`Instantiating networked illustration for ${name}...`);
            try {
                const entity = NAF.utils.instantiateEntity('#constellation-illustration-template');
                if (!entity) throw new Error('NAF.utils.instantiateEntity returned null');

                entity.setAttribute('constellation-illustration', {
                    constellationId: constellation.id,
                    opacity: 0.4,
                    rotation: meshRotation
                });

                // Add to the renderer element
                this.el.appendChild(entity);
                this.placedIllustrations.push(entity);
                console.log(`Successfully placed networked illustration for ${name}`);
            } catch (err) {
                console.error('Error instantiating networked constellation:', err);
                // Fallback to local if networked instantiation fails
                this.placeLocalIllustration(constellation);
            }
        } else {
            console.warn('NAF not connected, placing local illustration');
            this.placeLocalIllustration(constellation);
        }
    },

    placeLocalIllustration: function (constellation) {
        // Capture rotation from preview
        let meshRotation = { x: 0, y: 0, z: 0 };
        if (this.previewIllustration) {
            this.previewIllustration.traverse(node => {
                if (node.isMesh && node.material && node.material.type === 'ShaderMaterial') {
                    meshRotation = { x: node.rotation.x, y: node.rotation.y, z: node.rotation.z };
                }
            });
        }

        const entity = document.createElement('a-entity');
        entity.setAttribute('constellation-illustration', {
            constellationId: constellation.id,
            opacity: 0.4,
            rotation: meshRotation
        });
        this.el.appendChild(entity);
        this.placedIllustrations.push(entity);
        console.log(`Successfully placed local illustration for ${constellation.id}`);
    },

    // Remove the last placed illustration
    removeLastIllustration: function () {
        if (this.placedIllustrations.length === 0) return;

        const illustrationMatch = this.placedIllustrations.pop();
        // Check if the illustration is an A-Frame entity (has parentNode) or a raw THREE.Object3D
        if (illustrationMatch.parentNode) {
            illustrationMatch.parentNode.removeChild(illustrationMatch);
        } else if (illustrationMatch.isObject3D) { // Assuming it's a THREE.Object3D if not an A-Frame entity
            this.el.object3D.remove(illustrationMatch);
            this.disposeHierarchy(illustrationMatch);
        } else {
            console.warn('Attempted to remove an illustration that is neither an A-Frame entity nor a THREE.Object3D:', illustrationMatch);
        }

        console.log(`Removed last illustration (${this.placedIllustrations.length} remaining)`);
    },

    // Remove all placed illustrations
    clearAllIllustrations: function () {
        this.placedIllustrations.forEach(illustration => {
            // Check if the illustration is an A-Frame entity (has parentNode) or a raw THREE.Object3D
            if (illustration.parentNode) {
                illustration.parentNode.removeChild(illustration);
            } else if (illustration.isObject3D) { // Assuming it's a THREE.Object3D if not an A-Frame entity
                this.el.object3D.remove(illustration);
                this.disposeHierarchy(illustration);
            } else {
                console.warn('Attempted to clear an illustration that is neither an A-Frame entity nor a THREE.Object3D:', illustration);
            }
        });
        this.placedIllustrations = [];
        console.log('Cleared all illustrations');
    },

    getConstellationBounds: function (constellation) {
        if (!constellation.lines) {
            return {
                center: new THREE.Vector3(0, this.data.radius, 0),
                width: 100,
                height: 100
            };
        }

        const positions = [];
        constellation.lines.forEach(lineGroup => {
            lineGroup.forEach(hipId => {
                const pos = this.starPositions.get(hipId);
                if (pos) positions.push(pos);
            });
        });

        if (positions.length === 0) {
            return {
                center: new THREE.Vector3(0, this.data.radius, 0),
                width: 100,
                height: 100
            };
        }

        // Calculate center precisely as the average of star positions
        const center = new THREE.Vector3();
        positions.forEach(p => center.add(p));
        center.divideScalar(positions.length);

        // Map to sphere surface (radius 398 for illustrations)
        center.normalize().multiplyScalar(398);

        // Calculate bounding box in local tangent space for accurate width/height
        const box = new THREE.Box3().setFromPoints(positions);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = size.length();

        return {
            center: center,
            width: Math.max(maxDim * 0.9, 80),
            height: Math.max(maxDim * 0.9, 80)
        };
    },

    spherizeGeometry: function (geometry, radius) {
        const pos = geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const worldPos = v.clone();
            worldPos.z += radius;
            worldPos.normalize().multiplyScalar(radius);

            // Curved TOWARDS observer (Concave)
            pos.setXYZ(i, worldPos.x, worldPos.y, radius - worldPos.z);
        }
        pos.needsUpdate = true;
    },

    orientToAnchors: function (object3D, constellation) {
        if (!constellation.image || !constellation.image.anchors || constellation.image.anchors.length < 2) {
            object3D.lookAt(0, 0, 0);
            return;
        }

        const anchors = constellation.image.anchors;
        const star1Id = anchors[0].hip;
        const star2Id = anchors[1].hip;
        const p1_img = anchors[0].pos; // [x, y] pixels
        const p2_img = anchors[1].pos;

        const p1_3d = this.starPositions.get(star1Id);
        const p2_3d = this.starPositions.get(star2Id);

        if (!p1_3d || !p2_3d) {
            object3D.lookAt(0, 0, 0);
            return;
        }

        // 1. Look at center
        object3D.lookAt(0, 0, 0);
        object3D.updateWorldMatrix(true, false);

        // 2. Calculate roll
        // Vector between stars in 3D
        const v3d = new THREE.Vector3().subVectors(p2_3d, p1_3d);

        // Transform star positions to object's local space
        const localP1 = object3D.worldToLocal(p1_3d.clone());
        const localP2 = object3D.worldToLocal(p2_3d.clone());
        const localV3D = new THREE.Vector3().subVectors(localP2, localP1);

        // Target angle in local XY plane (Stars)
        const targetAngle = Math.atan2(localV3D.y, localV3D.x);

        // Image angle in pixel space
        // Note: Pixel Y increases DOWN, Three.js Y increases UP
        const imgDX = p2_img[0] - p1_img[0];
        const imgDY = p1_img[1] - p2_img[1]; // Flipped for Cartesian
        const imgAngle = Math.atan2(imgDY, imgDX);

        // Rotate object around its local Z (Forward axis)
        const roll = targetAngle - imgAngle;
        object3D.rotateZ(roll);
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
