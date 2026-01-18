AFRAME.registerComponent('custom-fogless-text', {
  schema: {
    value: { type: 'string', default: '' },
    fontSize: { type: 'number', default: 40 },
    fontFamily: { type: 'string', default: 'fonts/outfit-600.ttf' },
    textColor: { type: 'color', default: '#FFFFFF' },
    worldScale: { type: 'number', default: 0.1 },
    fixedWidth: { type: 'number', default: 0 },
    depthTest: { type: 'boolean', default: true },
    depthWrite: { type: 'boolean', default: false },
    renderOrder: { type: 'number', default: 9 },
    opacity: { type: 'number', default: 1.0 }
  },

  init: function () {
    // Single-Entity vector text using Troika engine.
    this.el.setAttribute('troika-text', {
      align: 'center',
      baseline: 'center',
      side: 'front',
      fog: false,
      depthWrite: false,
      depthTest: true
    });

    this.updateMaterialSettings = this.updateMaterialSettings.bind(this);
    this.el.addEventListener('troika-text-ready', this.updateMaterialSettings);
    this.el.addEventListener('object3dset', this.updateMaterialSettings);
  },

  update: function (oldData) {
    const data = this.data;
    const baseWidth = (data.fixedWidth > 0 ? data.fixedWidth : 600);
    const width = baseWidth * data.worldScale;
    const worldFontSize = (data.fontSize / 40) * (width / 20);

    this.el.setAttribute('troika-text', {
      value: data.value.replace(/\\n/g, '\n'),
      color: data.textColor,
      font: data.fontFamily,
      fontSize: worldFontSize,
      maxWidth: width,
      opacity: data.opacity,
      outlineWidth: 0, // Outlines removed as requested
      depthWrite: false,
      depthTest: true,
      fog: false
    });

    this.updateMaterialSettings();
  },

  updateMaterialSettings: function () {
    const data = this.data;
    const obj3d = this.el.object3D;

    // FORCE PRIORITY 9: Ensures text paints OVER the 400m grids (Order 2)
    const finalOrder = 9;
    obj3d.renderOrder = finalOrder;

    obj3d.traverse(obj => {
      // 1. Fog-Bypass Hooks (Ensures horizon visibility)
      if (obj.isMesh && !obj._fogBypassWrapped) {
        const originalOnBeforeRender = obj.onBeforeRender;
        obj.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
          if (originalOnBeforeRender) originalOnBeforeRender.call(this, renderer, scene, camera, geometry, material, group);
          this._sceneFog = scene.fog;
          scene.fog = null;
        };
        obj.onAfterRender = function (renderer, scene) {
          scene.fog = this._sceneFog;
        };
        obj._fogBypassWrapped = true;
      }

      // 2. Material Stability
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(mat => {
          mat.fog = false;
          mat.side = THREE.FrontSide;
          mat.depthTest = true;
          mat.depthWrite = false; // Prevents all world z-fighting
          mat.transparent = true;
          mat.alphaTest = 0.001;
          mat.needsUpdate = true;
        });
      }
      obj.renderOrder = finalOrder;
    });
  },

  tick: function () {
    // Watchdog: Ensure high render priority stays enforced
    if (this.el.object3D.renderOrder !== 9) {
      this.updateMaterialSettings();
    }
  },

  remove: function () {
    this.el.removeAttribute('troika-text');
  }
});
