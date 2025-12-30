AFRAME.registerComponent('high-res', {
    init: function () {
        // Ensure the scene is loaded to access the renderer
        this.el.sceneEl.addEventListener('loaded', () => {
            const renderer = this.el.sceneEl.renderer;
            if (renderer.xr) {
                renderer.xr.setFramebufferScaleFactor(1.5); // Increase the scale factor for higher resolution
            }
        });
    }
});