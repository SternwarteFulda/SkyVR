/* global AFRAME */

AFRAME.registerComponent('fader', {
    schema: {
        active: { type: 'boolean', default: false },
        duration: { type: 'number', default: 500 }, // ms
        maxOpacity: { type: 'number', default: 1.0 }
    },
    init: function () {
        this.currentOpacity = this.data.active ? 1.0 : 0.0;
        this.applyOpacity(this.currentOpacity);
        this.el.setAttribute('visible', this.currentOpacity > 0);
    },
    update: function (oldData) {
        if (this.data.active) {
            this.el.setAttribute('visible', true);
        }
    },
    tick: function (t, dt) {
        if (!dt) return;
        const target = this.data.active ? 1.0 : 0.0;
        if (Math.abs(this.currentOpacity - target) < 0.001) {
            if (!this.data.active && this.el.getAttribute('visible')) {
                this.el.setAttribute('visible', false);
            }
            return;
        }

        const lerpFactor = 1 - Math.pow(0.05, dt / 1000);
        this.currentOpacity += (target - this.currentOpacity) * lerpFactor;
        this.applyOpacity(this.currentOpacity);
    },
    applyOpacity: function (opacity) {
        const finalOpacity = opacity * this.data.maxOpacity;

        // Handle standard material
        if (this.el.components.material) {
            this.el.setAttribute('material', 'transparent', true);
            this.el.setAttribute('material', 'opacity', finalOpacity);
        }

        // Handle custom-fogless-text
        if (this.el.components['custom-fogless-text']) {
            this.el.setAttribute('custom-fogless-text', 'opacity', finalOpacity);
        }

        // Recursively apply to children if needed (for cardinal points container)
        this.el.object3D.traverse(node => {
            if (node.material) {
                node.material.transparent = true;
                node.material.opacity = finalOpacity;
            }
        });
    }
});
