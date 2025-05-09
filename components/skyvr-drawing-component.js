AFRAME.registerComponent('drawing', {
    schema: {
        color: { default: 'yellow' },
        width: { default: 0.4 },
        //offset: {type: 'vec3', default: {x: 0, y: 0, z: 0}}
        offset: { type: 'vec3', default: { x: -31.5, y: -146.5, z: -200 } }
    },
    init: function () {
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: this.data.color,
            linewidth: this.data.width,
            fog: false
        });
        this.tempVector = new THREE.Vector3();
        this.tempQuaternion = new THREE.Quaternion();
        this.offsetVector = new THREE.Vector3();
        this.points = [];
        this.lineMesh = null;
    },
    startDrawing: function () {
        this.drawing = true;
    },
    stopDrawing: function () {
        this.drawing = false;
    },
    clearDrawing: function () {
        if (this.lineMesh) {
            const precessionContainer = document.getElementById("precession-container");
            precessionContainer.object3D.remove(this.lineMesh);
            this.lineMesh.geometry.dispose();
            this.lineMesh = null;
        }
        this.points = [];
    },
    tick: function () {
        if (this.drawing) {
            const precessionContainer = document.getElementById("precession-container");
            const controllerPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(controllerPosition);

            const controllerQuaternion = new THREE.Quaternion();
            this.el.object3D.getWorldQuaternion(controllerQuaternion);

            const offset = new THREE.Vector3(this.data.offset.x, this.data.offset.y, this.data.offset.z);
            offset.applyQuaternion(controllerQuaternion);

            const offsetWorldPosition = controllerPosition.add(offset);
            const localPosition = precessionContainer.object3D.worldToLocal(offsetWorldPosition.clone());

            // Add smoothing logic here
            if (this.points.length > 0) {
                // Get the last point in the array
                const lastPoint = this.points[this.points.length - 1];
                // Interpolate between the last point and the current point
                const interpolatedPoints = this.interpolatePoints(lastPoint, localPosition, 5); // Increase to add more intermediate points for smoother lines
                // Add each interpolated point to the points array
                interpolatedPoints.forEach(point => {
                    this.points.push(point);
                });
            } else {
                // If there are no points, just add the current point
                this.points.push(localPosition);
            }

            // Redraw logic remains unchanged
            if (this.lineMesh) {
                precessionContainer.object3D.remove(this.lineMesh);
                this.lineMesh.geometry.dispose();
            }

            const geometry = new THREE.BufferGeometry().setFromPoints(this.points);
            this.lineMesh = new THREE.Line(geometry, this.lineMaterial);
            precessionContainer.object3D.add(this.lineMesh);
        }
    },

    // Utility function for interpolation
    interpolatePoints: function (startPoint, endPoint, numberOfPoints) {
        let points = [];
        for (let i = 1; i <= numberOfPoints; i++) {
            const interpolatedPoint = startPoint.clone().lerp(endPoint, i / (numberOfPoints + 1));
            points.push(interpolatedPoint);
        }
        return points;
    },


    remove: function () {
        if (this.lineMesh) {
            const precessionContainer = document.getElementById("precession-container");
            precessionContainer.object3D.remove(this.lineMesh);
            this.lineMesh.geometry.dispose();
            this.lineMesh = null;
        }
        this.points = [];
    }
});