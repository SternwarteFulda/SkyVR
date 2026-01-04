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
        this.roomIcon.setAttribute('position', '0 0 0');
        this.roomIcon.addEventListener('click', () => {
            const params = typeof window.getLobbyParams === 'function' ? window.getLobbyParams() : window.location.search;
            window.location.href = 'lobby.html' + params;
        });
        this.roomGroup.appendChild(this.roomIcon);

        this.roomText = document.createElement('a-text');
        this.roomText.setAttribute('value', '----');
        this.roomText.setAttribute('color', 'white');
        this.roomText.setAttribute('width', 0.4);
        this.roomText.setAttribute('align', 'left');
        this.roomText.setAttribute('position', '0.03 0 0');
        this.roomText.setAttribute('font', 'mozillavr');
        this.roomGroup.appendChild(this.roomText);

        // Mic Section (Center)
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

        this.roomText.setAttribute('value', 'Connecting...');
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

    updateIcon: function (el, src, color) {
        el.setAttribute('material', {
            src: src,
            color: color || 'white',
            transparent: true,
            shader: 'flat'
        });
    },

    tick: function () {
        const isConnected = !!(typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter);
        const currentMic = !!window.micEnabled;
        const currentMode = window.currentMode || 'draw';

        // Update connection status and room name
        if (isConnected !== this.lastConnected) {
            this.lastConnected = isConnected;
            if (isConnected) {
                const urlParams = new URLSearchParams(window.location.search);
                const roomName = urlParams.get('room') || 'n/a';
                this.roomText.setAttribute('value', roomName);
            } else {
                this.roomText.setAttribute('value', 'Connecting...');
            }
        }

        if (currentMic !== this.lastMic) {
            this.lastMic = currentMic;
            const micSrc = currentMic ? this.ICONS.micOn : this.ICONS.micOff;
            this.updateIcon(this.micIcon, micSrc, currentMic ? '#ff0000' : 'white');
            this.borderEl.setAttribute('color', currentMic ? '#ff0000' : '#8a2be2');
        }

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

