/* global AFRAME */

// Simple component to share the magnified texture between lenses
AFRAME.registerComponent('copy-material', {
    schema: { from: { type: 'selector' } },
    tick: function () {
        if (!this.data.from) return;
        const meshA = this.data.from.getObject3D('mesh');
        const meshB = this.el.getObject3D('mesh');
        // If source has a map (texture) and we don't match, copy the entire material reference
        if (meshA && meshB && meshA.material.map && meshB.material !== meshA.material) {
            meshB.material = meshA.material;
        }
    }
});
