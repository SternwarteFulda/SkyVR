AFRAME.registerComponent('drawing-stroke', {
    schema: {
        points: { type: 'array', default: [] },
        color: { type: 'color', default: 'yellow' },
        width: { type: 'number', default: 2.5 }
    },

    init: function () {
        // Ensure networked strokes are in the precession container for correct celestial alignment
        const container = document.getElementById('precession-container');
        if (container && this.el.parentNode !== container) {
            container.appendChild(this.el);
        }

        this.lineMaterial = new THREE.LineBasicMaterial({
            color: this.data.color,
            linewidth: this.data.width,
            transparent: true,
            opacity: 0.8,
            depthWrite: false, // Prevents Z-fighting
            fog: false
        });
        this.updateLine();
    },

    update: function (oldData) {
        if (JSON.stringify(oldData.points) !== JSON.stringify(this.data.points)) {
            this.updateLine();
        }
    },

    updateLine: function () {
        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
            this.mesh.geometry.dispose();
        }

        if (this.data.points.length < 2) return;

        // Points are stored as "x y z" strings in the array because of NAF serialization
        const points = this.data.points.map(p => {
            if (typeof p === 'string') {
                const parts = p.split(' ').map(parseFloat);
                return new THREE.Vector3(parts[0], parts[1], parts[2]);
            } else if (typeof p === 'object' && p !== null) {
                return new THREE.Vector3(p.x, p.y, p.z);
            }
            return p;
        });

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        this.mesh = new THREE.Line(geometry, this.lineMaterial);
        this.mesh.renderOrder = 100; // Above stars (20) and illustrations (10)
        this.el.object3D.add(this.mesh);
    },

    remove: function () {
        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
            this.mesh.geometry.dispose();
        }
        this.lineMaterial.dispose();
    }
});

AFRAME.registerComponent('constellation-illustration', {
    schema: {
        constellationId: { type: 'string' },
        opacity: { type: 'number', default: 0.4 },
        rotation: { type: 'vec3', default: { x: 0, y: 0, z: 0 } },
        position: { type: 'vec3', default: { x: 0, y: 0, z: 0 } }
    },

    init: function () {
        this.renderer = null;
        this.rendererReady = false;
        this.mesh = null;
        this.el.classList.add('networked-illustration');

        // Ensure networked illustrations are in the constellation-lines entity to maintain tilt alignment
        const container = document.getElementById('constellation-lines');
        if (container && this.el.parentNode !== container) {
            container.appendChild(this.el);
        }

        // Wait for constellation renderer to get data
        const checkRenderer = () => {
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl && rendererEl.components['constellation-renderer']) {
                const comp = rendererEl.components['constellation-renderer'];
                if (comp.loadingComplete) {
                    this.renderer = comp;
                    this.rendererReady = true;
                    this.setupIllustration();
                    return; // Stop checking
                }
            }
            setTimeout(checkRenderer, 500);
        };
        checkRenderer();
    },

    update: function (oldData) {
        // Trigger setup if we have an ID and (it's new OR rotation/position/ID changed)
        if (this.data.constellationId) {
            const idChanged = this.data.constellationId !== oldData.constellationId;
            const rotChanged = !oldData.rotation || this.data.rotation.x !== oldData.rotation.x || this.data.rotation.y !== oldData.rotation.y || this.data.rotation.z !== oldData.rotation.z;
            const posChanged = !oldData.position || this.data.position.x !== oldData.position.x || this.data.position.y !== oldData.position.y || this.data.position.z !== oldData.position.z;

            if (idChanged || rotChanged || posChanged) {
                this.setupIllustration();
            }
        }
    },

    setupIllustration: function () {
        // Only proceed if everything is ready
        if (!this.rendererReady || !this.data.constellationId) return;

        // Clear existing mesh if we are rebuilding
        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
            this.mesh = null;
        }

        const constellation = this.renderer.constellationData.constellations.find(c => c.id === this.data.constellationId);
        if (!constellation) return;

        const jitter = this.renderer.getZOffset(this.data.constellationId);
        const illustRadius = 395 + jitter;
        const bounds = this.renderer.getConstellationBounds(constellation, illustRadius);
        const imagePath = constellation.image ? `/assets/constellations/${constellation.image.file}` : null;

        const geometry = new THREE.PlaneGeometry(bounds.width, bounds.height, 16, 16);

        const addMesh = (texture) => {
            // Guard against async race conditions (if component removed/changed while loading)
            if (!this.el.parentNode) return;

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: texture },
                    opacity: { value: this.data.opacity },
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

            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 10; // Bottom Layer
            this.el.object3D.add(mesh);
            this.mesh = mesh; // Track it

            // Set position of the CONTAINER entity (which has no position sync)
            const pos = bounds.center.clone().normalize().multiplyScalar(illustRadius);
            this.el.object3D.position.copy(pos);

            // Orientation & Position: If we have explicit data (stamped), use it.
            // Otherwise (live preview or default), use orientToAnchors.
            const hasRotation = this.data.rotation && (this.data.rotation.x !== 0 || this.data.rotation.y !== 0 || this.data.rotation.z !== 0);
            const hasPosition = this.data.position && (this.data.position.x !== 0 || this.data.position.y !== 0 || this.data.position.z !== 0);

            if (hasRotation || hasPosition) {
                mesh.rotation.x = this.data.rotation.x;
                mesh.rotation.y = this.data.rotation.y;
                mesh.rotation.z = this.data.rotation.z;
                mesh.position.x = this.data.position.x;
                mesh.position.y = this.data.position.y;
                mesh.position.z = this.data.position.z;
            } else {
                this.renderer.orientToAnchors(mesh, constellation);
            }
        };

        if (imagePath) {
            new THREE.TextureLoader().load(imagePath, addMesh, undefined, () => {
                // Fallback placeholder
                const canvas = document.createElement('canvas');
                canvas.width = 128; canvas.height = 128;
                const ctx = canvas.getContext('2d');
                ctx.strokeStyle = '#4499ff';
                ctx.lineWidth = 4;
                ctx.strokeRect(10, 10, 108, 108);
                addMesh(new THREE.CanvasTexture(canvas));
            });
        } else {
            addMesh(null);
        }
    },


    remove: function () {
        // Clean up
        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material) this.mesh.material.dispose();
        }
    }
});
