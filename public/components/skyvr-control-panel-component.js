AFRAME.registerComponent("control-panel", {
  schema: {
    id: { type: "string", default: "" },
    width: { type: "number", default: 0.5 },
    height: { type: "number", default: 0.25 },
    radius: { type: "number", default: 0.01 },
    position: { type: "vec3", default: { x: 0, y: 0, z: -0.19 } },

    enabled: { type: "boolean", default: false },

    topLeftRadius: { type: 'number', default: -1 },
    topRightRadius: { type: 'number', default: -1 },
    bottomLeftRadius: { type: 'number', default: -1 },
    bottomRightRadius: { type: 'number', default: -1 },
    color: { type: 'color', default: '#080814' },
    borderColor: { type: 'color', default: '#8a2be2' },
    opacity: { type: 'number', default: 0.95 }
  },

  init: function () {
    this.controlPanel = new THREE.Mesh(
      this.draw(),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(this.data.color),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: this.data.opacity
      })
    );
    this.el.setObject3D('mesh', this.controlPanel);

    // Top accent border
    const borderGeom = new THREE.PlaneGeometry(this.data.width, 0.005);
    this.borderMesh = new THREE.Mesh(
      borderGeom,
      new THREE.MeshBasicMaterial({ color: new THREE.Color(this.data.borderColor) })
    );
    this.borderMesh.position.set(0, this.data.height / 2, 0.001);
    this.el.object3D.add(this.borderMesh);

    this.el.setAttribute("enabled", this.data.enabled);
    this.el.setAttribute("position", this.data.position);
    this.el.setAttribute("rotation", "-90 0 0");

    //this.update();
  },

  update: function () {
    if (this.data.enabled) {
      if (this.controlPanel) {
        this.controlPanel.visible = true;
        this.controlPanel.geometry = this.draw();
        this.controlPanel.material.color = new THREE.Color(this.data.color);
        this.el.object3D.visible = true;
        this.el.setAttribute('data-raycastable', '');

        if (this.borderMesh) {
          this.borderMesh.material.color = new THREE.Color(this.data.borderColor);
        }
        // Set data-raycastable attribute for all switch-clickarea elements
        this.el.querySelectorAll('.switch-clickarea, .control-panel-button').forEach(clickarea => {
          clickarea.setAttribute('data-raycastable', '');
        });
        //console.log('Raycaster objects', this.el.sceneEl.querySelector('[raycaster]').components.raycaster.objects);
        this.updateOpacity();
      }
    } else {
      this.controlPanel.visible = false;
      this.el.object3D.visible = false;
      this.el.removeAttribute('data-raycastable');
      // Remove data-raycastable attribute from all switch-clickarea elements
      this.el.querySelectorAll('.switch-clickarea, .control-panel-button').forEach(clickarea => {
        clickarea.removeAttribute('data-raycastable');
      });
      // console.log('Raycaster objects', this.el.sceneEl.querySelector('[raycaster]').components.raycaster.objects);
    }
  },

  updateOpacity: function () {
    if (this.data.opacity < 0) { this.data.opacity = 0; }
    if (this.data.opacity > 1) { this.data.opacity = 1; }
    this.controlPanel.material.transparent = this.data.opacity < 1;
    this.controlPanel.material.opacity = this.data.opacity;
    if (this.borderMesh) {
      this.borderMesh.material.transparent = this.data.opacity < 1;
      this.borderMesh.material.opacity = this.data.opacity;
    }
  },

  remove: function () {
    if (!this.controlPanel) { return; }
    this.el.object3D.remove(this.controlPanel);
    this.controlPanel = null;
  },

  draw: function () {
    var roundedRectShape = new THREE.Shape();
    function roundedRect(ctx, x, y, width, height, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius) {
      if (!topLeftRadius) { topLeftRadius = 0.00001; }
      if (!topRightRadius) { topRightRadius = 0.00001; }
      if (!bottomLeftRadius) { bottomLeftRadius = 0.00001; }
      if (!bottomRightRadius) { bottomRightRadius = 0.00001; }

      ctx.moveTo(x + topLeftRadius, y);
      ctx.lineTo(x + width - topRightRadius, y);
      ctx.absarc(x + width - topRightRadius, y + topRightRadius, topRightRadius, Math.PI * 1.5, Math.PI * 2);
      ctx.lineTo(x + width, y + height - topRightRadius);
      ctx.absarc(x + width - bottomRightRadius, y + height - bottomRightRadius, bottomRightRadius, 0, Math.PI * 0.5);
      ctx.lineTo(x + bottomLeftRadius, y + height);
      ctx.absarc(x + bottomLeftRadius, y + height - bottomLeftRadius, bottomLeftRadius, Math.PI * 0.5, Math.PI);
      ctx.lineTo(x, y + topLeftRadius);
      ctx.absarc(x + topLeftRadius, y + topLeftRadius, topLeftRadius, Math.PI, Math.PI * 1.5);
    }

    var corners = [this.data.radius, this.data.radius, this.data.radius, this.data.radius];
    if (this.data.topLeftRadius != -1) { corners[0] = this.data.topLeftRadius; }
    if (this.data.topRightRadius != -1) { corners[1] = this.data.topRightRadius; }
    if (this.data.bottomLeftRadius != -1) { corners[2] = this.data.bottomLeftRadius; }
    if (this.data.bottomRightRadius != -1) { corners[3] = this.data.bottomRightRadius; }

    roundedRect(roundedRectShape, -this.data.width / 2, -this.data.height / 2, this.data.width, this.data.height, corners[0], corners[1], corners[2], corners[3]);
    return new THREE.ShapeGeometry(roundedRectShape);
  }
});

AFRAME.registerPrimitive('a-control-panel', {
  defaultComponents: {
    'control-panel': {}
  },
  mappings: {
    enabled: 'control-panel.enabled',
    width: 'control-panel.width',
    height: 'control-panel.height',
    radius: 'control-panel.radius',
    'top-left-radius': 'control-panel.topLeftRadius',
    'top-right-radius': 'control-panel.topRightRadius',
    'bottom-left-radius': 'control-panel.bottomLeftRadius',
    'bottom-right-radius': 'control-panel.bottomRightRadius',
    color: 'control-panel.color',
    'border-color': 'control-panel.borderColor',
    opacity: 'control-panel.opacity'
  }
});