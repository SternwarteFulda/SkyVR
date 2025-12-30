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
        this.currentSegmentPoints = []; 
        this.currentSegmentMesh = null;   
        this.completedSegmentMeshes = []; 
        this.isDrawing = false;           
        this.precessionContainerEl = document.getElementById("precession-container");
        if (!this.precessionContainerEl) {
            console.error('Drawing component: precession-container not found!');
        }
    },
    startDrawing: function () {
        this.isDrawing = true;
        this.currentSegmentPoints = []; 
    },
    stopDrawing: function () {
        this.isDrawing = false;
        if (this.currentSegmentMesh && this.currentSegmentPoints.length > 1) {
            this.completedSegmentMeshes.push(this.currentSegmentMesh);
        }
        this.currentSegmentMesh = null; 
    },
    clearDrawing: function () {
        this.completedSegmentMeshes.forEach(mesh => {
            if (mesh && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(mesh);
                mesh.geometry.dispose();
            }
        });
        this.completedSegmentMeshes = [];

        if (this.currentSegmentMesh && this.precessionContainerEl) {
            this.precessionContainerEl.object3D.remove(this.currentSegmentMesh);
            this.currentSegmentMesh.geometry.dispose();
            this.currentSegmentMesh = null;
        }
        this.currentSegmentPoints = [];
    },
    clearLastSegment: function () {
        if (this.completedSegmentMeshes.length > 0) {
            const lastSegment = this.completedSegmentMeshes.pop(); // Remove last segment from array
            if (lastSegment && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(lastSegment); // Remove from scene
                lastSegment.geometry.dispose(); // Dispose geometry
            }
        }
    },
    tick: function () {
        if (this.isDrawing && this.precessionContainerEl) { 
            const controllerPosition = new THREE.Vector3();
            this.el.object3D.getWorldPosition(controllerPosition);

            const controllerQuaternion = new THREE.Quaternion();
            this.el.object3D.getWorldQuaternion(controllerQuaternion);

            const offset = new THREE.Vector3(this.data.offset.x, this.data.offset.y, this.data.offset.z);
            offset.applyQuaternion(controllerQuaternion);

            const offsetWorldPosition = controllerPosition.add(offset);
            const localPosition = this.precessionContainerEl.object3D.worldToLocal(offsetWorldPosition.clone());

            if (this.currentSegmentPoints.length > 0) {
                const lastPoint = this.currentSegmentPoints[this.currentSegmentPoints.length - 1];
                const interpolatedPoints = this.interpolatePoints(lastPoint, localPosition, 5);
                interpolatedPoints.forEach(point => {
                    this.currentSegmentPoints.push(point);
                });
            } else {
                this.currentSegmentPoints.push(localPosition);
            }

            if (this.currentSegmentMesh) {
                this.precessionContainerEl.object3D.remove(this.currentSegmentMesh);
                this.currentSegmentMesh.geometry.dispose();
            }

            if (this.currentSegmentPoints.length > 1) { 
                const geometry = new THREE.BufferGeometry().setFromPoints(this.currentSegmentPoints);
                this.currentSegmentMesh = new THREE.Line(geometry, this.lineMaterial);
                this.precessionContainerEl.object3D.add(this.currentSegmentMesh);
            }
        }
    },

    interpolatePoints: function (startPoint, endPoint, numberOfPoints) {
        let points = [];
        for (let i = 1; i <= numberOfPoints; i++) {
            const interpolatedPoint = startPoint.clone().lerp(endPoint, i / (numberOfPoints + 1));
            points.push(interpolatedPoint);
        }
        return points;
    },


    remove: function () {
        this.completedSegmentMeshes.forEach(mesh => {
            if (mesh && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(mesh);
                mesh.geometry.dispose();
            }
        });
        this.completedSegmentMeshes = [];

        if (this.currentSegmentMesh && this.precessionContainerEl) {
            this.precessionContainerEl.object3D.remove(this.currentSegmentMesh);
            this.currentSegmentMesh.geometry.dispose();
            this.currentSegmentMesh = null;
        }
        this.currentSegmentPoints = [];
    }
});