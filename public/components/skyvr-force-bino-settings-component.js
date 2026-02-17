/* global AFRAME */

// Component to force specific camera settings for magnification
// Accesses the internal camera of secondary-camera component
AFRAME.registerComponent('force-bino-settings', {
    tick: function () {
        let cam = null;
        // 1. Try to get the internal camera from the secondary-camera component
        if (this.el.components['secondary-camera']) {
            cam = this.el.components['secondary-camera'].camera;
        }
        // 2. Fallback to entity's camera object
        if (!cam) {
            cam = this.el.getObject3D('camera');
        }

        if (cam && cam.fov !== 2.5) {
            if (cam.isPerspectiveCamera) {
                cam.fov = 2.5; // Force high magnification (approx 35x)
                cam.updateProjectionMatrix();
            }
            if (cam) window.currentBinoFov = cam.fov;
        } else if (cam) {
            window.currentBinoFov = cam.fov;
        }
    }
});
