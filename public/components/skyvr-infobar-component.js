AFRAME.registerComponent('skyvr-infobar', {
    init: function () {
        // Individual icon paths
        this.ICONS = {
            room: '#icon-door',
            micOn: '#icon-mic-on',
            micOff: '#icon-mic-off',
            draw: '#icon-draw',
            stamp: '#icon-stamp',
            sticky: '#icon-sticky',
            constellation: '#icon-constellation'
        };

        // Create container
        this.container = document.createElement('a-entity');
        this.el.appendChild(this.container);

        // 1. Background Plane
        this.bgEl = document.createElement('a-plane');
        this.bgEl.setAttribute('width', 0.65);
        this.bgEl.setAttribute('height', 0.05);
        this.bgEl.setAttribute('color', '#050510');
        this.bgEl.setAttribute('opacity', 0.85);
        this.bgEl.setAttribute('position', '0 0 -0.01');
        this.bgEl.setAttribute('material', { shader: 'flat', transparent: true });
        this.container.appendChild(this.bgEl);

        // 2. Glowing Border
        this.borderEl = document.createElement('a-plane');
        this.borderEl.setAttribute('width', 0.65);
        this.borderEl.setAttribute('height', 0.003);
        this.borderEl.setAttribute('color', '#8a2be2');
        this.borderEl.setAttribute('position', '0 0.025 0');
        this.borderEl.setAttribute('material', 'shader: flat');
        this.container.appendChild(this.borderEl);

        // 3. Room Section (Icon + Text)
        this.roomGroup = document.createElement('a-entity');
        this.roomGroup.setAttribute('position', '-0.33 0 0');
        this.container.appendChild(this.roomGroup);

        this.roomIcon = this.createIcon(this.ICONS.room, 0.035);
        this.roomIcon.setAttribute('position', '-0.03 0 0');
        this.roomIcon.setAttribute('data-raycastable', '');
        this.roomGroup.appendChild(this.roomIcon);

        this.roomIcon.addEventListener('click', () => {
            const params = typeof window.getLobbyParams === 'function' ? window.getLobbyParams() : window.location.search;
            window.location.href = 'lobby.html' + params;
        });

        this.roomText = document.createElement('a-text');
        this.roomText.setAttribute('value', '----');
        this.roomText.setAttribute('color', 'white');
        this.roomText.setAttribute('width', 0.4);
        this.roomText.setAttribute('align', 'left');
        this.roomText.setAttribute('position', '0 0 0');
        this.roomText.setAttribute('font', 'mozillavr');
        this.roomGroup.appendChild(this.roomText);

        // 4. Mic Section (Icon only, click to toggle)
        this.micIcon = this.createIcon(this.ICONS.micOff, 0.035);
        this.micIcon.setAttribute('position', '-0.12 0 0.001');
        this.micIcon.setAttribute('data-raycastable', '');
        this.micIcon.classList.add('clickable');
        this.container.appendChild(this.micIcon);

        this.micIcon.addEventListener('click', () => {
            window.micEnabled = !window.micEnabled;
            if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter) {
                NAF.connection.adapter.enableMicrophone(window.micEnabled);
            }
            const micBtnEle = document.getElementById('mic-btn');
            if (micBtnEle) micBtnEle.textContent = window.micEnabled ? 'Mute Mic' : 'Unmute Mic';
        });

        // 5. Mode Group (Interactable Buttons)
        this.modeGroup = document.createElement('a-entity');
        this.modeGroup.setAttribute('position', '0.08 0 0');
        this.container.appendChild(this.modeGroup);

        this.modeButtons = {};
        this.modesList = ['draw', 'stamp', 'sticky', 'constellation'];
        const modes = [
            { id: 'draw', icon: this.ICONS.draw, pos: 0.05 },
            { id: 'stamp', icon: this.ICONS.stamp, pos: 0.10 },
            { id: 'sticky', icon: this.ICONS.sticky, pos: 0.15 },
            { id: 'constellation', icon: this.ICONS.constellation, pos: 0.20 }
        ];

        modes.forEach(m => {
            const btn = this.createIcon(m.icon, 0.035);
            btn.setAttribute('position', `${m.pos} 0 0.001`);
            btn.setAttribute('data-raycastable', '');
            btn.addEventListener('click', () => {
                window.currentMode = m.id;
            });
            this.modeGroup.appendChild(btn);
            this.modeButtons[m.id] = btn;
        });

        // Add controller listener for Y button
        window.addEventListener('ybuttondown', (e) => {
            const currentIndex = this.modesList.indexOf(window.currentMode || 'draw');
            const nextIndex = (currentIndex + 1) % this.modesList.length;
            window.currentMode = this.modesList[nextIndex];
        });

        this.lastMic = null;
        this.lastRoom = null;
        this.lastMode = null;
        this.lastConnected = false;

        this.roomText.setAttribute('value', 'Connecting...');
        window.currentMode = 'draw';
    },

    createIcon: function (src, size) {
        const icon = document.createElement('a-plane');
        icon.setAttribute('width', size);
        icon.setAttribute('height', size);
        icon.classList.add('clickable');
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
                btn.setAttribute('material', 'color', isActive ? '#ffffff' : '#ffffff');
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
                else if (currentMode === 'sticky') { label = "Show Stick Figure (B)"; width = 0.24; }
                else if (currentMode === 'constellation') { label = "Show Constellation (B)"; width = 0.27; }

                bText.setAttribute('value', label);
                bBg.setAttribute('width', width);
                bBg.setAttribute('position', `${-width / 2} -0.0125 0`);
            }
        }
    }
});
