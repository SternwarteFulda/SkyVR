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
        opacity: { type: 'number', default: 0.7 }
    },

    init: function () {
        this.renderer = null;
        this.el.classList.add('networked-illustration');

        // Ensure networked illustrations are in the constellation-lines entity to maintain tilt alignment
        const container = document.getElementById('constellation-lines');
        if (container && this.el.parentNode !== container) {
            container.appendChild(this.el);
        }

        // Wait for constellation renderer to get data
        this.waitForRenderer = setInterval(() => {
            const rendererEl = document.getElementById('constellation-lines');
            if (rendererEl && rendererEl.components['constellation-renderer']) {
                const comp = rendererEl.components['constellation-renderer'];
                if (comp.loadingComplete) {
                    this.renderer = comp;
                    this.setupIllustration();
                    clearInterval(this.waitForRenderer);
                }
            }
        }, 500);
    },

    setupIllustration: function () {
        if (!this.renderer || !this.data.constellationId) return;

        const constellation = this.renderer.constellationData.constellations.find(c => c.id === this.data.constellationId);
        if (!constellation) return;

        const bounds = this.renderer.getConstellationBounds(constellation);
        const imagePath = constellation.image ? `/assets/constellations/${constellation.image.file}` : null;

        const geometry = new THREE.PlaneGeometry(bounds.width * 1.2, bounds.height * 1.2);

        const addMesh = (texture) => {
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: this.data.opacity,
                side: THREE.DoubleSide,
                fog: false,
                depthWrite: false,
                alphaTest: 0.01
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.renderOrder = 10;
            this.el.object3D.add(mesh);

            // Set position and rotation (look at center)
            this.el.object3D.position.copy(bounds.center);
            this.el.object3D.lookAt(0, 0, 0);
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
        if (this.waitForRenderer) clearInterval(this.waitForRenderer);
        // Disposal handled by A-Frame/Three.js usually, but good to be careful
    }
});
