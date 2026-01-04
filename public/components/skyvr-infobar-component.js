AFRAME.registerComponent('skyvr-infobar', {
    init: function () {
        // Individual icon paths
        this.ICONS = {
            room: '#icon-door',
            micOn: '#icon-mic-on',
            micOff: '#icon-mic-off',
            draw: '#icon-draw',
            stamp: '#icon-stamp',
            stickfigure: '#icon-stickfigure',
            constellation: '#icon-constellation'
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
        this.roomIcon.addEventListener('click', () => {
            // 1. Play exit animation on the icon
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
        });

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
            this.micIcon.addEventListener('click', () => {
                window.micEnabled = !window.micEnabled;
                if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter) {
                    NAF.connection.adapter.enableMicrophone(window.micEnabled);
                }
                const micBtnEle = document.getElementById('mic-btn');
                if (micBtnEle) micBtnEle.textContent = window.micEnabled ? 'Mute Mic' : 'Unmute Mic';
            });
            this.container.appendChild(this.micIcon);
        } else {
            console.log("Infobar: Mic disabled via URL param. Hiding mic icon.");
            this.micIcon = null;
        }

        // Mode Group (Right)
        this.modeButtons = {};
        this.modesList = ['draw', 'stickfigure', 'constellation']; // 'stamp' disabled

        // Mode container starts after the center
        this.modeGroup = document.createElement('a-entity');
        this.modeGroup.setAttribute('position', '0.205 0 0');
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
                window.currentMode = m.id;
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
        this.lastRoom = null;
        this.lastMode = null;
        this.lastConnected = false;

        if (isStandalone) {
            this.roomText.setAttribute('value', 'Standalone Session');
        } else {
            this.roomText.setAttribute('value', 'Connecting...');
        }
        window.currentMode = 'draw';
    },

    remove: function () {
        window.removeEventListener('ybuttondown', this.onYButtonDown);
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

                bText.setAttribute('value', label);
                bBg.setAttribute('width', width);
                bBg.setAttribute('position', `${-width / 2} -0.0125 0`);
            }
        }
    }
});

