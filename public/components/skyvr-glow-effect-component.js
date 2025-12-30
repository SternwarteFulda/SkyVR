AFRAME.registerComponent("glow-effect", {
    init: function () {
        var data = this.data;
        var el = this.el;

        var vertexShader = `
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        var fragmentShader = `
            uniform float glowIntensity;
            varying vec3 vNormal;
            varying vec3 vPosition;

            void main() {
                float intensity = pow(glowIntensity - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
                gl_FragColor = vec4(intensity, intensity, intensity, 1.0);
            }
        `;

        el.getObject3D("mesh").material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                glowIntensity: { value: 1.5 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
    },
});
