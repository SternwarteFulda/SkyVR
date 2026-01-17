/* global AFRAME */

// Component to offset the internal THREE.js camera object from the entity origin.
// This allows the entity to act as a pivot (e.g. neck/head center) while the
// viewpoint stays at the eyes.
AFRAME.registerComponent('skyvr-camera-pivot', {
    schema: {
        offset: { type: 'vec3', default: { x: 0, y: 0.05, z: -0.16 } }
    },
    init: function () {
        this.onCameraSet = this.onCameraSet.bind(this);
        this.el.addEventListener('camera-set', this.onCameraSet);

        // If camera already exists
        const camera = this.el.getObject3D('camera');
        if (camera) this.applyOffset(camera);
    },
    onCameraSet: function (evt) {
        this.applyOffset(evt.detail.camera);
    },
    applyOffset: function (camera) {
        console.log("skyvr-camera-pivot: Applying offset to internal camera object:", this.data.offset);
        camera.position.copy(this.data.offset);
    },
    remove: function () {
        this.el.removeEventListener('camera-set', this.onCameraSet);
        const camera = this.el.getObject3D('camera');
        if (camera) camera.position.set(0, 0, 0);
    }
});
