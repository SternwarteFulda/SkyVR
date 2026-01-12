AFRAME.registerComponent('drawing-stroke', {
    schema: {
        points: { type: 'array', default: [] },
        color: { type: 'color', default: 'yellow' },
        width: { type: 'number', default: 2.5 }
    },

    init: function () {
        this.el.classList.add('networked-stroke');

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
        if (this.data.color !== oldData.color) {
            this.lineMaterial.color.set(this.data.color);
        }
        if (JSON.stringify(oldData.points) !== JSON.stringify(this.data.points)) {
            this.updateLine();
        }
    },

    updateLine: function () {
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
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

        const container = document.getElementById('precession-container');
        if (container) {
            container.object3D.add(this.mesh);
        } else {
            this.el.object3D.add(this.mesh);
        }
    },

    remove: function () {
        if (this.mesh) {
            if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
            this.mesh.geometry.dispose();
        }
        if (this.lineMaterial) this.lineMaterial.dispose();
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
        this.isHighlighted = false;
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

        // Skip calculations if opacity is stable and not removing/highlighted
        const alphaDiff = Math.abs(this.targetOpacity - this.currentOpacity);
        if (alphaDiff < 0.001 && !this.isRemoving && !this.isHighlighted) return;

        // Faster bloom for entities (~200ms)
        const lerpFactor = 1 - Math.pow(0.01, dt / 1000);

        this.currentOpacity += (this.targetOpacity - this.currentOpacity) * lerpFactor;

        if (this.mesh.material && this.mesh.material.uniforms) {
            if (this.mesh.material.uniforms.opacity) {
                this.mesh.material.uniforms.opacity.value = this.currentOpacity;
            }
            if (this.mesh.material.uniforms.color) {
                const baseCol = new THREE.Color('#ffffff');
                // Turn redish if up for removal OR being pointed at
                if (this.isRemoving || this.isHighlighted) {
                    baseCol.lerp(new THREE.Color('#ff4444'), 0.8);
                }
                this.mesh.material.uniforms.color.value.copy(baseCol);
            }
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

        const illustRadius = 400;
        const bounds = this.renderer.getConstellationBounds(constellation, illustRadius);
        const imagePath = constellation.image ? `/assets/constellations/${constellation.image.file}` : null;

        const geometry = new THREE.PlaneGeometry(1, 1, 16, 16); // Use unit plane, mapping logic is in matrix

        const addMesh = (texture) => {
            // Guard against async race conditions (if component removed/changed while loading)
            if (!this.el.parentNode) return;

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    map: { value: texture },
                    opacity: { value: 0 },
                    targetRadius: { value: illustRadius },
                    highlightStrength: { value: 0.0 },
                    uProjectionMatrix4: { value: this.el.object3D.userData.projectionMatrix4 || new THREE.Matrix4() },
                    uTextureSize: { value: this.el.object3D.userData.texSize || new THREE.Vector2(512, 512) }
                },
                vertexShader: `
                    uniform float targetRadius;
                    uniform mat4 uProjectionMatrix4;
                    uniform vec2 uTextureSize;
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        
                        // Map UV to pixel coordinates (Bottom-Up)
                        float px = uv.x * uTextureSize.x;
                        float py = uv.y * uTextureSize.y;
                        
                        // Calculate sky direction in local space using the spherical mapping matrix
                        vec4 skyPos = uProjectionMatrix4 * vec4(px, py, 0.0, 1.0);
                        
                        // Normalize and project onto the sphere at the correct radius
                        vec3 localSphericalPos = normalize(skyPos.xyz) * targetRadius;
                        
                        // Apply modelViewMatrix to ensure it rotates with the star sphere
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(localSphericalPos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform sampler2D map;
                    uniform float opacity;
                    uniform float highlightStrength;
                    varying vec2 vUv;
                    void main() {
                        vec4 tex = texture2D(map, vUv);
                        float brightness = max(tex.r, max(tex.g, tex.b));
                        if (brightness < 0.05) discard;
                        
                        vec3 finalColor = mix(tex.rgb, vec3(1.0, 0.0, 0.0), highlightStrength);
                        gl_FragColor = vec4(finalColor, tex.a * opacity);
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide,
                depthTest: true,
                depthWrite: false,
                blending: THREE.NormalBlending
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'illustration-plane'; // Essential for raycaster detection!
            mesh.renderOrder = 5.1; // Over Milky Way (5.0), Under Boundaries (6.0)
            mesh.frustumCulled = false; // Shader expands it across the sky, so we disable auto-culling
            this.el.object3D.add(mesh);
            this.mesh = mesh; // Track it

            // Orientation & Position (Matrix logic already handled in orientToAnchors)
            this.renderer.orientToAnchors(mesh, constellation);

            // Sync uniform if matrix changed in orientToAnchors
            material.uniforms.uProjectionMatrix4.value = mesh.userData.projectionMatrix4;
            material.uniforms.uTextureSize.value = mesh.userData.texSize;

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


    setHighlight: function (enabled) {
        this.isHighlighted = enabled;
        if (!this.mesh || !this.mesh.material || !this.mesh.material.uniforms) return;
        const target = enabled ? 0.3 : 0.0;
        this.mesh.material.uniforms.highlightStrength.value = target;
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
AFRAME.registerComponent('constellation-stick-figure', {
    schema: {
        constellationId: { type: 'string' },
        color: { type: 'color', default: '#00ffff' },
        opacity: { type: 'number', default: 1.0 }
    },

    init: function () {
        this.renderer = null;
        this.rendererReady = false;
        this.mesh = null;
        this.currentOpacity = 0;
        this.targetOpacity = this.data.opacity;
        this.isRemoving = false;
        this.isHighlighted = false;
        this.pulseOffset = Math.random() * 10000; // Unique offset for each constellation
        this.el.classList.add('networked-stick-figure');

        // Container placement (same as illustrations)
        const container = document.getElementById('constellation-lines');
        if (container && this.el.parentNode !== container) {
            container.appendChild(this.el);
        }

        const checkRenderer = () => {
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl && rendererEl.components['constellation-renderer']) {
                const comp = rendererEl.components['constellation-renderer'];
                if (comp.loadingComplete) {
                    this.renderer = comp;
                    this.rendererReady = true;
                    this.setupStickFigure();
                    this.cacheMaterials();
                    return;
                }
            }
            setTimeout(checkRenderer, 200);
        };
        checkRenderer();
    },

    cacheMaterials: function () {
        this.cachedMaterials = [];
        if (!this.mesh) return;
        this.mesh.traverse(node => {
            if (node.material) {
                this.cachedMaterials.push({
                    material: node.material,
                    renderOrder: node.renderOrder
                });
            }
        });
    },

    update: function (oldData) {
        if (this.data.constellationId !== oldData.constellationId && this.rendererReady) {
            this.setupStickFigure();
        }
        this.targetOpacity = this.data.opacity;
    },

    tick: function (t, dt) {
        if (!dt || !this.mesh) return;

        // Throttled material updates (30 FPS is enough for the breathing pulse and fades)
        if (!this.throttledTick) {
            this.throttledTick = AFRAME.utils.throttle((t, dt) => {
                this.updateMaterials(t, dt);
            }, 33);
        }
        this.throttledTick(t, dt);
    },

    updateMaterials: function (t, dt) {
        // Faster bloom for entities (~200ms)
        const lerpFactor = 1 - Math.pow(0.01, dt / 1000);

        // Smooth fade
        this.currentOpacity += (this.targetOpacity - this.currentOpacity) * lerpFactor;

        // Flash decay (transient peak on stamp)
        if (!this.flashValue) this.flashValue = 0;
        if (this.flashValue > 0) {
            this.flashValue -= dt / 1500; // 1.5s decay
            if (this.flashValue < 0) this.flashValue = 0;
        }

        // Breathing effect with random offset
        const pulse = 0.75 + Math.sin((t + this.pulseOffset) / 800) * 0.25;
        const finalAlpha = this.currentOpacity * pulse * (1.0 + this.flashValue);

        const isZod = this.renderer && this.renderer.isZodiac(this.data.constellationId);
        const zodiacColor = '#ffd700';
        const standardColor = '#00ffff';

        for (let entry of this.cachedMaterials) {
            const nodeMaterial = entry.material;
            const nodeRenderOrder = entry.renderOrder;

            if (nodeMaterial.transparent) {
                // Layer system (7: Bloom, 8: Inner Glow, 9: Core)
                let base = 1.0;
                if (nodeRenderOrder === 7) base = 0.08;
                if (nodeRenderOrder === 8) base = 0.15;
                if (nodeRenderOrder === 9) base = 0.3;

                const opacity = Math.min(finalAlpha * base, 1.0);
                if (nodeMaterial.uniforms && nodeMaterial.uniforms.opacity) {
                    nodeMaterial.uniforms.opacity.value = opacity;
                } else {
                    nodeMaterial.opacity = opacity;
                }

                // Dynamic Color Enforcement
                let targetColor = (nodeRenderOrder === 9)
                    ? (isZod ? '#fff4cc' : '#ffffff')
                    : (isZod ? zodiacColor : standardColor);

                // Turn redish if up for removal OR being pointed at
                if (this.isRemoving || this.isHighlighted) {
                    const baseCol = new THREE.Color(targetColor);
                    const redCol = new THREE.Color('#ff4444');
                    targetColor = baseCol.lerp(redCol, 0.8);
                }

                if (nodeMaterial.uniforms && nodeMaterial.uniforms.color) {
                    nodeMaterial.uniforms.color.value.set(targetColor);
                } else if (nodeMaterial.color) {
                    nodeMaterial.color.set(targetColor);
                }
            }
        }

        if (this.isRemoving && this.currentOpacity < 0.01) {
            if (this.el.parentNode) this.el.parentNode.removeChild(this.el);
        }
    },

    flash: function () {
        this.flashValue = 1.5; // Strong initial burst
    },

    fadeOutAndRemove: function () {
        this.targetOpacity = 0;
        this.isRemoving = true;
    },

    setupStickFigure: function () {
        if (!this.rendererReady || !this.data.constellationId) return;

        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
            this.mesh = null;
        }

        const constellation = this.renderer.constellationData.constellations.find(c => c.id === this.data.constellationId);
        if (!constellation) return;

        this.mesh = this.renderer.createStickFigure(constellation, this.data.color, 0); // Create with 0 alpha
        this.el.object3D.add(this.mesh);
        this.cacheMaterials(); // Cache the new ones
    },

    setHighlight: function (enabled) {
        this.isHighlighted = enabled;
        if (!this.mesh) return;

        const isZod = this.renderer && this.renderer.isZodiac(this.data.constellationId);
        const zodiacColor = '#ffd700';
        const standardColor = '#00ffff';

        // Use Zodiac gold or Standard Cyan when resetting highlight
        const baseColor = isZod ? zodiacColor : standardColor;
        const color = enabled ? '#ff0000' : baseColor;
        const coreColor = enabled ? '#ff5555' : (isZod ? '#fff4cc' : '#ffffff');

        this.mesh.traverse(node => {
            if (node.material) {
                const target = (node.renderOrder === 9) ? coreColor : color;

                if (node.material.uniforms && node.material.uniforms.color) {
                    node.material.uniforms.color.value.set(target);
                } else if (node.material.color) {
                    node.material.color.set(target);
                }
            }
        });
    }
});
