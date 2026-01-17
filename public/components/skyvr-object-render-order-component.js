/* global AFRAME */

AFRAME.registerComponent('object-render-order', {
    schema: { type: 'number', default: 0 },
    init: function () {
        const applyOrder = () => {
            const mesh = this.el.getObject3D('mesh');
            if (mesh) {
                mesh.renderOrder = this.data;
                this.el.object3D.renderOrder = this.data;
            }
        };
        this.el.addEventListener('model-loaded', applyOrder);
        this.el.addEventListener('object3dset', applyOrder);
        applyOrder();
    }
});
