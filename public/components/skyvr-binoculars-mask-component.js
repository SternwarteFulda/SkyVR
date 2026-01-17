/* global AFRAME, THREE */

AFRAME.registerComponent('binoculars-mask', {
    init: function () {
        this.el.addEventListener('materialtextureloaded', () => {
            const mesh = this.el.getObject3D('mesh');
            if (mesh && mesh.material) {
                mesh.material.transparent = true;
                mesh.material.onBeforeCompile = (shader) => {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        'gl_FragColor = mapTexelToLinear( texelColor );',
                        `
            gl_FragColor = mapTexelToLinear( texelColor );
            gl_FragColor.a = 1.0 - (texelColor.r + texelColor.g + texelColor.b) / 3.0;
            `
                    );
                };
                mesh.material.needsUpdate = true;
            }
        });
    },
    tick: function () {
        if (!this.el.getAttribute('visible')) return;
        const cameraEl = this.el.parentNode;
        if (cameraEl && cameraEl.components.camera && cameraEl.components.camera.camera) {
            const fov = cameraEl.components.camera.camera.fov;
            const h = 2 * Math.abs(this.el.object3D.position.z) * Math.tan(THREE.MathUtils.degToRad(fov / 2));
            // Apply scale to fill screen perfectly regardless of FOV
            const s = h * 1.5; // Larger overshoot for safety in VR
            this.el.object3D.scale.set(s, s, 1);
        }
    }
});
