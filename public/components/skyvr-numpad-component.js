/* global AFRAME */
AFRAME.registerComponent('skyvr-numpad', {
    schema: {
        targetId: { type: 'string' }
    },

    init: function () {
        this.buffer = "";
        this.el.setAttribute('visible', false);

        // Create background - Center at 0,0,0
        const bg = document.createElement('a-rounded');
        bg.setAttribute('width', 0.28);
        bg.setAttribute('height', 0.48);
        bg.setAttribute('color', '#1a1a2e');
        bg.setAttribute('opacity', 0.95);
        bg.setAttribute('radius', 0.01);
        bg.setAttribute('position', '0 0 0'); // Centered
        this.el.appendChild(bg);

        // Display Area (Preview)
        // Background for display
        const dispBg = document.createElement('a-rounded');
        dispBg.setAttribute('width', 0.24);
        dispBg.setAttribute('height', 0.06);
        dispBg.setAttribute('color', '#000');
        dispBg.setAttribute('radius', 0.005);
        dispBg.setAttribute('position', '0 0.18 0.005');
        this.el.appendChild(dispBg);

        this.display = document.createElement('a-text');
        this.display.setAttribute('value', '');
        this.display.setAttribute('align', 'right');
        this.display.setAttribute('baseline', 'center');
        this.display.setAttribute('width', 0.8);
        this.display.setAttribute('position', '0.10 0.18 0.01');
        this.display.setAttribute('font', 'monoid');
        this.display.setAttribute('color', '#00ffaa');
        this.el.appendChild(this.display);

        // Create keys
        const keys = [
            { label: '7', x: -0.09, y: 0.10 }, { label: '8', x: 0, y: 0.10 }, { label: '9', x: 0.09, y: 0.10 },
            { label: '4', x: -0.09, y: 0.03 }, { label: '5', x: 0, y: 0.03 }, { label: '6', x: 0.09, y: 0.03 },
            { label: '1', x: -0.09, y: -0.04 }, { label: '2', x: 0, y: -0.04 }, { label: '3', x: 0.09, y: -0.04 },
            { label: '-', x: -0.09, y: -0.11 }, { label: '0', x: 0, y: -0.11 }, { label: '.', x: 0.09, y: -0.11 }
        ];

        keys.forEach(k => {
            const btn = this.createButton(k.label, k.x, k.y, 0.08, 0.06);
            btn.addEventListener('click', (evt) => {
                evt.stopPropagation();
                this.onKey(k.label);
            });
            // also need raycastable on the bg of the button
            const bgEl = btn.querySelector('a-rounded');
            bgEl.addEventListener('click', (evt) => {
                evt.stopPropagation();
                this.onKey(k.label);
            });
            this.el.appendChild(btn);
        });

        // Action Keys
        // Backspace
        const backBtn = this.createButton('DEL', -0.07, -0.19, 0.12, 0.06, '#553333');
        backBtn.querySelector('a-rounded').addEventListener('click', (evt) => { evt.stopPropagation(); this.onBackspace(); });
        this.el.appendChild(backBtn);

        // Enter
        const enterBtn = this.createButton('OK', 0.07, -0.19, 0.12, 0.06, '#335533');
        enterBtn.querySelector('a-rounded').addEventListener('click', (evt) => { evt.stopPropagation(); this.onEnter(); });
        this.el.appendChild(enterBtn);

        // Close X
        const closeBtn = this.createButton('X', 0.11, 0.22, 0.04, 0.04, '#552222');
        closeBtn.querySelector('a-rounded').addEventListener('click', (evt) => { evt.stopPropagation(); this.close(); });
        this.el.appendChild(closeBtn);

        // Global exposure
        window.openNumpad = this.open.bind(this);
        window.closeNumpad = this.close.bind(this);
    },

    createButton: function (label, x, y, w, h, color = '#2a2a3a') {
        const el = document.createElement('a-entity');
        el.setAttribute('position', `${x} ${y} 0.01`);

        const bg = document.createElement('a-rounded');
        bg.setAttribute('width', w);
        bg.setAttribute('height', h);
        bg.setAttribute('radius', 0.01);
        bg.setAttribute('color', color);
        bg.setAttribute('position', `0 0 0`); // Centered mesh
        bg.setAttribute('class', 'control-panel-button');
        bg.setAttribute('data-raycastable', '');

        const txt = document.createElement('a-text');
        txt.setAttribute('value', label);
        txt.setAttribute('align', 'center');
        txt.setAttribute('baseline', 'center'); // Critical for vertical centers
        txt.setAttribute('width', 0.8);
        txt.setAttribute('position', '0 0 0.01'); // Centered on parent
        txt.setAttribute('color', 'white');

        el.appendChild(bg);
        el.appendChild(txt);

        return el;
    },

    onKey: function (char) {
        if ((this.buffer.length < 12)) {
            this.buffer += char;
            this.updateDisplay();
        }
    },

    onBackspace: function () {
        this.buffer = this.buffer.slice(0, -1);
        this.updateDisplay();
    },

    onEnter: function () {
        if (!this.data.targetId) return;

        const val = this.buffer;
        if (val === "") return;

        if (this.data.targetId.includes('year') ||
            this.data.targetId.includes('month') ||
            this.data.targetId.includes('day') ||
            this.data.targetId.includes('hour') ||
            this.data.targetId.includes('minute')) {

            if (window.updateTimeFromInput) {
                window.updateTimeFromInput(this.data.targetId, val);
            }
        } else if (this.data.targetId.includes('lat') || this.data.targetId.includes('lon')) {
            if (window.updateLocationFromInput) {
                window.updateLocationFromInput(this.data.targetId, val);
            }
        }

        this.close();
    },

    updateDisplay: function () {
        this.display.setAttribute('value', this.buffer);
    },

    open: function (targetId) {
        this.data.targetId = targetId;
        this.buffer = "";
        const el = document.getElementById(targetId);
        if (el) {
            // Since we changed to child a-text, we need to read from the child
            const textEl = el.querySelector('a-text');
            if (textEl) {
                this.buffer = textEl.getAttribute('value').trim();
            }
        }

        this.updateDisplay();
        this.el.setAttribute('visible', true);
    },

    close: function () {
        this.el.setAttribute('visible', false);
        this.data.targetId = null;
    }
});
