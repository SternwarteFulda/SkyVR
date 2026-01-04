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
            if (!NAF.utils.isMine(this.el)) {
                setTimeout(() => {
                    if (container && this.el.parentNode !== container) {
                        container.appendChild(this.el);
                    }
                }, 50);
            } else {
                container.appendChild(this.el);
            }
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
        opacity: { type: 'number', default: 0.1 }
    },

    init: function () {
        this.renderer = null;
        this.rendererReady = false;
        this.mesh = null;
        this.currentOpacity = 0;
        this.targetOpacity = this.data.opacity;
        this.isRemoving = false;
        this.el.classList.add('networked-illustration');

        // Ensure networked illustrations are in the constellation-lines entity to maintain tilt alignment
        // We do this cautiously to not disrupt NAF's internal tracking
        const container = document.getElementById('constellation-lines');
        if (container && this.el.parentNode !== container) {
            // Use a slight delay if it's a remote entity to ensure NAF is done with initial placement
            if (!NAF.utils.isMine(this.el)) {
                setTimeout(() => {
                    if (container && this.el.parentNode !== container) {
                        container.appendChild(this.el);
                    }
                }, 50);
            } else {
                container.appendChild(this.el);
            }
        }

        const checkRenderer = () => {
            if (this.data.constellationId) {
                this.el.setAttribute('data-constellation-id', this.data.constellationId);
            }
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl && rendererEl.components['constellation-renderer']) {
                const comp = rendererEl.components['constellation-renderer'];
                if (comp.loadingComplete) {
                    this.renderer = comp;
                    this.rendererReady = true;
                    console.log(`constellation-illustration: Renderer ready for ${this.data.constellationId}`);
                    this.setupIllustration();
                    return; // Stop checking
                }
            }
            if (!this.checkCount) this.checkCount = 0;
            this.checkCount++;
            if (this.checkCount % 10 === 0) console.log(`constellation-illustration: Waiting for renderer for ${this.data.constellationId}...`);
            setTimeout(checkRenderer, 200);
        };
        checkRenderer();
    },

    update: function (oldData) {
        if (this.data.constellationId) {
            this.el.setAttribute('data-constellation-id', this.data.constellationId);
            if (this.data.constellationId !== oldData.constellationId) {
                console.log(`constellation-illustration: ID synced to ${this.data.constellationId}`);
            }
        }

        // Trigger setup if we have an ID and it's new
        if (this.data.constellationId) {
            const idChanged = this.data.constellationId !== oldData.constellationId;

            if (idChanged) {
                this.setupIllustration();
            }
            if (!this.mesh && this.data.constellationId && this.rendererReady) {
                this.setupIllustration();
            }
            if (this.data.opacity !== oldData.opacity) {
                this.targetOpacity = this.data.opacity;
            }
        }
    },

    tick: function (t, dt) {
        if (!dt || !this.mesh) return;
        const lerpFactor = 1 - Math.pow(0.001, dt / 1000); // Fast fade

        this.currentOpacity += (this.targetOpacity - this.currentOpacity) * lerpFactor;

        if (this.mesh.material && this.mesh.material.uniforms && this.mesh.material.uniforms.opacity) {
            this.mesh.material.uniforms.opacity.value = this.currentOpacity;
        }

        if (this.isRemoving && this.currentOpacity < 0.01) {
            if (this.el.parentNode) {
                this.el.parentNode.removeChild(this.el);
            }
        }
    },

    fadeOutAndRemove: function () {
        this.targetOpacity = 0;
        this.isRemoving = true;
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

            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 3; // Bottom Layer (below stars and avatar)
            this.el.object3D.add(mesh);
            this.mesh = mesh; // Track it

            // Set position of the CONTAINER entity (which has no position sync)
            const pos = bounds.center.clone().normalize().multiplyScalar(illustRadius);
            this.el.object3D.position.copy(pos);

            // Orientation & Position
            this.renderer.orientToAnchors(mesh, constellation);
            console.log(`constellation-illustration: Setup complete for ${this.data.constellationId}`);
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
