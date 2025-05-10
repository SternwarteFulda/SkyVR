AFRAME.registerComponent('custom-fogless-text', {
  schema: {
    value: {type: 'string', default: ''},
    textColor: {type: 'color', default: '#FFBB00'},
    fontSize: {type: 'number', default: 128}, // Primary user control for size/quality
    fontFamily: {type: 'string', default: 'Arial'},
    outlineWidth: {type: 'number', default: 8},
    outlineColor: {type: 'color', default: '#000000'},
    outlineAlphaForDepthWrite: {type: 'number', default: 0.002, min: 0.001, max: 1},
    materialAlphaTestThreshold: {type: 'number', default: 0.001, min: 0.001, max: 1},
    padding: {type: 'number', default: 10}, // Pixels of padding around text on canvas
    worldScale: {type: 'number', default: 0.1} // Scales canvas pixel size to world units for the plane
  },

  init: function () {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      fog: false,
      alphaTest: this.data.materialAlphaTestThreshold,
      depthWrite: true
    });

    // Mesh will be created and added in _createTextTextureAndPlane
    this.mesh = null; 
    this._createTextTextureAndPlane();
  },

  update: function (oldData) {
    let needsUpdate = false;
    // Check if any relevant data changed
    for (const key in this.data) {
      if (this.data[key] !== oldData[key]) {
        needsUpdate = true;
        break;
      }
    }

    if (needsUpdate) {
      this._createTextTextureAndPlane();
    }
  },

  _createTextTextureAndPlane: function () {
    const data = this.data;
    const ctx = this.ctx;

    // 1. Setup font and measure text for canvas sizing
    ctx.font = `bold ${data.fontSize}px ${data.fontFamily}`;
    const textMetrics = ctx.measureText(data.value);
    
    // Robust height calculation
    // Start with fontSize * 1.2 as a base (20% buffer over font size).
    // This is generally safe for capital letters and gives some headroom.
    let derivedTextHeight = data.fontSize * 1.2;

    // If available text metrics (actual ascent + descent) indicate an even larger height,
    // use that. This could be relevant for text with significant ascenders/descenders
    // beyond typical capital letter height, though less common for 'N,O,S,W'.
    if (textMetrics.actualBoundingBoxAscent && textMetrics.actualBoundingBoxDescent) {
        const metricHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
        if (metricHeight > derivedTextHeight) {
            derivedTextHeight = metricHeight;
        }
    }

    const canvasWidth = Math.ceil(textMetrics.width + (data.padding * 2) + (data.outlineWidth * 2));
    const canvasHeight = Math.ceil(derivedTextHeight + (data.padding * 2) + (data.outlineWidth * 2));

    if (canvasWidth <=0 || canvasHeight <=0) { // Avoid 0-size canvas
        if (this.mesh) this.el.removeObject3D('mesh'); // Remove if exists
        return; 
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;

    // 2. Redraw text onto canvas (font must be set again after canvas resize)
    ctx.font = `bold ${data.fontSize}px ${data.fontFamily}`; // Set font again
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    ctx.fillStyle = data.textColor;
    ctx.fillText(data.value, centerX, centerY);

    if (data.outlineWidth > 0) {
      const oc = new THREE.Color(data.outlineColor);
      ctx.strokeStyle = `rgba(${Math.round(oc.r * 255)}, ${Math.round(oc.g * 255)}, ${Math.round(oc.b * 255)}, ${data.outlineAlphaForDepthWrite})`;
      ctx.lineWidth = data.outlineWidth;
      ctx.strokeText(data.value, centerX, centerY);
    }

    this.texture.needsUpdate = true;

    // 3. Create or update plane geometry based on new canvas size
    const planeWidth = canvasWidth * data.worldScale;
    const planeHeight = canvasHeight * data.worldScale;

    if (planeWidth <=0 || planeHeight <=0) { // Avoid 0-size plane
        if (this.mesh) this.el.removeObject3D('mesh');
        return;
    }

    if (this.mesh) {
      // Update existing geometry if aspect ratio changed significantly or first time
      if (this.mesh.geometry.parameters.width !== planeWidth || this.mesh.geometry.parameters.height !== planeHeight) {
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      }
    } else {
      const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      this.mesh = new THREE.Mesh(geometry, this.material);
      this.el.setObject3D('mesh', this.mesh);
    }
  },

  remove: function () {
    if (this.mesh) this.el.removeObject3D('mesh');
    if (this.mesh && this.mesh.geometry) this.mesh.geometry.dispose();
    if (this.material) this.material.dispose();
    if (this.texture) this.texture.dispose();
  }
});

AFRAME.registerComponent('object-render-order', {
  schema: {type: 'number', default: 0},
  init: function () {
    this.el.addEventListener('object3dset', () => {
      if (this.el.object3D) {
        this.el.object3D.renderOrder = this.data;
        // Propagate to children if it's a group, as text planes are children
        this.el.object3D.traverse((node) => {
          node.renderOrder = this.data;
        });
      }
    });
    // Initial set if object3D is already available
    if (this.el.object3D) {
      this.el.object3D.renderOrder = this.data;
      this.el.object3D.traverse((node) => {
        node.renderOrder = this.data;
      });
    }
  },
  update: function () {
    if (this.el.object3D) {
      this.el.object3D.renderOrder = this.data;
      this.el.object3D.traverse((node) => {
        node.renderOrder = this.data;
      });
    }
  }
});
