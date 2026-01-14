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
        this.lerpedPos = new THREE.Vector3();
        this.isPenHovering = false;
        this.isErasing = false;

        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerDown = this.onPointerDown.bind(this);
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

        if (this.currentSegmentPoints.length > 2) {
            // 0. Remove "release wiggle" (trim the last few points which often contain button-release jitter)
            // More conservative trim for short strokes to preserve small circles (star markers)
            if (this.currentSegmentPoints.length > 35) {
                this.currentSegmentPoints.splice(-7);
            } else if (this.currentSegmentPoints.length > 15) {
                this.currentSegmentPoints.splice(-3);
            } else if (this.currentSegmentPoints.length > 8) {
                this.currentSegmentPoints.splice(-1);
            }

            // 1. Smooth the finished stroke
            this.currentSegmentPoints = this.smoothPoints(this.currentSegmentPoints, 2);

            // 2. Try to recognize shapes (circles or line segments)
            this.currentSegmentPoints = this.recognizeShapes(this.currentSegmentPoints);

            // 3. Simplify to keep network traffic reasonable
            this.currentSegmentPoints = this.simplifyPoints(this.currentSegmentPoints, 0.2);

            // Update local mesh so it looks smooth/snapped before being handed off to the networked entity
            if (this.currentSegmentMesh) {
                this.currentSegmentMesh.geometry.dispose();
                this.currentSegmentMesh.geometry = new THREE.BufferGeometry().setFromPoints(this.currentSegmentPoints);
            }

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

            // Live filtering: Exponential Moving Average to reduce hand tremor in real-time
            if (this.currentSegmentPoints.length === 0) {
                this.lerpedPos.copy(localPosition);
            } else {
                // Smoothing factor 0.3 (lower is smoother but higher latency)
                this.lerpedPos.lerp(localPosition, 0.3);
            }
            const filteredPoint = this.lerpedPos.clone();

            if (this.currentSegmentPoints.length > 0) {
                const lastPoint = this.currentSegmentPoints[this.currentSegmentPoints.length - 1];
                const dist = lastPoint.distanceTo(filteredPoint);

                // Only add points if we've moved significantly
                if (dist > 0.01) {
                    // Only interpolate for fast sweeps
                    if (dist > 0.1) {
                        const numInterpolated = dist > 1.0 ? 3 : 1;
                        const interpolatedPoints = this.calculateInterpolatedPoints(lastPoint, filteredPoint, numInterpolated);
                        interpolatedPoints.forEach(p => this.currentSegmentPoints.push(p));
                    }
                    this.currentSegmentPoints.push(filteredPoint);
                }
            } else {
                this.currentSegmentPoints.push(filteredPoint);
            }

            if (this.currentSegmentMesh) {
                this.precessionContainerEl.object3D.remove(this.currentSegmentMesh);
                this.currentSegmentMesh.geometry.dispose();
            }

            if (this.currentSegmentPoints.length > 1) {
                const geometry = new THREE.BufferGeometry().setFromPoints(this.currentSegmentPoints);
                this.currentSegmentMesh = new THREE.Line(geometry, this.lineMaterial);
                const renderSystem = this.el.sceneEl.systems['render-order'];
                this.currentSegmentMesh.renderOrder = renderSystem ? renderSystem.order['ui'] : 100;
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
    smoothPoints: function (points, iterations = 1) {
        if (points.length < 3) return points;

        let p = points.map(pt => pt.clone());

        for (let iter = 0; iter < iterations; iter++) {
            let nextPoints = [];
            nextPoints.push(p[0].clone()); // Keep start

            // Simple 3-point moving average to de-jitter
            for (let i = 1; i < p.length - 1; i++) {
                const p0 = p[i - 1];
                const p1 = p[i];
                const p2 = p[i + 1];
                p[i].set(
                    (p0.x + p1.x * 2 + p2.x) / 4,
                    (p0.y + p1.y * 2 + p2.y) / 4,
                    (p0.z + p1.z * 2 + p2.z) / 4
                );
            }

            // Chaikin's to round corners
            for (let i = 0; i < p.length - 1; i++) {
                const p1 = p[i];
                const p2 = p[i + 1];

                const q = new THREE.Vector3().copy(p1).multiplyScalar(0.75).add(new THREE.Vector3().copy(p2).multiplyScalar(0.25));
                const r = new THREE.Vector3().copy(p1).multiplyScalar(0.25).add(new THREE.Vector3().copy(p2).multiplyScalar(0.75));

                nextPoints.push(q);
                nextPoints.push(r);
            }
            nextPoints.push(p[p.length - 1].clone()); // Keep end
            p = nextPoints;
        }
        return p;
    },
    simplifyPoints: function (points, minDistance = 0.5) {
        if (points.length < 3) return points;

        let simplified = [points[0].clone()];
        let lastPoint = points[0];

        for (let i = 1; i < points.length - 1; i++) {
            if (points[i].distanceTo(lastPoint) > minDistance) {
                simplified.push(points[i].clone());
                lastPoint = points[i];
            }
        }

        simplified.push(points[points.length - 1].clone());
        return simplified;
    },
    recognizeShapes: function (points) {
        if (points.length < 10) return points;

        // 1. Try to recognize a circle first
        const circlePoints = this.checkCircle(points);
        if (circlePoints) return circlePoints;

        // 2. Fallback to line segments
        return this.recognizeLineSegments(points);
    },
    recognizeLineSegments: function (points) {
        if (points.length < 5) return points;

        // 1. Try checking the WHOLE thing as a single straight line FIRST
        // This allows long wobbly lines that don't have intentional sharp turns to be straightened.
        const wholeSnapped = this.checkWholeLine(points);
        if (wholeSnapped) return wholeSnapped;

        // 2. Fallback to segment recognition if it's not a single straight line
        const corners = this.findCorners(points);
        if (corners.length <= 2) return points; // Already tried checkWholeLine

        // Multiple segments detected
        let newPoints = [];
        for (let j = 0; j < corners.length - 1; j++) {
            const startIdx = corners[j];
            const endIdx = corners[j + 1];
            const segment = points.slice(startIdx, endIdx + 1);

            const snapped = this.checkWholeLine(segment);
            if (snapped) {
                if (newPoints.length > 0) newPoints.pop(); // Remove overlap
                newPoints.push(...snapped);
            } else {
                if (newPoints.length > 0) newPoints.pop();
                newPoints.push(...segment);
            }
        }
        return newPoints;
    },
    checkCircle: function (points) {
        // Reduced point count to allow small star markers
        if (points.length < 7) return null;

        // 1. Calculate Centroid
        const centroid = new THREE.Vector3(0, 0, 0);
        points.forEach(p => centroid.add(p));
        centroid.divideScalar(points.length);

        // Aggressive Centroid-Radius Check
        let avgDist = 0;
        points.forEach(p => avgDist += p.distanceTo(centroid));
        avgDist /= points.length;

        // Allow very small circles for star marking
        if (avgDist < 0.2) return null;

        let maxDev = 0;
        points.forEach(p => {
            const d = p.distanceTo(centroid);
            maxDev = Math.max(maxDev, Math.abs(d - avgDist));
        });

        // Dynamic threshold: smaller circles (star markers) need wiggle room
        // Larger circles balanced at 0.22 to capture slow/messy circles
        const threshold = avgDist < 5.0 ? 0.35 : 0.22;
        if (maxDev > avgDist * threshold) return null;

        // NEW: Sharp Corner Protection for Circles
        // Real circles shouldn't have sharp 'kinks'. 
        // Increased threshold to 0.85 (~32 deg) to reject rounded squares from circle detection
        const potentialCorners = this.findCorners(points);
        if (potentialCorners.length > 2) {
            for (let i = 1; i < potentialCorners.length - 1; i++) {
                const idx = potentialCorners[i];
                if (idx > 4 && idx < points.length - 4) {
                    const v1 = new THREE.Vector3().subVectors(points[idx], points[idx - 4]).normalize();
                    const v2 = new THREE.Vector3().subVectors(points[idx + 4], points[idx]).normalize();
                    if (v1.dot(v2) < 0.85) return null; // Corner-like segment found, not a circle
                }
            }
        }

        // Closed check (start and end within 80% of radius or 25m)
        const startEndDist = points[0].distanceTo(points[points.length - 1]);
        if (startEndDist > Math.max(avgDist * 0.8, 25.0)) return null;

        // Polar coverage: spans at least ~160 degrees equivalent (allow shallow C-shapes to snap)
        let totalAngle = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const v1 = points[i].clone().sub(centroid).normalize();
            const v2 = points[i + 1].clone().sub(centroid).normalize();
            let dot = v1.dot(v2);
            dot = Math.max(-1, Math.min(1, dot));
            totalAngle += Math.acos(dot);
        }
        if (totalAngle < Math.PI * 0.9) return null;

        return this.interpolateCircleOnSphere(centroid, avgDist);
    },
    interpolateCircleOnSphere: function (centroid, radius) {
        const pts = [];
        const skyRadius = this.strokeDistance;

        // Final center on sphere surface
        const centerOnSphere = centroid.clone().normalize().multiplyScalar(skyRadius);

        // Basis vectors for circle plane
        const up = centerOnSphere.clone().normalize();
        const right = new THREE.Vector3(1, 0, 0).cross(up);
        if (right.lengthSq() < 0.001) right.set(0, 0, 1).cross(up);
        right.normalize();
        const forward = up.clone().cross(right).normalize();

        // 64 segments for a very smooth circle
        const segments = 64;
        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const p = centerOnSphere.clone()
                .add(right.clone().multiplyScalar(Math.cos(theta) * radius))
                .add(forward.clone().multiplyScalar(Math.sin(theta) * radius));

            // Re-project exactly to sphere surface
            p.normalize().multiplyScalar(skyRadius);
            pts.push(p);
        }
        return pts;
    },
    findCorners: function (points) {
        const corners = [0];
        if (points.length < 8) return [0, points.length - 1];

        // Apex Detection: Instead of just picking the first point that turns,
        // we find the 'steepest' point (min dot product) in a turn.
        const windowSize = 8;
        const normalizedWindow = Math.min(windowSize, Math.floor(points.length / 8));

        let inTurn = false;
        let minDot = 1;
        let minIdx = -1;

        for (let i = normalizedWindow; i < points.length - normalizedWindow; i++) {
            const v1 = new THREE.Vector3().subVectors(points[i], points[i - normalizedWindow]).normalize();
            const v2 = new THREE.Vector3().subVectors(points[i + normalizedWindow], points[i]).normalize();
            const dot = v1.dot(v2);

            // 0.95 threshold (~18 degrees) is very sensitive to catch even rounded turns
            if (dot < 0.95) {
                if (!inTurn) {
                    inTurn = true;
                    minDot = dot;
                    minIdx = i;
                } else if (dot < minDot) {
                    minDot = dot;
                    minIdx = i;
                }
            } else {
                if (inTurn) {
                    if (minIdx - corners[corners.length - 1] > normalizedWindow) {
                        corners.push(minIdx);
                    }
                    inTurn = false;
                    minDot = 1;
                }
            }
        }
        // Catch turn at the end
        if (inTurn && minIdx - corners[corners.length - 1] > normalizedWindow) {
            corners.push(minIdx);
        }

        corners.push(points.length - 1);
        return corners;
    },
    checkWholeLine: function (points) {
        if (points.length < 5) return null;
        const start = points[0];
        const end = points[points.length - 1];
        const chordLen = start.distanceTo(end);

        // Aggressive length check (1.5m minimum)
        if (chordLen < 1.5) return null;

        const line = new THREE.Line3(start, end);
        const temp = new THREE.Vector3();
        let maxDev = 0;
        for (let i = 1; i < points.length - 1; i++) {
            line.closestPointToPoint(points[i], true, temp);
            maxDev = Math.max(maxDev, points[i].distanceTo(temp));
        }

        // Aggressive Line Threshold: 12% of length or 3.0m 
        // Targeted at straightening very long hand-drawn lines that may have significant wiggles
        // while still attempting to respect deliberate curved intent.
        if (maxDev < Math.max(3.0, chordLen * 0.12)) {
            return this.interpolateOnSphere(start, end);
        }
        return null;
    },
    interpolateOnSphere: function (p1, p2) {
        const dist = p1.distanceTo(p2);
        const steps = Math.ceil(dist / 20); // Point every 20m for curvature
        if (steps < 2) return [p1.clone(), p2.clone()];

        const pts = [];
        const radius = p1.length();
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const p = p1.clone().lerp(p2, t);
            p.normalize().multiplyScalar(radius);
            pts.push(p);
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