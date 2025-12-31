AFRAME.registerComponent('skyvr-infobar', {
    init: function () {
        // Individual icon paths
        this.ICONS = {
            vessel: 'assets/icons/vessel.svg',
            micOn: 'assets/icons/mic-on.svg',
            micOff: 'assets/icons/mic-off.svg',
            draw: 'assets/icons/draw.svg',
            stamp: 'assets/icons/stamp.svg',
            sticky: 'assets/icons/sticky.svg',
            constellation: 'assets/icons/constellation.svg'
        };

        // Create container
        this.container = document.createElement('a-entity');
        this.el.appendChild(this.container);

        // 1. Background Plane
        this.bgEl = document.createElement('a-plane');
        this.bgEl.setAttribute('width', 0.55);
        this.bgEl.setAttribute('height', 0.05);
        this.bgEl.setAttribute('color', '#050510');
        this.bgEl.setAttribute('opacity', 0.85);
        this.bgEl.setAttribute('position', '0 0 -0.01');
        this.bgEl.setAttribute('material', { shader: 'flat', transparent: true });
        this.container.appendChild(this.bgEl);

        // 2. Glowing Border
        this.borderEl = document.createElement('a-plane');
        this.borderEl.setAttribute('width', 0.55);
        this.borderEl.setAttribute('height', 0.003);
        this.borderEl.setAttribute('color', '#8a2be2');
        this.borderEl.setAttribute('position', '0 0.025 0');
        this.borderEl.setAttribute('material', 'shader: flat');
        this.container.appendChild(this.borderEl);

        // 3. Vessel Section (Icon + Text)
        this.vesselGroup = document.createElement('a-entity');
        this.vesselGroup.setAttribute('position', '-0.2 0 0');
        this.container.appendChild(this.vesselGroup);

        this.vesselIcon = this.createIcon(this.ICONS.vessel, 0.03);
        this.vesselIcon.setAttribute('position', '-0.03 0 0');
        this.vesselGroup.appendChild(this.vesselIcon);

        this.roomText = document.createElement('a-text');
        this.roomText.setAttribute('value', '----');
        this.roomText.setAttribute('color', 'white');
        this.roomText.setAttribute('width', 0.4);
        this.roomText.setAttribute('align', 'left');
        this.roomText.setAttribute('position', '0 0 0');
        this.roomText.setAttribute('font', 'mozillavr');
        this.vesselGroup.appendChild(this.roomText);

        // 4. Mic Section (Icon only, click to toggle)
        this.micIcon = this.createIcon(this.ICONS.micOff, 0.035);
        this.micIcon.setAttribute('position', '0 0 0.001');
        this.micIcon.setAttribute('data-raycastable', '');
        this.micIcon.classList.add('clickable');
        this.container.appendChild(this.micIcon);

        this.micIcon.addEventListener('click', () => {
            if (typeof NAF !== 'undefined' && NAF.connection && NAF.connection.adapter) {
                window.micEnabled = !window.micEnabled;
                NAF.connection.adapter.enableMicrophone(window.micEnabled);

                // Sync the manual button if it exists
                const micBtnEle = document.getElementById('mic-btn');
                if (micBtnEle) {
                    micBtnEle.textContent = window.micEnabled ? 'Mute Mic' : 'Unmute Mic';
                }
            }
        });

        // 5. Mode Section (Icon only)
        this.modeIcon = this.createIcon(this.ICONS.draw, 0.035);
        this.modeIcon.setAttribute('position', '0.2 0 0');
        this.container.appendChild(this.modeIcon);

        this.lastMic = null;
        this.lastRoom = null;
        this.lastMode = null;

        const urlParams = new URLSearchParams(window.location.search);
        this.roomName = urlParams.get('room') || '1234';
        this.roomText.setAttribute('value', this.roomName);

        window.currentMode = 'draw';
    },

    createIcon: function (src, size) {
        const icon = document.createElement('a-plane');
        icon.setAttribute('width', size);
        icon.setAttribute('height', size);
        icon.setAttribute('material', {
            src: src,
            transparent: true,
            shader: 'flat'
        });
        return icon;
    },

    updateIcon: function (el, src, color) {
        el.setAttribute('material', 'src', src);
        if (color) {
            el.setAttribute('material', 'color', color);
        } else {
            el.setAttribute('material', 'color', 'white');
        }
    },

    tick: function () {
        const currentMic = !!window.micEnabled;
        const currentMode = window.currentMode || 'draw';

        if (currentMic !== this.lastMic) {
            this.lastMic = currentMic;
            const micSrc = currentMic ? this.ICONS.micOn : this.ICONS.micOff;
            this.updateIcon(this.micIcon, micSrc, currentMic ? '#ff0000' : 'white');

            // Visual feedback on border - red if mic is on
            this.borderEl.setAttribute('color', currentMic ? '#ff0000' : '#8a2be2');
        }

        if (currentMode !== this.lastMode) {
            this.lastMode = currentMode;
            const modeSrc = this.ICONS[currentMode] || this.ICONS.draw;
            this.updateIcon(this.modeIcon, modeSrc);
        }
    }
});
