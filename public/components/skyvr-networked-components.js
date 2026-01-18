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

        // Ensure material color matches current data (fixes potential sync race)
        if (this.lineMaterial) {
            this.lineMaterial.color.set(this.data.color);
        }

        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.mesh.renderOrder = renderSystem ? renderSystem.order['ui'] : 100; // Above stars and illustrations

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

        // Authoritative Watchdog: Ensure high render priority and stability settings stay enforced
        // Add a small jitter based on ID to solve overlap fighting
        const idHash = (this.data.constellationId.charCodeAt(0) + this.data.constellationId.charCodeAt(1) || 0) * 0.0001;
        const finalOrder = 8.0 + idHash;

        if (this.mesh.renderOrder !== finalOrder) {
            this.mesh.renderOrder = finalOrder;
        }
        if (this.mesh.material) {
            if (this.mesh.material.side !== THREE.FrontSide) this.mesh.material.side = THREE.FrontSide;
            if (this.mesh.material.depthWrite !== false) this.mesh.material.depthWrite = false;
        }

        // Skip calculations if opacity is stable and not removing/highlighted
        const alphaDiff = Math.abs(this.targetOpacity - this.currentOpacity);
        if (alphaDiff < 0.001 && !this.isRemoving && !this.isHighlighted) return;

        // Faster bloom for entities (~200ms)
        const lerpFactor = 1 - Math.pow(0.01, dt / 1000);

        this.currentOpacity += (this.targetOpacity - this.currentOpacity) * lerpFactor;

        if (this.mesh.material && this.mesh.material.uniforms) {
            if (this.mesh.material.uniforms.opacity) {
                // VR Boost: Increase opacity on headset for visibility (balanced with Additive blending)
                const isVR = AFRAME.utils.device.isMobile() || AFRAME.utils.device.checkHeadsetConnected();
                const boost = isVR ? 1.4 : 1.0;
                this.mesh.material.uniforms.opacity.value = this.currentOpacity * boost;
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

        const illustRadius = 390; // Pulled significantly closer (400->390) to stop Z-fighting
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
                depthTest: true,
                depthWrite: false,
                side: THREE.FrontSide,
                transparent: true,
                blending: THREE.AdditiveBlending,
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
                side: THREE.FrontSide,
                transparent: true,
                alphaTest: 0.001,
                depthTest: true,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'illustration-plane';

            // Apply authoritative RenderOrder (Order 8 = Above lines, behind UI)
            // Hard-enforced to Layer 8 to ensure it draws LATER than the grid (Layer 2)
            const finalOrder = 8.0;
            mesh.renderOrder = finalOrder;
            mesh.frustumCulled = false;

            // Watchdog: Force Layer 8 and other properties
            mesh.onBeforeRender = function (renderer, scene) {
                // Safe ID resolution: use mesh id
                const id = this.userData.id || "";
                const idHash = ((id.charCodeAt(0) || 0) + (id.charCodeAt(1) || 0)) * 0.0001;
                this.renderOrder = 8.0 + idHash;

                this.material.side = THREE.FrontSide;
                this.material.depthWrite = false;

                this._sceneFog = scene.fog;
                scene.fog = null;
            };
            mesh.onAfterRender = function (renderer, scene) {
                scene.fog = this._sceneFog;
            };

            mesh.userData.id = this.data.constellationId;
            this.el.object3D.add(mesh);
            this.mesh = mesh;

            // Hard-enforce FrontSide to stop striped Z-fighting
            material.side = THREE.FrontSide;
            material.depthWrite = false;
            material.depthTest = true;
            material.transparent = true;
            material.needsUpdate = true;

            // Orientation & Position
            this.renderer.orientToAnchors(mesh, constellation);
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
                    node: node, // Store the node to enforce renderOrder
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
                const isVR = AFRAME.utils.device.isMobile() || AFRAME.utils.device.checkHeadsetConnected();
                this.vrBoost = isVR ? 1.1 : 1.0;
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
                // Force FrontSide and Fog-Bypass (Hardcoded in Tick for stability)
                nodeMaterial.side = THREE.FrontSide;
                nodeMaterial.fog = false;
                nodeMaterial.depthWrite = false;

                // Layer system (Bloom, Inner Glow, Core)
                // Use Authoritative Layer 8.1 system with ID-based jitter
                const idHash = (this.data.constellationId.charCodeAt(0) + this.data.constellationId.charCodeAt(1) || 0) * 0.0001;
                const baseOrder = 8.1 + idHash;
                let layerOffset = 0;
                if (nodeRenderOrder % 10 === 0) layerOffset = 0; // bloom
                if (nodeRenderOrder % 10 === 1) layerOffset = 0.001; // inner
                if (nodeRenderOrder % 10 === 2) layerOffset = 0.002; // core

                const finalOrder = baseOrder + layerOffset;
                if (entry.node) entry.node.renderOrder = finalOrder;

                const opacity = Math.min(finalAlpha * (nodeRenderOrder % 10 === 0 ? 0.02 : (nodeRenderOrder % 10 === 1 ? 0.04 : 0.1)) * (this.vrBoost || 1.0), 1.0);
                if (nodeMaterial.uniforms && nodeMaterial.uniforms.opacity) {
                    nodeMaterial.uniforms.opacity.value = opacity;
                } else {
                    nodeMaterial.opacity = opacity;
                }

                // Dynamic Color Enforcement
                let targetColor = (nodeRenderOrder % 10 === 2)
                    ? (isZod ? '#fff4cc' : '#ffffff')
                    : (isZod ? zodiacColor : standardColor);

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
                const rs = this.renderer ? this.renderer.el.sceneEl.systems['render-order'] : null;
                const baseOrder = rs ? rs.order['lines'] : 7;
                const target = (node.renderOrder === baseOrder + 2) ? coreColor : color;

                if (node.material.uniforms && node.material.uniforms.color) {
                    node.material.uniforms.color.value.set(target);
                } else if (node.material.color) {
                    node.material.color.set(target);
                }
            }
        });
    }
});

AFRAME.registerComponent('identified-info', {
    schema: {
        name: { type: 'string', default: '' },
        info: { type: 'string', default: '' },
        type: { type: 'string', default: 'star' }, // 'star' or 'planet'
        targetTextOpacity: { type: 'number', default: 0.6 },
        targetMarkerOpacity: { type: 'number', default: 1.0 },
        isRemoving: { type: 'boolean', default: false }
    },

    init: function () {
        // Create the text entity
        this.textEl = document.createElement('a-entity');
        this.textEl.setAttribute('position', '0 16 0');
        this.el.appendChild(this.textEl);

        // Marker crosshair (same as preview)
        this.markerEl = document.createElement('a-plane');
        this.markerEl.setAttribute('width', 15.0);
        this.markerEl.setAttribute('height', 15.0);
        this.markerEl.setAttribute('material', {
            src: '#asset-crosshair',
            transparent: true,
            shader: 'flat',
            fog: false,
            depthWrite: false,
            color: '#00FF00'
        });
        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.markerEl.setAttribute('render-order', renderSystem ? 'ui' : '5');
        this.el.appendChild(this.markerEl);

        this.textOpacity = 0;
        this.markerOpacity = 0;
        this.targetTextOpacity = 0.6;
        this.targetMarkerOpacity = 1.0;
        this.isRemoving = false;
        this.domRemoved = false;

        // Restore starfield reference for planet tracking
        const starsEl = document.getElementById('stars-point-cloud');
        if (starsEl && starsEl.components && starsEl.components.starfield) {
            this.starfield = starsEl.components.starfield;
        }
    },

    remove: function () {
    },

    update: function (oldData) {
        if (oldData && this.data.targetTextOpacity !== oldData.targetTextOpacity) {
            this.targetTextOpacity = this.data.targetTextOpacity;
        } else if (!oldData) {
            this.targetTextOpacity = this.data.targetTextOpacity;
        }

        if (oldData && this.data.targetMarkerOpacity !== oldData.targetMarkerOpacity) {
            this.targetMarkerOpacity = this.data.targetMarkerOpacity;
        } else if (!oldData) {
            this.targetMarkerOpacity = this.data.targetMarkerOpacity;
        }

        if (oldData && this.data.isRemoving !== oldData.isRemoving) {
            this.isRemoving = this.data.isRemoving;
        } else if (!oldData) {
            this.isRemoving = this.data.isRemoving;
        }

        this.textEl.setAttribute('custom-fogless-text', {
            value: this.data.info ? `${this.data.name}\\n${this.data.info}` : this.data.name,
            fontSize: 80,
            textColor: '#FFFFFF',
            worldScale: 0.1,
            fixedWidth: 800,
            depthTest: true,
            depthWrite: false,
            renderOrder: this.el.sceneEl.systems['render-order'] ? this.el.sceneEl.systems['render-order'].order['ui'] : 5,
            opacity: this.textOpacity
        });
        if (this.markerEl) {
            this.markerEl.setAttribute('material', {
                opacity: this.markerOpacity,
                depthTest: true,
                depthWrite: false,
                transparent: true
            });
        }
    },


    tick: function (time, dt) {
        // Planet Tracking
        if (this.data.type === 'planet') {
            // Lazy load starfield if missing
            if (!this.starfield) {
                const starsEl = document.getElementById('stars-point-cloud');
                if (starsEl && starsEl.components && starsEl.components.starfield) {
                    this.starfield = starsEl.components.starfield;
                }
            }

            if (this.starfield && this.starfield.planetsData) {
                const planet = this.starfield.planetsData.find(p => p.name === this.data.name);
                if (planet && planet.currentPosition) {
                    // Ensure we track the planet but keep our Z-fighting safe radius (398)
                    this.el.object3D.position.copy(planet.currentPosition).normalize().multiplyScalar(398);
                }
            }
        }

        // Fading Logic
        let textDiff = Math.abs(this.textOpacity - this.targetTextOpacity);
        let markerDiff = Math.abs(this.markerOpacity - this.targetMarkerOpacity);

        if (textDiff > 0.01 || markerDiff > 0.01) {
            const delta = dt / 1000; // Slow fade for nice visual

            // Text fade
            if (this.textOpacity < this.targetTextOpacity) {
                this.textOpacity = Math.min(this.targetTextOpacity, this.textOpacity + delta);
            } else {
                this.textOpacity = Math.max(this.targetTextOpacity, this.textOpacity - delta);
            }

            // Marker fade
            if (this.markerOpacity < this.targetMarkerOpacity) {
                this.markerOpacity = Math.min(this.targetMarkerOpacity, this.markerOpacity + delta);
            } else {
                this.markerOpacity = Math.max(this.targetMarkerOpacity, this.markerOpacity - delta);
            }

            this.textEl.setAttribute('custom-fogless-text', 'opacity', this.textOpacity);
            if (this.markerEl) {
                this.markerEl.setAttribute('material', 'opacity', this.markerOpacity);
            }

            // Reliable Removal Lifecycle
            if (this.isRemoving) {
                // If fully faded, remove from DOM locally
                if (this.textOpacity <= 0.05 && this.markerOpacity <= 0.05) {
                    if (this.el.parentNode) {
                        this.domRemoved = true;
                        this.el.parentNode.removeChild(this.el);
                    }
                }
            }
        }

        // Always face camera
        const cam = this.el.sceneEl.camera;
        if (!cam) return;

        const camWorldPos = new THREE.Vector3();
        cam.getWorldPosition(camWorldPos);

        if (this.el.object3D.parent) {
            const localTarget = this.el.object3D.parent.worldToLocal(camWorldPos.clone());
            this.el.object3D.lookAt(localTarget);
        } else {
            this.el.object3D.lookAt(camWorldPos);
        }
    }
});

AFRAME.registerComponent('stamped-shape', {
    schema: {
        shape: { type: 'string', default: 'circle' },
        color: { type: 'color', default: '#FFFF00' },
        opacity: { type: 'number', default: 1.0 },
        isRemoving: { type: 'boolean', default: false }
    },

    init: function () {
        this.mesh = null;
        this.targetOpacity = this.data.opacity;
        this.currentOpacity = 0;
        this.fadeInSpeed = 3.0;
        this.fadeOutSpeed = 2.0;
        this.domRemoved = false;

        this.buildShape();
    },

    buildShape: function () {
        if (this.mesh) {
            this.el.object3D.remove(this.mesh);
        }

        let geometry;
        const radius = 5; // Reduced from 8

        if (this.data.shape === 'star') {
            const shape = new THREE.Shape();
            const vertices = [];
            const points = 5;
            const outerRadius = radius;
            const innerRadius = radius * 0.4;
            for (let i = 0; i < points * 2; i++) {
                const r = (i % 2 === 0) ? outerRadius : innerRadius;
                const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
                vertices.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
            }

            const roundedness = 0.4;
            // Start at vertex 1 (Inner, sharp)
            shape.moveTo(vertices[1].x, vertices[1].y);

            for (let i = 2; i <= vertices.length + 1; i++) {
                const currIdx = i % vertices.length;
                const curr = vertices[currIdx];

                if (currIdx % 2 !== 0) {
                    // Inner vertex: Sharp
                    shape.lineTo(curr.x, curr.y);
                } else {
                    // Outer vertex: Rounded
                    const prevIdx = (i - 1) % vertices.length;
                    const nextIdx = (i + 1) % vertices.length;
                    const prev = vertices[prevIdx];
                    const next = vertices[nextIdx];

                    const pA = new THREE.Vector2().lerpVectors(prev, curr, 1 - roundedness);
                    shape.lineTo(pA.x, pA.y);

                    const pB = new THREE.Vector2().lerpVectors(curr, next, roundedness);
                    shape.quadraticCurveTo(curr.x, curr.y, pB.x, pB.y);
                }
            }

            geometry = new THREE.ShapeGeometry(shape);
        } else {
            // Thin Ring (circle outline)
            geometry = new THREE.RingGeometry(radius * 0.85, radius, 32);
        }

        const material = new THREE.MeshBasicMaterial({
            color: this.data.color,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: false,
            fog: false,
            blending: THREE.AdditiveBlending
        });

        this.mesh = new THREE.Mesh(geometry, material);
        const renderSystem = this.el.sceneEl.systems['render-order'];
        this.mesh.renderOrder = renderSystem ? renderSystem.order['ui'] : 5.1;
        this.el.object3D.add(this.mesh);
    },

    update: function (oldData) {
        if (this.data.shape !== oldData.shape || this.data.color !== oldData.color) {
            this.buildShape();
        }

        if (this.data.isRemoving && !oldData.isRemoving) {
            this.targetOpacity = 0;
        }
    },

    tick: function (time, dt) {
        if (!dt || !this.mesh) return;

        const dtSec = dt / 1000;

        if (this.data.isRemoving) {
            this.targetOpacity = 0;
            this.currentOpacity -= this.fadeOutSpeed * dtSec;
        } else {
            this.currentOpacity += this.fadeInSpeed * dtSec;
        }

        this.currentOpacity = Math.max(0, Math.min(this.data.opacity, this.currentOpacity));
        this.mesh.material.opacity = this.currentOpacity;

        if (this.data.isRemoving && this.currentOpacity <= 0.05) {
            if (this.el.parentNode && !this.domRemoved) {
                this.domRemoved = true;
                this.el.parentNode.removeChild(this.el);
            }
        }

        // Always face camera
        const cam = this.el.sceneEl.camera;
        if (!cam) return;

        const camWorldPos = new THREE.Vector3();
        cam.getWorldPosition(camWorldPos);

        if (this.el.object3D.parent) {
            const localTarget = this.el.object3D.parent.worldToLocal(camWorldPos.clone());
            this.el.object3D.lookAt(localTarget);
        } else {
            this.el.object3D.lookAt(camWorldPos);
        }
    }
});
