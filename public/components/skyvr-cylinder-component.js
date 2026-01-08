AFRAME.registerComponent("bottom-origin-cylinder", {
    schema: {
        height: { type: "number", default: 1 },
        radius: { type: "number", default: 0.5 },
        color: { type: "color", default: "#00F" },
        opacity: { type: "number", default: 1.0 },
    },

    init: function () {
        const geometry = new THREE.CylinderGeometry(
            this.data.radius,
            this.data.radius,
            this.data.height,
            32
        );
        const material = new THREE.MeshBasicMaterial({
            color: this.data.color,
            transparent: true,
            opacity: this.data.opacity,
            depthWrite: false // Usually better for transparent beams
        });

        this.cylinderMesh = new THREE.Mesh(geometry, material);

        // Pivot at the bottom: move mesh down by half height
        // Cylinder default center is at its middle.
        this.cylinderMesh.position.y = -this.data.height / 2;

        this.el.setObject3D("mesh", this.cylinderMesh);
    },

    update: function (oldData) {
        if (this.cylinderMesh && this.cylinderMesh.material) {
            this.cylinderMesh.material.color.set(this.data.color);
            this.cylinderMesh.material.opacity = this.data.opacity;
            this.cylinderMesh.material.needsUpdate = true;
        }
    }
});
