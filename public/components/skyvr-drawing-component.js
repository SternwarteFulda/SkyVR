AFRAME.registerComponent('drawing', {
    schema: {
        color: { default: 'yellow' },
        width: { default: 2.5 },
        distance: { type: 'number', default: 400 } // Drawing surface distance (meters)
    },
    init: function () {
        this.lineMaterial = new THREE.LineBasicMaterial({
            color: this.data.color,
            linewidth: this.data.width,
            fog: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.8
        });
        this.currentSegmentPoints = [];
        this.currentSegmentMesh = null;
        this.completedSegmentMeshes = [];
        this.isDrawing = false;
        this.strokeDistance = this.data.distance;
        this.precessionContainerEl = document.getElementById("precession-container");
    },
    startDrawing: function () {
        this.isDrawing = true;
        this.currentSegmentPoints = [];
        // Per-stroke jitter to prevent Z-fighting
        this.strokeDistance = this.data.distance + (Math.random() * 0.1);
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
            const lastSegment = this.completedSegmentMeshes.pop();
            if (lastSegment && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(lastSegment);
                lastSegment.geometry.dispose();
            }
        }
    },
    tick: function () {
        if (this.isDrawing && this.precessionContainerEl) {
            const controllerPos = new THREE.Vector3();
            const controllerQuat = new THREE.Quaternion();
            this.el.object3D.getWorldPosition(controllerPos);
            this.el.object3D.getWorldQuaternion(controllerQuat);

            let rayOriginLocal = new THREE.Vector3(0, 0, 0);
            let rayDirectionLocal = new THREE.Vector3(0, 0, -1);

            const metaTouch = this.el.components['meta-touch-controls'];
            if (metaTouch && metaTouch.displayModel) {
                const hand = metaTouch.data.hand;
                const model = metaTouch.displayModel[hand];
                if (model && model.rayOrigin) {
                    rayOriginLocal.copy(model.rayOrigin.origin);
                    rayDirectionLocal.copy(model.rayOrigin.direction);
                }
            } else {
                const dir = new THREE.Vector3(0, -1, 0);
                const tiltEuler = new THREE.Euler(THREE.MathUtils.degToRad(54), THREE.MathUtils.degToRad(9), 0, 'YXZ');
                dir.applyEuler(tiltEuler);
                rayDirectionLocal.copy(dir);
            }

            // World-space ray
            const worldStart = rayOriginLocal.clone().applyQuaternion(controllerQuat).add(controllerPos);
            const worldDir = rayDirectionLocal.clone().applyQuaternion(controllerQuat).normalize();

            // Intersect with a sphere of radius 'strokeDistance' centered at (0,0,0)
            const skyOrigin = new THREE.Vector3(0, 0, 0);
            const L = worldStart.clone().sub(skyOrigin);
            const b = L.dot(worldDir);
            const c = L.dot(L) - (this.strokeDistance * this.strokeDistance);
            const discriminant = b * b - c;

            let t = 0;
            if (discriminant >= 0) {
                t = -b + Math.sqrt(discriminant);
            } else {
                t = this.strokeDistance;
            }

            const hitPoint = worldStart.clone().add(worldDir.multiplyScalar(t));
            const localPosition = this.precessionContainerEl.object3D.worldToLocal(hitPoint);

            if (this.currentSegmentPoints.length > 0) {
                const lastPoint = this.currentSegmentPoints[this.currentSegmentPoints.length - 1];
                const interpolatedPoints = this.calculateInterpolatedPoints(lastPoint, localPosition, 5);
                interpolatedPoints.forEach(p => this.currentSegmentPoints.push(p));
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
                this.currentSegmentMesh.renderOrder = 100;
                this.precessionContainerEl.object3D.add(this.currentSegmentMesh);
            }
        }
    },
    calculateInterpolatedPoints: function (start, end, num) {
        let pts = [];
        for (let i = 1; i <= num; i++) {
            pts.push(start.clone().lerp(end, i / (num + 1)));
        }
        return pts;
    },
    remove: function () {
        this.clearDrawing();
    }
});