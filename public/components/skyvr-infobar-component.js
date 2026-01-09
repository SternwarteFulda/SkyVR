AFRAME.registerComponent('skyvr-infobar', {
    init: function () {
        // Individual icon paths
        this.ICONS = {
            room: '#icon-door',
            micOn: '#icon-mic-on',
            micOff: '#icon-mic-off',
            cameraOn: '#icon-camera-on',
            cameraOff: '#icon-camera-off',
            draw: '#icon-draw',
            stamp: '#icon-stamp',
            stickfigure: '#icon-stickfigure',
            constellation: '#icon-constellation',
            mouseMove: '#icon-mouse-move',
            settings: 'assets/icons/settings.svg'
        };

        // Layout Configuration
        this.CONFIG = {
            totalWidth: 0.75,
            totalHeight: 0.05,
            bgOpacity: 0.85,
            bgColor: '#050510',
            borderColor: '#8a2be2',
            micOnColor: '#ff0000',
            iconSize: 0.035,
            modeSpacing: 0.065
        };

        // Create container
        this.container = document.createElement('a-entity');
        this.el.appendChild(this.container);

        // VR Mode Detection: Hide infobar by default, show only in VR
        this.el.object3D.visible = false;

        // Bind event handlers
        this.onEnterVR = this.onEnterVR.bind(this);
        this.onExitVR = this.onExitVR.bind(this);

        // Listen for VR mode changes
        this.el.sceneEl.addEventListener('enter-vr', this.onEnterVR);
        this.el.sceneEl.addEventListener('exit-vr', this.onExitVR);

        // --- 2D UI Hooks ---
        this.ui2d = {
            container: document.getElementById('infobar-2d'),
            exit: document.getElementById('infobar-2d-exit'),
            roomText: document.getElementById('infobar-2d-room-text'),
            mic: document.getElementById('infobar-2d-mic'),
            micIcon: document.getElementById('infobar-2d-mic-icon'),
            camera: document.getElementById('infobar-2d-camera'),
            cameraIcon: document.getElementById('infobar-2d-camera-icon'),
            modes: {
                draw: document.getElementById('infobar-2d-draw'),
                stickfigure: document.getElementById('infobar-2d-stickfigure'),
                constellation: document.getElementById('infobar-2d-constellation'),
                pointer: document.getElementById('infobar-2d-pointer')
            },
            mouseMove: document.getElementById('infobar-2d-mouse-move'),
            settings: document.getElementById('infobar-2d-settings'),
            drawExtras: document.getElementById('infobar-2d-draw-extras'),
            drawUndo: document.getElementById('infobar-2d-draw-undo'),
            drawClear: document.getElementById('infobar-2d-draw-clear'),
            stickfigureExtras: document.getElementById('infobar-2d-stickfigure-extras'),
            showAllStick: document.getElementById('infobar-2d-show-all-stick'),
            clearAllStick: document.getElementById('infobar-2d-clear-all-stick'),
            constellationExtras: document.getElementById('infobar-2d-constellation-extras'),
            showAll: document.getElementById('infobar-2d-show-all'),
            clearAll: document.getElementById('infobar-2d-clear-all'),
            controlPanel: {
                container: document.getElementById('control-panel-2d'),
                close: document.getElementById('control-panel-2d-close'),
                toggles: {
                    meridian: document.getElementById('toggle-2d-meridian'),
                    equator: document.getElementById('toggle-2d-equator'),
                    ecliptic: document.getElementById('toggle-2d-ecliptic'),
                    cardinal: document.getElementById('toggle-2d-cardinal'),
                    poles: document.getElementById('toggle-2d-poles'),
                    lines: document.getElementById('toggle-2d-lines'),
                    boundaries: document.getElementById('toggle-2d-boundaries'),
                    ns: document.getElementById('toggle-2d-ns'),
                    ew: document.getElementById('toggle-2d-ew')
                },
                displays: {
                    lat: document.getElementById('input-2d-lat'),
                    lon: document.getElementById('input-2d-lon'),
                    year: document.getElementById('input-2d-year'),
                    month: document.getElementById('input-2d-month'),
                    day: document.getElementById('input-2d-day'),
                    hour: document.getElementById('input-2d-hour'),
                    minute: document.getElementById('input-2d-minute'),
                    timezone: document.getElementById('timezone-2d-display')
                }
            }
        };
        this.controlPanel2DVisible = false;

        // Initialize 2D visibility: Only show if NOT on a 3D device and not immersive
        if (this.ui2d.container) {
            const isImmersive = !!(this.el.sceneEl.renderer.xr && this.el.sceneEl.renderer.xr.isPresenting);
            const isVRDevice = AFRAME.utils.device.checkHeadsetConnected();
            const shouldHide = isImmersive || isVRDevice;

            this.ui2d.container.classList.toggle('hidden', shouldHide);
            if (shouldHide) this.ui2d.container.style.display = 'none';

            // Unhide A-Frame VR button for headsets
            if (isVRDevice) {
                document.body.classList.add('vr-device-detected');
            }
        }

        this.setup2DListeners();


        // 1. Background (Rounded Glassmorphism style)
        this.bgEl = document.createElement('a-rounded');
        this.bgEl.setAttribute('width', this.CONFIG.totalWidth);
        this.bgEl.setAttribute('height', this.CONFIG.totalHeight);
        this.bgEl.setAttribute('radius', 0.012);
        this.bgEl.setAttribute('color', this.CONFIG.bgColor);
        this.bgEl.setAttribute('opacity', this.CONFIG.bgOpacity);
        // Positioned to be centered
        this.bgEl.setAttribute('position', '0 0 -0.01');
        this.container.appendChild(this.bgEl);

        // 2. Glowing Accent Border (Top Edge)
        this.borderEl = document.createElement('a-plane');
        this.borderEl.setAttribute('width', this.CONFIG.totalWidth);
        this.borderEl.setAttribute('height', 0.003);
        this.borderEl.setAttribute('color', this.CONFIG.borderColor);
        this.borderEl.setAttribute('position', `0 ${this.CONFIG.totalHeight / 2} 0`);
        this.borderEl.setAttribute('material', 'shader: flat');
        this.container.appendChild(this.borderEl);

        // --- Sections ---

        // Room Section (Left)
        // Icon at -0.35, Text starting at -0.32
        this.roomGroup = document.createElement('a-entity');
        this.roomGroup.setAttribute('position', '-0.33 0 0');
        this.container.appendChild(this.roomGroup);

        this.roomIcon = this.createIcon(this.ICONS.room, this.CONFIG.iconSize);

        const onExitClick = () => {
            // 1. Play exit animation on the icon (3D)
            this.roomIcon.setAttribute('animation__exit', {
                property: 'scale',
                to: '0 0 0',
                dur: 300,
                easing: 'easeInBack'
            });

            // 2. Perform VR Fade (Works in both VR and 2D)
            this.performVRFade();

            // 3. Keep HTML Overlay for 2D fallback (rendering overlap is fine)
            const overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.style.display = 'flex';
                overlay.offsetHeight; // Force reflow
                overlay.classList.remove('fade-out');
                overlay.style.opacity = '1';

                // Show "Returning..." text
                const title = overlay.querySelector('.loading-title');
                if (title) title.textContent = 'Returning to Portal...';

                // Hide other status items
                const list = overlay.querySelector('.status-list');
                if (list) list.style.display = 'none';
            }

            // 4. Wait 1s for the fade to complete before actual redirection
            setTimeout(() => {
                if (typeof window.getLobbyParams === 'function') {
                    window.location.href = 'lobby.html' + window.getLobbyParams();
                } else {
                    window.location.href = 'lobby.html';
                }
            }, 1000);
        };

        this.roomIcon.addEventListener('click', onExitClick);
        if (this.ui2d.exit) this.ui2d.exit.addEventListener('click', onExitClick);


        const isStandalone = new URLSearchParams(window.location.search).get('room') === 'none';
        // Always show the door icon so users can exit
        this.roomGroup.appendChild(this.roomIcon);

        this.roomText = document.createElement('a-text');
        this.roomText.setAttribute('value', isStandalone ? 'Standalone Session' : '----');
        this.roomText.setAttribute('color', 'white');
        this.roomText.setAttribute('width', 0.4);
        this.roomText.setAttribute('align', 'left');
        this.roomText.setAttribute('position', '0.03 0 0');
        this.roomText.setAttribute('font', 'mozillavr');
        this.roomGroup.appendChild(this.roomText);

        // Mic Section (Center)
        const urlParams = new URLSearchParams(window.location.search);
        const micEnabledParam = urlParams.get('mic') !== 'false' && !isStandalone;
        if (micEnabledParam) {
            this.micIcon = this.createIcon(this.ICONS.micOff, this.CONFIG.iconSize);
            this.micIcon.setAttribute('position', '0 0 0.001');

            const onMicClick = () => {
                window.micEnabled = !window.micEnabled;
                if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter) {
                    NAF.connection.adapter.enableMicrophone(window.micEnabled);
                }
            };

            this.micIcon.addEventListener('click', onMicClick);
            if (this.ui2d.mic) this.ui2d.mic.addEventListener('click', onMicClick);

            this.container.appendChild(this.micIcon);
        } else {
            console.log("Infobar: Mic disabled (standalone or url param). Hiding icons.");
            this.micIcon = null;
            // Hide 2D mic button
            if (this.ui2d.mic) {
                this.ui2d.mic.style.display = 'none';
            }
        }

        // Camera Section (Next to Mic)
        const presenceParamRaw = urlParams.get('presence') || '';
        const presenceParam = presenceParamRaw.split(':')[0].trim();
        // Only show camera toggle if joined as 'webcam' AND not standalone
        if (presenceParam === 'webcam' && !isStandalone) {
            this.cameraIcon = this.createIcon(this.ICONS.cameraOn, this.CONFIG.iconSize);
            // Position slightly to the right of mic (mic is at 0)
            this.cameraIcon.setAttribute('position', '0.05 0 0.001');

            // Shift existing mode group further right to make space
            // Previously 0.205 (mic only). Now we have mic + cam.
            // Mic: 0. Cam: 0.05. ModeStart: 0.205 -> 0.25?

            const onCameraClick = () => {
                window.cameraEnabled = !window.cameraEnabled;
                if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter) {
                    NAF.connection.adapter.enableCamera(window.cameraEnabled);
                }
                // Sync with player-info for peers to see mode change
                const cam = document.getElementById('camera');
                if (cam) {
                    cam.setAttribute('player-info', 'videoEnabled', window.cameraEnabled);
                }
                window.dispatchEvent(new CustomEvent('camera-toggled'));
            };

            this.cameraIcon.addEventListener('click', onCameraClick);
            this.container.appendChild(this.cameraIcon);

            // 2D Camera UI
            if (this.ui2d.camera) {
                this.ui2d.camera.style.display = 'flex';
                this.ui2d.camera.addEventListener('click', onCameraClick);
            }

            // Update layout for mode group
            // We can dynamically adjust it below or just use a safe offset.
        } else {
            this.cameraIcon = null;
        }

        // Mode Group (Right)
        this.modeButtons = {};
        this.modesList = ['draw', 'stickfigure', 'constellation']; // 'stamp' disabled

        // Mode container starts after the center
        this.modeGroup = document.createElement('a-entity');
        // Shift right if camera icon is present
        const modeStart = (presenceParam === 'webcam' && !isStandalone) ? 0.25 : 0.205;
        this.modeGroup.setAttribute('position', `${modeStart} 0 0`);
        this.container.appendChild(this.modeGroup);

        const modes = [
            { id: 'draw', icon: this.ICONS.draw },
            // { id: 'stamp', icon: this.ICONS.stamp },
            { id: 'stickfigure', icon: this.ICONS.stickfigure },
            { id: 'constellation', icon: this.ICONS.constellation }
        ];

        modes.forEach((m, index) => {
            const btn = this.createIcon(m.icon, this.CONFIG.iconSize);
            btn.setAttribute('position', `${index * this.CONFIG.modeSpacing} 0 0.001`);
            btn.addEventListener('click', () => {
                window.currentMode = (window.currentMode === m.id) ? 'none' : m.id;
            });
            this.modeGroup.appendChild(btn);
            this.modeButtons[m.id] = btn;
        });

        // Event listener for controller Y button
        this.onYButtonDown = () => {
            const currentIndex = this.modesList.indexOf(window.currentMode || 'draw');
            const nextIndex = (currentIndex + 1) % this.modesList.length;
            window.currentMode = this.modesList[nextIndex];
        };
        window.addEventListener('ybuttondown', this.onYButtonDown);

        // State tracking
        this.lastMic = null;
        this.lastCamera = null;
        this.lastRoom = null;
        this.lastMode = null;
        this.lastConnected = false;
        this.lastReverse = null;

        if (isStandalone) {
            this.roomText.setAttribute('value', 'Standalone Session');
        } else {
            this.roomText.setAttribute('value', 'Connecting...');
        }
        window.currentMode = 'none';
    },

    remove: function () {
        window.removeEventListener('ybuttondown', this.onYButtonDown);
        this.el.sceneEl.removeEventListener('enter-vr', this.onEnterVR);
        this.el.sceneEl.removeEventListener('exit-vr', this.onExitVR);
    },

    onEnterVR: function () {
        // A-Frame triggers enter-vr for both immersive VR and fullscreen magic window.
        // We only want to hide the 2D UI and show the 3D UI if we are actually presenting in a headset.
        console.log('Infobar: onEnterVR event triggered');

        // Check after a slightly longer delay to ensure Fullscreen API / WebXR state is stable
        setTimeout(() => {
            const isPresenting = !!(this.el.sceneEl.renderer.xr && this.el.sceneEl.renderer.xr.isPresenting);
            const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
            const isVRDevice = AFRAME.utils.device.checkHeadsetConnected();

            console.log(`Infobar: State check - isPresenting: ${isPresenting}, isFullscreen: ${isFullscreen}, isVRDevice: ${isVRDevice}`);

            if (isVRDevice) {
                document.body.classList.add('vr-device-detected');
            }

            if (isPresenting) {
                console.log('Infobar: Immersive mode detected. Showing 3D UI, hiding 2D UI.');
                this.el.object3D.visible = true;
                if (this.ui2d.container) {
                    this.ui2d.container.classList.add('hidden');
                    this.ui2d.container.style.display = 'none';
                }
            } else {
                // If it's a VR device (headset connected but not presenting), we still might want to hide 2D HUD 
                // but A-Frame button triggered 'fullscreenElement: body' logic previously.
                // User said: "Remove 2D infobar on 3D devices completely"
                if (isVRDevice) {
                    this.el.object3D.visible = true; // Show 3D HUD by default on headsets
                    if (this.ui2d.container) {
                        this.ui2d.container.classList.add('hidden');
                        this.ui2d.container.style.display = 'none';
                    }
                    return;
                }

                console.log('Infobar: Fullscreen/2D mode detected. Showing 2D UI, hiding 3D UI.');
                this.el.object3D.visible = false;
                if (this.ui2d.container) {
                    this.ui2d.container.classList.remove('hidden');
                    this.ui2d.container.style.display = 'flex';
                    this.ui2d.container.style.visibility = 'visible';
                }
            }
        }, 300);
    },

    onExitVR: function () {
        console.log('Infobar: Exiting VR/Fullscreen - restoring 2D infobar');
        const isVRDevice = AFRAME.utils.device.checkHeadsetConnected();
        this.el.object3D.visible = isVRDevice;

        if (this.ui2d.container && !isVRDevice) {
            this.ui2d.container.classList.remove('hidden');
            this.ui2d.container.style.display = 'flex';
            this.ui2d.container.style.visibility = 'visible';
        } else if (this.ui2d.container) {
            this.ui2d.container.style.display = 'none';
        }
    },

    toggleMouseDirection: function () {
        window.reverseMouse = !window.reverseMouse;
        console.log('Infobar: Toggling mouse direction. Mode:', window.reverseMouse ? 'Sky' : 'Camera');

        const camera = document.getElementById('camera');
        if (camera) {
            // Toggle reverseMouseDrag and pointerLockEnabled accordingly.
            // Camera Move (window.reverseMouse = false) -> use pointer lock to hide cursor.
            // Sky Move (window.reverseMouse = true) -> use standard grab cursor.
            camera.setAttribute('skyvr-look-controls', {
                reverseMouseDrag: !!window.reverseMouse,
                pointerLockEnabled: !window.reverseMouse
            });
        }

        // Update 2D button state
        if (this.ui2d.mouseMove) {
            this.ui2d.mouseMove.classList.toggle('active', !!window.reverseMouse);
        }

        // If switching to Camera Move (FPS), deactivate pointer mode
        if (!window.reverseMouse && window.currentMode === 'pointer') {
            window.currentMode = 'none';
        }
    },

    setup2DListeners: function () {
        // Mode buttons
        Object.keys(this.ui2d.modes).forEach(modeId => {
            const btn = this.ui2d.modes[modeId];
            if (btn) {
                btn.addEventListener('click', () => {
                    const newMode = (window.currentMode === modeId) ? 'none' : modeId;
                    console.log('Mode button clicked:', modeId, 'currentMode:', window.currentMode, '-> newMode:', newMode);
                    window.currentMode = newMode;
                });
            }
        });

        // Mouse Move listener
        if (this.ui2d.mouseMove) {
            this.ui2d.mouseMove.addEventListener('click', () => {
                this.toggleMouseDirection();
            });
        }

        // Settings button listener
        if (this.ui2d.settings) {
            this.ui2d.settings.addEventListener('click', () => {
                this.controlPanel2DVisible = !this.controlPanel2DVisible;
                if (this.ui2d.controlPanel.container) {
                    this.ui2d.controlPanel.container.classList.toggle('hidden', !this.controlPanel2DVisible);
                }
                this.ui2d.settings.classList.toggle('active', this.controlPanel2DVisible);
            });
        }

        // Drawing Extras
        if (this.ui2d.drawUndo) {
            this.ui2d.drawUndo.addEventListener('click', (e) => {
                e.stopPropagation();
                const cam = document.getElementById('camera');
                if (cam && cam.components.drawing) cam.components.drawing.clearLastSegment();
            });
        }

        if (this.ui2d.drawClear) {
            this.ui2d.drawClear.addEventListener('click', (e) => {
                e.stopPropagation();
                const cam = document.getElementById('camera');
                if (cam && cam.components.drawing) cam.components.drawing.clearDrawing();
            });
        }

        // Constellation Extras
        if (this.ui2d.showAll) {
            this.ui2d.showAll.addEventListener('click', (e) => {
                e.stopPropagation();
                const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (renderer) renderer.showAllIllustrations();
                if (typeof syncSky === 'function') syncSky();
            });
        }

        if (this.ui2d.clearAll) {
            this.ui2d.clearAll.addEventListener('click', (e) => {
                e.stopPropagation();
                const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (renderer) renderer.clearAllIllustrations();
                if (typeof syncSky === 'function') syncSky();
            });
        }

        // Stick Figure Extras
        if (this.ui2d.showAllStick) {
            this.ui2d.showAllStick.addEventListener('click', (e) => {
                e.stopPropagation();
                const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (renderer) renderer.showAllIllustrations('stick');
                if (typeof syncSky === 'function') syncSky();
            });
        }

        if (this.ui2d.clearAllStick) {
            this.ui2d.clearAllStick.addEventListener('click', (e) => {
                e.stopPropagation();
                const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
                if (renderer) renderer.clearAllIllustrations();
                if (typeof syncSky === 'function') syncSky();
            });
        }

        // Control Panel Close listener
        if (this.ui2d.controlPanel.close) {
            this.ui2d.controlPanel.close.addEventListener('click', () => {
                this.controlPanel2DVisible = false;
                if (this.ui2d.controlPanel.container) {
                    this.ui2d.controlPanel.container.classList.add('hidden');
                }
                if (this.ui2d.settings) {
                    this.ui2d.settings.classList.remove('active');
                }
            });
        }

        // --- Keyboard Input Listeners ---
        const displays = this.ui2d.controlPanel.displays;
        const toggles = this.ui2d.controlPanel.toggles;

        const handleCoordChange = (type, e, force = false) => {
            const val = Math.abs(parseFloat(e.target.value));
            if (!isNaN(val)) {
                if (type === 'latitude') {
                    const sign = window.latitude >= 0 ? 1 : -1;
                    window.latitude = Math.max(-90, Math.min(90, val * sign));
                } else {
                    const sign = window.longitude >= 0 ? 1 : -1;
                    let lon = val * sign;
                    while (lon > 180) lon -= 360;
                    while (lon < -180) lon += 360;
                    window.longitude = lon;
                }
                if (typeof syncSky === 'function') syncSky(force);
                if (typeof updateScene === 'function') updateScene();
            }
        };

        const handleTimeChange = (unit, e, force = false) => {
            let val = parseInt(e.target.value);
            if (!isNaN(val)) {
                if (!window.simulationTime) return;
                const baseTime = window.targetSimulationTime || window.simulationTime;
                const currentVal = baseTime[unit];
                const diff = val - currentVal;
                if (diff === 0) return;

                let newTime;
                if (unit === 'day') {
                    // Use absolute 24-hour steps to compensate for DST shifts
                    newTime = baseTime.plus({ hours: 24 * diff });
                } else {
                    newTime = baseTime.plus({ [unit]: diff });
                }

                if (typeof updateSimulationTime === 'function') {
                    updateSimulationTime(newTime);
                }

                // Roll-over fix: Immediately sync all inputs 
                // This resets "60" back to "0" and prevents cumulative hour increases
                this.syncTimeUI(true);

                if (typeof syncSky === 'function') syncSky(force);
                if (typeof updateScene === 'function') updateScene();
            }
        };

        // Attach listeners to both 'input' (for arrows/live) and 'change' (for blur/enter)
        const inputs = [
            { el: displays.lat, type: 'lat' },
            { el: displays.lon, type: 'lon' },
            { el: displays.year, type: 'year' },
            { el: displays.month, type: 'month' },
            { el: displays.day, type: 'day' },
            { el: displays.hour, type: 'hour' },
            { el: displays.minute, type: 'minute' }
        ];

        inputs.forEach(item => {
            if (!item.el) return;
            const handler = (item.type === 'lat' || item.type === 'lon') ?
                (e, force) => handleCoordChange(item.type === 'lat' ? 'latitude' : 'longitude', e, force) :
                (e, force) => handleTimeChange(item.type, e, force);

            // 'input' fires continuously during holding/key-repeat - use throttled sync
            item.el.addEventListener('input', (e) => handler(e, false));
            // 'change' fires on Enter or focus lost - use forced sync to ensure the final state is locked in
            item.el.addEventListener('change', (e) => handler(e, true));
        });

        // Hemisphere Toggles
        if (toggles.ns) {
            toggles.ns.addEventListener('click', () => {
                window.latitude = -window.latitude;
                this.syncTimeUI(true);
                if (typeof syncSky === 'function') syncSky(true);
                if (typeof updateScene === 'function') updateScene();
            });
        }
        if (toggles.ew) {
            toggles.ew.addEventListener('click', () => {
                window.longitude = -window.longitude;
                this.syncTimeUI(true);
                if (typeof syncSky === 'function') syncSky(true);
                if (typeof updateScene === 'function') updateScene();
            });
        }

        // --- Button Repeat Handling ---
        const setupRepeat = (btn, action) => {
            let interval = null;
            let initialDelay = null;
            const start = (e) => {
                if (e.type === 'mousedown' && e.button !== 0) return; // Only left click

                action(); // Initial click

                // Set a delay (400ms) before auto-repeat starts, matching standard OS behavior.
                // This prevents "stutter clicks" from firing multiple times.
                initialDelay = setTimeout(() => {
                    interval = setInterval(action, 100);
                }, 400);
            };
            const stop = () => {
                if (initialDelay) clearTimeout(initialDelay);
                if (interval) clearInterval(interval);
                initialDelay = null;
                interval = null;
            };
            btn.addEventListener('mousedown', start);
            btn.addEventListener('mouseup', stop);
            btn.addEventListener('mouseleave', stop);
            btn.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); });
            btn.addEventListener('touchend', stop);

            // Accessibility: Handle Enter and Space for clicking/repeating
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    if (e.repeat) return; // Prevent double-triggering from OS repeat
                    e.preventDefault(); // Prevent scrolling with space
                    start(e);
                }
            });
            btn.addEventListener('keyup', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    stop();
                }
            });
        };

        // Coordinates Buttons
        // SPECIFIC SELECTOR to avoid overlapping with Time buttons
        const coordBtns = document.getElementById('control-panel-2d').querySelectorAll('.adjuster-group .adjuster-item .adjuster-controls button:not(.toggle-btn)');
        coordBtns.forEach(btn => {
            const isLat = btn.closest('.adjuster-item').textContent.includes('Latitude');
            const isPlus = btn.textContent === '+' || btn.innerHTML.includes('&plus;');
            const type = isLat ? 'latitude' : 'longitude';
            const amount = isPlus ? 0.1 : -0.1;
            setupRepeat(btn, () => {
                if (typeof adjustCoordinate === 'function') adjustCoordinate(type, amount);
            });
        });

        // Time Buttons
        const timeRows = document.getElementById('control-panel-2d').querySelectorAll('.time-grid .adjuster-item');
        timeRows.forEach(row => {
            const label = row.querySelector('.label').textContent.toLowerCase().trim();
            const unitMap = {
                'year': 'years',
                'month': 'months',
                'day': 'days',
                'sidereal day': 'sidereal',
                'hour': 'hours',
                'minute': 'minutes'
            };
            const unit = unitMap[label];
            if (!unit) return;
            const btns = row.querySelectorAll('button');
            btns.forEach(btn => {
                const amount = btn.textContent === '+' ? 1 : -1;
                setupRepeat(btn, () => {
                    if (typeof adjustTime === 'function') adjustTime(unit, amount);
                });
            });
        });
    },


    createIcon: function (src, size) {
        const icon = document.createElement('a-plane');
        icon.setAttribute('width', size);
        icon.setAttribute('height', size);
        icon.classList.add('clickable');
        icon.setAttribute('data-raycastable', '');
        icon.setAttribute('material', {
            src: src,
            transparent: true,
            shader: 'flat'
        });

        icon.addEventListener('mouseenter', () => {
            icon.setAttribute('animation__scale', {
                property: 'scale',
                to: '1.2 1.2 1.2',
                dur: 150,
                easing: 'easeOutQuad'
            });
        });

        icon.addEventListener('mouseleave', () => {
            icon.setAttribute('animation__scale', {
                property: 'scale',
                to: '1 1 1',
                dur: 150,
                easing: 'easeOutQuad'
            });
        });

        return icon;
    },

    performVRFade: function () {
        const camera = document.getElementById('camera');
        const scene = document.querySelector('a-scene');
        if (!camera || !scene) return;

        // Get Camera's World Transform to spawn the tunnel 'around' the user initially
        const camPos = new THREE.Vector3();
        const camQuat = new THREE.Quaternion();
        camera.object3D.getWorldPosition(camPos);
        camera.object3D.getWorldQuaternion(camQuat);

        // 1. "Warp Tunnel" Effect
        // Use a cylinder to create a proper tunnel grid
        const warpContainer = document.createElement('a-entity');

        // Apply Camera Transform to Container
        warpContainer.object3D.position.copy(camPos);
        warpContainer.object3D.quaternion.copy(camQuat);
        warpContainer.object3D.rotateX(THREE.MathUtils.degToRad(-90)); // Align cylinder to forward direction

        const warpTunnel = document.createElement('a-cylinder');
        warpTunnel.setAttribute('radius', 2);
        warpTunnel.setAttribute('height', 80); // Longer tunnel for speed
        warpTunnel.setAttribute('open-ended', 'true');
        warpTunnel.setAttribute('segments-radial', 32);
        warpTunnel.setAttribute('segments-height', 40);
        warpTunnel.setAttribute('material', {
            color: '#00ffff',
            wireframe: true,
            shader: 'flat',
            transparent: true,
            opacity: 0,
            side: 'back',
            depthTest: false
        });
        warpTunnel.setAttribute('position', '0 0 0');

        // Ensure render order is high but below black fade
        warpContainer.object3D.renderOrder = 99998;
        warpTunnel.object3D.renderOrder = 99998;

        // Animations on the Tunnel ("Swoosh" speed)

        // 1. Fade In Instantly
        warpTunnel.setAttribute('animation__fadein', {
            property: 'material.opacity', from: 0, to: 0.8, dur: 200, easing: 'easeOutQuad'
        });

        // 2. Fly (Move tunnel backwards RAPIDLY)
        warpTunnel.setAttribute('animation__fly', {
            property: 'position', from: '0 20 0', to: '0 -100 0', dur: 800, easing: 'easeInExpo'
        });

        // 3. Implode
        warpTunnel.setAttribute('animation__implode', {
            property: 'scale', from: '1 1 1', to: '0.05 1 0.05', dur: 800, easing: 'easeInExpo'
        });

        // 4. Fade Out at end
        warpTunnel.setAttribute('animation__fadeout', {
            property: 'material.opacity', from: 0.8, to: 0, dur: 200, delay: 600, easing: 'easeInQuad'
        });

        warpContainer.appendChild(warpTunnel);
        scene.appendChild(warpContainer); // Attached to world, not camera


        // 2. Black Fade Sphere (Final blocking layer)
        const fadeSphere = document.createElement('a-sphere');
        fadeSphere.setAttribute('radius', 0.3);
        fadeSphere.setAttribute('material', {
            color: 'black',
            shader: 'flat',
            side: 'back', // Render inside face
            transparent: true,
            opacity: 0,
            depthTest: false
        });
        fadeSphere.setAttribute('position', '0 0 0');
        fadeSphere.object3D.renderOrder = 99999;

        camera.appendChild(fadeSphere);

        // Fade to black
        fadeSphere.setAttribute('animation', {
            property: 'material.opacity',
            from: 0,
            to: 1,
            dur: 600,
            delay: 400,
            easing: 'easeInOutQuad'
        });
    },

    updateIcon: function (el, src, color) {
        el.setAttribute('material', {
            src: src,
            color: color || 'white',
            transparent: true,
            shader: 'flat'
        });
    },

    tick: function () {
        const urlParams = new URLSearchParams(window.location.search);
        const isStandalone = urlParams.get('room') === 'none';

        if (isStandalone) {
            // In standalone, just ensure the text is correct once (redundant but safe)
            if (this.roomText.getAttribute('value') !== 'Standalone Session') {
                this.roomText.setAttribute('value', 'Standalone Session');
            }
        }

        const isConnected = !!(typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter);
        const currentMic = !!window.micEnabled;
        const currentMode = window.currentMode || 'draw';

        // Update connection status and room name
        if (!isStandalone) {
            // Update connection status and room name only if networked
            if (isConnected !== this.lastConnected) {
                this.lastConnected = isConnected;
                if (isConnected) {
                    const roomName = urlParams.get('room') || 'n/a';
                    this.roomText.setAttribute('value', roomName);
                } else {
                    this.roomText.setAttribute('value', 'Connecting...');
                }
            }
        }

        // Mic status updates
        if (this.micIcon && currentMic !== this.lastMic) {
            this.lastMic = currentMic;
            const micSrc = currentMic ? this.ICONS.micOn : this.ICONS.micOff;
            this.updateIcon(this.micIcon, micSrc, currentMic ? '#ff0000' : 'white');
            this.borderEl.setAttribute('color', currentMic ? '#ff0000' : '#8a2be2');

            // Update 2D Mic UI
            if (this.ui2d.mic && this.ui2d.micIcon) {
                this.ui2d.micIcon.src = currentMic ? 'assets/icons/mic-on.svg' : 'assets/icons/mic-off.svg';
                this.ui2d.mic.classList.toggle('mic-on', currentMic);
            }
        }

        // Camera status updates
        const currentCamera = !!window.cameraEnabled;
        if (this.cameraIcon && currentCamera !== this.lastCamera) {
            this.lastCamera = currentCamera;
            const camSrc = currentCamera ? this.ICONS.cameraOn : this.ICONS.cameraOff;
            this.updateIcon(this.cameraIcon, camSrc, currentCamera ? 'white' : 'gray');

            // Update 2D Camera UI
            if (this.ui2d.camera && this.ui2d.cameraIcon) {
                this.ui2d.cameraIcon.src = currentCamera ? 'assets/icons/camera-on.svg' : 'assets/icons/camera-off.svg';
                this.ui2d.camera.classList.toggle('active', currentCamera);
            }
        }

        // Mode updates (runs in both Standalone and Networked)
        if (currentMode !== this.lastMode) {
            this.lastMode = currentMode;
            // Highlight active mode, dim others
            Object.keys(this.modeButtons).forEach(id => {
                const btn = this.modeButtons[id];
                const isActive = id === currentMode;
                btn.setAttribute('material', 'opacity', isActive ? 1.0 : 0.3);
            });

            // Update 2D Mode UI
            Object.keys(this.ui2d.modes).forEach(id => {
                const btn = this.ui2d.modes[id];
                if (btn) {
                    const isActive = id === currentMode && !window.isAutoDrawing;
                    btn.classList.toggle('active', isActive);
                }
            });

            // Toggle extras menus
            if (this.ui2d.drawExtras) {
                this.ui2d.drawExtras.classList.toggle('show', currentMode === 'draw' && !window.isAutoDrawing);
            }
            if (this.ui2d.stickfigureExtras) {
                this.ui2d.stickfigureExtras.classList.toggle('show', currentMode === 'stickfigure');
            }
            if (this.ui2d.constellationExtras) {
                this.ui2d.constellationExtras.classList.toggle('show', currentMode === 'constellation');
            }

            // Update B-button hint text dynamically
            const bText = document.getElementById('hint-b-text');
            const bBg = document.getElementById('hint-b-bg');
            if (bText && bBg) {
                let label = "Action (B)";
                let width = 0.15;
                if (currentMode === 'draw') { label = "Draw (B)"; width = 0.1; }
                else if (currentMode === 'stamp') { label = "Stamp (B)"; width = 0.12; }
                else if (currentMode === 'stickfigure') { label = "Add stick figure (B)"; width = 0.22; }
                else if (currentMode === 'constellation') { label = "Add Illustration (B)"; width = 0.22; }
                else if (currentMode === 'pointer') { label = "Pointer Active"; width = 0.15; }

                bText.setAttribute('value', label);
                bBg.setAttribute('width', width);
                bBg.setAttribute('position', `${-width / 2} -0.0125 0`);
            }
        }

        // Mouse Move sync (if changed via other means, though currently only via this component)
        const currentReverse = !!window.reverseMouse;
        if (currentReverse !== this.lastReverse) {
            this.lastReverse = currentReverse;
            if (this.ui2d.mouseMove) {
                this.ui2d.mouseMove.classList.toggle('active', currentReverse);
            }
        }

        // Sync room text to 2D UI
        if (this.ui2d.roomText && !isStandalone) {
            const val = this.roomText.getAttribute('value');
            if (this.ui2d.roomText.textContent !== val) {
                this.ui2d.roomText.textContent = val;
            }
        } else if (this.ui2d.roomText && isStandalone) {
            this.ui2d.roomText.textContent = 'Standalone Session';
        }

        // Sync 2D Control Panel Values
        this.syncTimeUI(false);

        // Force hide tooltips in 2D mode
        if (!this.el.sceneEl.is('vr-mode')) {
            const hints = document.querySelectorAll('.controller-hint');
            hints.forEach(h => {
                if (h.getAttribute('visible')) h.setAttribute('visible', false);
            });
        }
    },

    syncTimeUI: function (force = false) {
        if (!this.controlPanel2DVisible || !this.ui2d || !this.ui2d.controlPanel) return;

        const displays = this.ui2d.controlPanel.displays;
        const toggles = this.ui2d.controlPanel.toggles;

        if (!displays || !displays.lat) return;

        // Coordinates - only update if not focused or forced
        if (displays.lat && (force || document.activeElement !== displays.lat)) {
            displays.lat.value = Math.abs(window.latitude).toFixed(1);
        }
        if (toggles.ns) toggles.ns.textContent = window.latitude >= 0 ? 'N' : 'S';

        if (displays.lon && (force || document.activeElement !== displays.lon)) {
            displays.lon.value = Math.abs(window.longitude).toFixed(1);
        }
        if (toggles.ew) toggles.ew.textContent = window.longitude >= 0 ? 'E' : 'W';

        // Time
        if (window.simulationTime) {
            const clock = window.targetSimulationTime || window.simulationTime;

            const updateInput = (el, val, pad = true) => {
                if (el && (force || document.activeElement !== el)) {
                    const strVal = pad ? val.toString().padStart(2, '0') : val.toString();
                    if (el.value !== strVal) el.value = val;
                }
            };

            updateInput(displays.year, clock.year, false);
            updateInput(displays.month, clock.month);
            updateInput(displays.day, clock.day);
            updateInput(displays.hour, clock.hour);
            updateInput(displays.minute, clock.minute);

            if (displays.timezone) {
                displays.timezone.textContent = clock.offsetNameLong || clock.zoneName;
            }
        }

        // Sync local checkboxes with sky state visibility
        const meridian = document.getElementById('meridian');
        const equator = document.getElementById('equator');
        const ecliptic = document.getElementById('ecliptic');
        const cardinal = document.getElementById('cardinal-points');
        const ncp = document.getElementById('ncp');

        if (toggles.meridian && meridian) toggles.meridian.checked = meridian.getAttribute('fader')?.active ?? meridian.getAttribute('visible');
        if (toggles.equator && equator) toggles.equator.checked = equator.getAttribute('fader')?.active ?? equator.getAttribute('visible');
        if (toggles.ecliptic && ecliptic) toggles.ecliptic.checked = ecliptic.getAttribute('fader')?.active ?? ecliptic.getAttribute('visible');
        if (toggles.cardinal && cardinal) toggles.cardinal.checked = cardinal.getAttribute('fader')?.active ?? cardinal.getAttribute('visible');
        if (toggles.poles && ncp) toggles.poles.checked = ncp.getAttribute('fader')?.active ?? ncp.getAttribute('visible');

        const renderer = document.getElementById('constellation-lines')?.components['constellation-renderer'];
        if (renderer) {
            if (toggles.lines) toggles.lines.checked = renderer.data.showLines;
            if (toggles.boundaries) toggles.boundaries.checked = renderer.data.showBoundaries;
        }
    }

});

