AFRAME.registerComponent('drawing', {
    schema: {
        color: { default: 'yellow' },
        width: { default: 2.5 },
        distance: { type: 'number', default: 400 }, // Drawing surface distance (meters)
        pointerMode: { default: '3d', oneOf: ['3d', '2d'] }
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
        this.completedSegmentEntities = [];
        this.activeStrokeEntity = null;
        this.lastSyncPointCount = 0;
        this.isDrawing = false;
        this.strokeDistance = this.data.distance;
        this.precessionContainerEl = document.getElementById("precession-container");

        // 2D Mode State
        this.mouse = new THREE.Vector2();
        this.lastEraserPos = new THREE.Vector2();
        this.raycaster = new THREE.Raycaster();
        this.isPenHovering = false;
        this.isErasing = false;

        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onPointerLeave = this.onPointerLeave.bind(this);
        this.onContextMenu = this.onContextMenu.bind(this);
        // Bind erase loop if needed, though we use tick/move

        // Listeners are managed in update() to avoid duplicates
        this.injectEraserCSS();
    },

    injectEraserCSS: function () {
        if (document.getElementById('skyvr-eraser-css')) return;
        const style = document.createElement('style');
        style.id = 'skyvr-eraser-css';
        const eraserSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="7" y1="12" x2="17" y2="12"/></svg>';
        const eraserUrl = 'url("data:image/svg+xml;base64,' + btoa(eraserSvg) + '") 16 16, crosshair';
        style.textContent = `
            canvas.is-erasing {
                cursor: ${eraserUrl} !important;
            }
        `;
        document.head.appendChild(style);
    },

    onPointerMove: function (e) {
        if (e.pointerType === 'touch') {
            this.isTouch = true;
        } else {
            this.isTouch = false;
        }

        // Track pen hover status
        this.isPenHovering = (e.pointerType === 'pen');

        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

        // If drawing with pen, prevent movement to block scroll/zoom/rotation
        if ((this.isDrawing || window.isErasing) && e.pointerType === 'pen' && e.cancelable) {
            e.preventDefault();
        }

        if (window.isErasing) {
            e.preventDefault(); // Stop text selection/drag cursors
            if (this.el.sceneEl.canvas) {
                const eraserUrl = 'url("data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="7" y1="12" x2="17" y2="12"/></svg>') + '") 16 16, crosshair';
                this.el.sceneEl.canvas.style.cursor = eraserUrl;
            }

            // Interpolate to catch fast sweeps
            if (this.lastEraserPos.x !== null) {
                const dist = this.mouse.distanceTo(this.lastEraserPos);
                // Smaller step for smoother erasing
                const steps = Math.ceil(dist / 0.005);
                if (steps > 0) {
                    const stepVec = this.mouse.clone().sub(this.lastEraserPos).divideScalar(steps);
                    for (let i = 1; i <= steps; i++) {
                        const pos = this.lastEraserPos.clone().add(stepVec.clone().multiplyScalar(i));
                        // Sweeping only erases strokes
                        this.eraseAt(pos, 'strokes');
                    }
                }
            } else {
                this.eraseAt(this.mouse, 'strokes');
            }
            this.lastEraserPos.copy(this.mouse);
        } else {
            this.lastEraserPos.set(null, null); // Reset
        }
    },

    onPointerDown: function (e) {
        // Global Eraser Check (Button 5 or Middle/1)
        // We handle this FIRST to allow erasing in any mode
        if (e.pointerType === 'pen' && (e.button === 5 || e.button === 1)) {
            window.isErasing = true;
            this.eraseAt(this.mouse, 'all'); // Tap erases EVERYTHING
            this.lastEraserPos.copy(this.mouse);

            if (e.cancelable) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // Automatically activate drawing mode for pen tip (button 0 or -1/default)
        // We do this even in Constellation mode if the user uses the TIP.
        // The side button (button 2) should NOT trigger this if possible, 
        // but 'pointerdown' often reports button 0 for pen tip contact.
        // 
        // If it's the side button (button 2), we DON'T auto-activate drawing, 
        // because that button is reserved for interactions (Undo in Draw, Stamp in Constellation).
        if (e.pointerType === 'pen' && window.currentMode !== 'draw' && e.button !== 2) {
            this.isAutoDrawing = true;
            window.isAutoDrawing = true;
            this.savedMode = window.currentMode;
            window.currentMode = 'draw';

            // Prevent other components (like constellation-pointer) from handling this event
            // This stops double-tap logic in constellation from firing on pen tip taps
            e.stopImmediatePropagation();
        }

        if (window.currentMode !== 'draw') return;
        if (e.target.closest('.infobar-2d') || e.target.closest('.control-panel-2d')) return;

        // touch mode should not draw anything.
        if (e.pointerType === 'touch') {
            this.isTouch = true;
            if (this.isDrawing) this.stopDrawing();
            return;
        }

        this.isTouch = false;

        // FPS mode should not draw with mouse.
        if (!!document.pointerLockElement && e.pointerType === 'mouse') return;

        // Right-click (Mouse) OR Pen Side Button (Barrel)
        // We map Pen Button 2 (Barrel) to Undo
        if (e.button === 2 || (e.pointerType === 'pen' && e.button === 5)) {
            this.clearLastSegment();
            if (e.cancelable) {
                e.preventDefault();
                e.stopPropagation();
            }
            return;
        }

        // Draw with mouse (left click) or Pen Tip
        if ((e.pointerType === 'mouse' && e.button === 0) || (e.pointerType === 'pen' && e.button !== 5 && e.button !== 1)) {
            this.startDrawing();

            // Prevent default
            if (e.cancelable) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    },

    eraseAt: function (mousePos, mode = 'all') {
        this.raycaster.setFromCamera(mousePos, this.el.sceneEl.camera);
        const ray = this.raycaster.ray;

        // 1. "Spherecast" vs Drawing Strokes (Works Great!)
        if (mode === 'all' || mode === 'strokes') {
            const radius = 5; // Erase radius in world units
            const toRemove = [];
            const entitiesToRemove = [];

            // 1a. Local Meshes
            this.completedSegmentMeshes.forEach(mesh => {
                if (this.checkMeshHit(mesh, ray, radius)) {
                    toRemove.push(mesh);
                }
            });

            // 1b. Networked Strokes
            const networkedStrokes = document.querySelectorAll('[drawing-stroke]');
            networkedStrokes.forEach(el => {
                const comp = el.components['drawing-stroke'];
                if (!comp || !comp.mesh) return;
                if (this.checkMeshHit(comp.mesh, ray, radius)) {
                    entitiesToRemove.push(el);
                }
            });

            toRemove.forEach(mesh => {
                if (mesh.parent) mesh.parent.remove(mesh);
                const idx = this.completedSegmentMeshes.indexOf(mesh);
                if (idx > -1) this.completedSegmentMeshes.splice(idx, 1);
            });

            entitiesToRemove.forEach(el => {
                if (NAF.utils.isMine(el)) {
                    if (el.parentNode) el.parentNode.removeChild(el);
                } else {
                    NAF.utils.takeOwnership(el);
                    // Try to remove after a short delay to allow ownership sync
                    setTimeout(() => {
                        if (el.parentNode) el.parentNode.removeChild(el);
                    }, 50);
                }
                // Also remove from our local tracking if present
                if (this.completedSegmentEntities) {
                    const idx = this.completedSegmentEntities.indexOf(el);
                    if (idx > -1) this.completedSegmentEntities.splice(idx, 1);
                }
            });
        }

        // 2. Raycast against Constellation Illustrations
        if (mode === 'all' || mode === 'illustrations') {
            const conRenderer = document.getElementById('constellation-lines');
            if (conRenderer) {
                const illustrationMeshes = [];
                // Look for both the plane mesh AND grouped entities
                conRenderer.object3D.traverse(child => {
                    if (child.name === 'illustration-plane' || (child.userData && child.userData.id)) {
                        illustrationMeshes.push(child);
                    }
                });

                // Standard raycast is usually fine for planes
                const conIntersects = this.raycaster.intersectObjects(illustrationMeshes, true);
                if (conIntersects.length > 0) {
                    // Find the root object that represents the illustration
                    const hitObj = conIntersects[0].object;

                    if (conRenderer.components['constellation-renderer'] && conRenderer.components['constellation-renderer'].removeIllustrationByObject) {
                        conRenderer.components['constellation-renderer'].removeIllustrationByObject(hitObj);
                        if (typeof syncSky === 'function') syncSky();
                    }
                }
            }
        }
    },

    onPointerLeave: function (e) {
        if (e.pointerType === 'pen') {
            this.isPenHovering = false;
        }
    },

    onContextMenu: function (e) {
        if (window.currentMode === 'draw') {
            e.preventDefault();
        }
    },

    onPointerUp: function (e) {
        // Stop erasing if we were erasing
        if (window.isErasing) {
            window.isErasing = false;
        }

        if (e.pointerType === 'mouse' && e.button !== 0) return;
        this.stopDrawing();

        // Deactivate if it was auto-activated
        if (this.isAutoDrawing) {
            // If we were erasing, we might want to stay in 'none' or 'constellation'
            window.currentMode = this.savedMode || 'none';
            this.isAutoDrawing = false;
            window.isAutoDrawing = false;
        }
    },

    update: function (oldData) {
        if (this.lineMaterial && this.data.color !== oldData.color) {
            this.lineMaterial.color.set(this.data.color);
        }

        if (this.data.pointerMode !== oldData.pointerMode) {
            const canvas = this.el.sceneEl.canvas;
            if (!canvas) return;

            if (this.data.pointerMode === '2d') {
                canvas.addEventListener('pointermove', this.onPointerMove);
                canvas.addEventListener('pointerdown', this.onPointerDown);
                canvas.addEventListener('pointerup', this.onPointerUp);
                canvas.addEventListener('pointerleave', this.onPointerLeave);
                canvas.addEventListener('contextmenu', this.onContextMenu);
            } else {
                canvas.removeEventListener('pointermove', this.onPointerMove);
                canvas.removeEventListener('pointerdown', this.onPointerDown);
                canvas.removeEventListener('pointerup', this.onPointerUp);
                canvas.removeEventListener('pointerleave', this.onPointerLeave);
                canvas.removeEventListener('contextmenu', this.onContextMenu);
            }
        }
    },
    startDrawing: function () {
        this.isDrawing = true;
        this.currentSegmentPoints = [];
        this.lastSyncPointCount = 0;
        this.activeStrokeEntity = null;

        // Per-stroke jitter to prevent Z-fighting
        this.strokeDistance = this.data.distance + (Math.random() * 0.1);

        // Immediate networked spawn for live sync
        const isRoomed = typeof roomParam !== 'undefined' && roomParam !== 'none';
        const isConnected = typeof NAF !== 'undefined' && NAF.connection && NAF.connection.isConnected();

        if (isRoomed && isConnected) {
            const entity = document.createElement('a-entity');
            entity.setAttribute('networked', {
                template: '#drawing-stroke-template'
            });

            entity.setAttribute('drawing-stroke', {
                points: [],
                color: this.data.color,
                width: this.data.width
            });

            if (this.precessionContainerEl) {
                this.precessionContainerEl.appendChild(entity);
            } else {
                this.el.sceneEl.appendChild(entity);
            }
            this.activeStrokeEntity = entity;
            if (!this.completedSegmentEntities) this.completedSegmentEntities = [];
            this.completedSegmentEntities.push(entity);
        }
    },
    stopDrawing: function () {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.currentSegmentPoints.length > 1) {
            if (this.activeStrokeEntity) {
                // Final point sync
                this.syncStrokeToNetwork(true);

                // Keep the local mesh alive briefly for smooth handoff
                const tempMesh = this.currentSegmentMesh;
                const container = this.precessionContainerEl;
                if (tempMesh && container) {
                    setTimeout(() => {
                        if (container.object3D) {
                            container.object3D.remove(tempMesh);
                            if (tempMesh.geometry) tempMesh.geometry.dispose();
                        }
                    }, 150);
                }
            } else {
                // Solo / Offline mode fallback
                if (this.currentSegmentMesh) {
                    this.completedSegmentMeshes.push(this.currentSegmentMesh);
                }
            }
        } else if (this.activeStrokeEntity) {
            // Clean up empty/single-point strokes
            if (this.activeStrokeEntity.parentNode) {
                this.activeStrokeEntity.parentNode.removeChild(this.activeStrokeEntity);
            }
            const idx = this.completedSegmentEntities.indexOf(this.activeStrokeEntity);
            if (idx > -1) this.completedSegmentEntities.splice(idx, 1);
        }

        this.currentSegmentMesh = null;
        this.activeStrokeEntity = null;
    },

    syncStrokeToNetwork: function (force = false) {
        if (!this.activeStrokeEntity) return;

        // Throttle: Only sync if we've added a significant number of points or force=true
        // This prevents network flooding while maintaining a "live" feel
        const pointCount = this.currentSegmentPoints.length;
        if (!force && pointCount - this.lastSyncPointCount < 5) return;

        const pointStrings = this.currentSegmentPoints.map(p =>
            `${p.x.toFixed(4)} ${p.y.toFixed(4)} ${p.z.toFixed(4)}`
        );

        this.activeStrokeEntity.setAttribute('drawing-stroke', 'points', pointStrings);
        this.lastSyncPointCount = pointCount;
    },
    clearDrawing: function () {
        // Clear local meshes
        this.completedSegmentMeshes.forEach(mesh => {
            if (mesh && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(mesh);
                mesh.geometry.dispose();
            }
        });
        this.completedSegmentMeshes = [];

        // Clear all strokes in the room (we take ownership if needed)
        const allStrokes = document.querySelectorAll('[drawing-stroke]');
        allStrokes.forEach(el => {
            if (NAF.utils.isMine(el)) {
                if (el.parentNode) el.parentNode.removeChild(el);
            } else {
                NAF.utils.takeOwnership(el);
                setTimeout(() => {
                    if (el.parentNode) el.parentNode.removeChild(el);
                }, 50);
            }
        });
        this.completedSegmentEntities = [];

        if (this.currentSegmentMesh && this.precessionContainerEl) {
            this.precessionContainerEl.object3D.remove(this.currentSegmentMesh);
            this.currentSegmentMesh.geometry.dispose();
            this.currentSegmentMesh = null;
        }
        this.currentSegmentPoints = [];
    },
    clearLastSegment: function () {
        // 1. Try local entities first
        if (this.completedSegmentEntities && this.completedSegmentEntities.length > 0) {
            const lastEntity = this.completedSegmentEntities.pop();
            if (lastEntity && lastEntity.parentNode) {
                lastEntity.parentNode.removeChild(lastEntity);
                return;
            }
        }

        // 2. Fallback to local meshes (solo mode)
        if (this.completedSegmentMeshes.length > 0) {
            const lastSegment = this.completedSegmentMeshes.pop();
            if (lastSegment && this.precessionContainerEl) {
                this.precessionContainerEl.object3D.remove(lastSegment);
                lastSegment.geometry.dispose();
            }
        }
    },
    checkMeshHit: function (mesh, ray, radius) {
        if (!mesh || !mesh.geometry) return false;
        const positions = mesh.geometry.attributes.position.array;

        // Check bounding sphere first
        if (mesh.geometry.boundingSphere) {
            const sphere = mesh.geometry.boundingSphere.clone();
            sphere.applyMatrix4(mesh.matrixWorld);
            if (ray.distanceToPoint(sphere.center) > (sphere.radius + radius)) {
                return false; // Too far
            }
        }

        // Check distance to each segment
        const v1 = new THREE.Vector3();
        const v2 = new THREE.Vector3();
        for (let i = 0; i < positions.length - 3; i += 3) {
            v1.set(positions[i], positions[i + 1], positions[i + 2]).applyMatrix4(mesh.matrixWorld);
            v2.set(positions[i + 3], positions[i + 4], positions[i + 5]).applyMatrix4(mesh.matrixWorld);

            if (ray.distanceSqToSegment(v1, v2) < (radius * radius)) {
                return true;
            }
        }
        return false;
    },
    updateCursor: function () {
        const canvas = this.el.sceneEl.canvas;
        if (!canvas) return;

        // Show pen cursor if in draw mode OR if pen is hovering (previewing auto-draw)
        // Show Eraser cursor if erasing
        const isErasing = window.isErasing;
        const showPenCursor = !document.pointerLockElement && (
            (window.currentMode === 'draw') ||
            this.isPenHovering
        );
        let targetCursor = '';

        if (isErasing) {
            // Use CSS class for robust override
            canvas.classList.add('is-erasing');
        } else {
            canvas.classList.remove('is-erasing');

            if (showPenCursor) {
                // Hotspot at 3,21 in a 24x24 viewBox
                targetCursor = 'url("data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="yellow" stroke="black" stroke-width="1"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>') + '") 4 28, crosshair';
            }

            // Only update if changed to avoid flicker/reflow
            if (canvas.style.cursor !== targetCursor) {
                if (!targetCursor) {
                    if (canvas.style.cursor.includes('data:image') || canvas.style.cursor === 'crosshair') {
                        canvas.style.cursor = '';
                    }
                } else {
                    canvas.style.cursor = targetCursor;
                }
            }
        }
    },
    tick: function () {
        if (this.isDrawing && this.precessionContainerEl) {
            let worldStart = new THREE.Vector3();
            let worldDir = new THREE.Vector3();

            if (this.data.pointerMode === '3d') {
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
                worldStart.copy(rayOriginLocal).applyQuaternion(controllerQuat).add(controllerPos);
                worldDir.copy(rayDirectionLocal).applyQuaternion(controllerQuat).normalize();
            } else {
                // 2D Mode
                const camera = this.el.components.camera ? this.el.components.camera.camera : null;
                if (!camera) return;

                // In touch mode or locked pointer mode, always center
                if (this.isTouch || !!document.pointerLockElement) {
                    this.mouse.set(0, 0);
                }

                this.raycaster.setFromCamera(this.mouse, camera);
                worldStart.copy(this.raycaster.ray.origin);
                worldDir.copy(this.raycaster.ray.direction);
            }

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

            // Sync to network if active
            if (this.activeStrokeEntity) {
                this.syncStrokeToNetwork();
            }
        }
        if (this.data.pointerMode === '2d' || window.isErasing) {
            this.updateCursor();
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
        if (this.data.pointerMode === '2d') {
            const canvas = this.el.sceneEl.canvas;
            if (canvas) {
                canvas.removeEventListener('pointermove', this.onPointerMove);
                canvas.removeEventListener('pointerdown', this.onPointerDown);
                canvas.removeEventListener('pointerup', this.onPointerUp);
                canvas.removeEventListener('pointerleave', this.onPointerLeave);
                canvas.removeEventListener('contextmenu', this.onContextMenu);
            }
        }
        this.clearDrawing();
    }
});