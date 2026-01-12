AFRAME.registerComponent('custom-fogless-text', {
  schema: {
    value: { type: 'string', default: '' },
    fontSize: { type: 'number', default: 40 },
    fontFamily: { type: 'string', default: 'Outfit, sans-serif' },
    textColor: { type: 'color', default: '#FFFFFF' },
    outlineWidth: { type: 'number', default: 4 },
    outlineColor: { type: 'color', default: '#000000' },
    outlineAlphaForDepthWrite: { type: 'number', default: 0.002, min: 0.001, max: 1 },
    materialAlphaTestThreshold: { type: 'number', default: 0.001, min: 0.001, max: 1 },
    padding: { type: 'number', default: 10 }, // Pixels of padding around text on canvas
    worldScale: { type: 'number', default: 0.1 }, // Scales canvas pixel size to world units for the plane
    fixedWidth: { type: 'number', default: 0 }, // If > 0, forces this canvas width (pixels)
    depthTest: { type: 'boolean', default: true },
    renderOrder: { type: 'number', default: 0 },
    opacity: { type: 'number', default: 1.0, min: 0, max: 1 }
  },

  init: function () {
    this.canvas = document.createElement('canvas');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      fog: false,
      alphaTest: this.data.materialAlphaTestThreshold,
      depthWrite: true,
      depthTest: this.data.depthTest
    });
  },

  update: function (oldData) {
    const data = this.data;
    let needsUpdate = false;

    if (oldData.value !== data.value ||
      oldData.fontSize !== data.fontSize ||
      oldData.textColor !== data.textColor ||
      oldData.outlineWidth !== data.outlineWidth ||
      oldData.outlineColor !== data.outlineColor ||
      oldData.fixedWidth !== data.fixedWidth) {
      needsUpdate = true;
    }

    if (oldData.depthTest !== data.depthTest) {
      this.material.depthTest = data.depthTest;
    }

    if (oldData.opacity !== data.opacity) {
      this.material.opacity = data.opacity;
    }

    if (needsUpdate) {
      this._createTextTextureAndPlane();
    }

    if (this.mesh && oldData.renderOrder !== data.renderOrder) {
      this.mesh.renderOrder = data.renderOrder;
    }
  },

  _createTextTextureAndPlane: function () {
    const data = this.data;
    const ctx = this.canvas.getContext('2d');

    // 1. Setup font and measure text for canvas sizing
    ctx.font = `bold ${data.fontSize}px ${data.fontFamily}`;

    // Split text by newlines
    const lines = data.value.split('\\n');

    // Measure widest line and total height
    let maxLineWidth = 0;
    // Base height per line
    const lineHeight = data.fontSize * 1.2;

    lines.forEach(line => {
      const metrics = ctx.measureText(line);
      if (metrics.width > maxLineWidth) {
        maxLineWidth = metrics.width;
      }
    });

    // Check for advanced metrics on the first line as a sample
    ctx.font = `bold ${data.fontSize}px ${data.fontFamily}`;
    const sampleMetrics = ctx.measureText('M');
    let derivedLineHeight = lineHeight;
    if (sampleMetrics.actualBoundingBoxAscent && sampleMetrics.actualBoundingBoxDescent) {
      const metricHeight = sampleMetrics.actualBoundingBoxAscent + sampleMetrics.actualBoundingBoxDescent;
      if (metricHeight > derivedLineHeight) {
        derivedLineHeight = metricHeight;
      }
    }

    const totalTextHeight = derivedLineHeight * lines.length;

    let canvasWidth = data.fixedWidth > 0 ? data.fixedWidth : Math.ceil(maxLineWidth + (data.padding * 2) + (data.outlineWidth * 2));
    const canvasHeight = Math.ceil(totalTextHeight + (data.padding * 2) + (data.outlineWidth * 2));

    if (canvasWidth <= 0 || canvasHeight <= 0) {
      if (this.mesh) this.el.removeObject3D('mesh');
      return;
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    // 2. Draw Text onto Canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = `bold ${data.fontSize}px ${data.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = canvasWidth / 2;
    const startY = (canvasHeight - totalTextHeight) / 2 + (derivedLineHeight / 2);

    ctx.fillStyle = data.textColor;

    lines.forEach((line, index) => {
      const y = startY + (index * derivedLineHeight);
      ctx.fillText(line, centerX, y);

      if (data.outlineWidth > 0) {
        const oc = new THREE.Color(data.outlineColor);
        ctx.strokeStyle = `rgba(${Math.round(oc.r * 255)}, ${Math.round(oc.g * 255)}, ${Math.round(oc.b * 255)}, ${data.outlineAlphaForDepthWrite})`;
        ctx.lineWidth = data.outlineWidth;
        ctx.strokeText(line, centerX, y);
      }
    });

    this.texture.needsUpdate = true;

    // 3. Create/Update Plane Mesh
    const planeWidth = canvasWidth * data.worldScale;
    const planeHeight = canvasHeight * data.worldScale;

    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    } else {
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.mesh.renderOrder = data.renderOrder;
      this.el.setObject3D('mesh', this.mesh);
    }
  },

  remove: function () {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.material.dispose();
      this.texture.dispose();
      this.el.removeObject3D('mesh');
    }
  }
});
