AFRAME.registerComponent("bottom-origin-cylinder", {
    schema: {
        height: { type: "number", default: 1 },
        radius: { type: "number", default: 0.5 },
        color: { type: "color", default: "#00F" },
        rotation: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
        opacity: { type: "number", default: 1.0 },
    },
    init: function () {
        // Create a parent entity to handle rotation and translation
        const parentEntity = document.createElement("a-entity");

        // Set the rotation of the parent entity
        parentEntity.setAttribute("rotation", this.data.rotation);

        // Append the parent entity to the current entity
        this.el.appendChild(parentEntity);

        // Create the cylinder geometry
        const geometry = new THREE.CylinderGeometry(
            this.data.radius,
            this.data.radius,
            this.data.height,
            32
        );
        // Create the material
        const material = new THREE.MeshBasicMaterial({
            color: this.data.color,
            transparent: true,
            opacity: this.data.opacity,
        });
        // Create the mesh
        const cylinder = new THREE.Mesh(geometry, material);

        // Move the cylinder downward based on half of its height
        cylinder.position.y -= this.data.height / 2;

        // Append the cylinder to the parent entity
        parentEntity.setObject3D("mesh", cylinder);
    },
});
