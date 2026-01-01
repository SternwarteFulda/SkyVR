AFRAME.registerComponent('skyvr-tooltip', {
    schema: {
        text: { type: 'string', default: '' },
        offset: { type: 'vec3', default: { x: 0, y: 0.03, z: 0.01 } },
        width: { type: 'number', default: 0.12 }
    },
    init: function () {
        this.showTooltip = this.showTooltip.bind(this);
        this.hideTooltip = this.hideTooltip.bind(this);

        this.el.addEventListener('mouseenter', this.showTooltip);
        this.el.addEventListener('mouseleave', this.hideTooltip);
        this.el.addEventListener('click', this.hideTooltip);
    },
    showTooltip: function () {
        if (!this.data.text) return;

        if (!this.tooltipEl) {
            this.tooltipEl = document.createElement('a-entity');
            this.tooltipEl.setAttribute('position', this.data.offset);

            const textEl = document.createElement('a-text');
            textEl.setAttribute('value', this.data.text);
            textEl.setAttribute('align', 'center');
            textEl.setAttribute('width', 0.25);
            textEl.setAttribute('color', 'white');
            textEl.setAttribute('position', '0 0 0.001');
            this.tooltipEl.appendChild(textEl);

            const bg = document.createElement('a-rounded');
            bg.setAttribute('width', this.data.width);
            bg.setAttribute('height', 0.03);
            bg.setAttribute('radius', 0.005);
            bg.setAttribute('color', '#222');
            bg.setAttribute('opacity', 0.9);
            this.tooltipEl.appendChild(bg);

            this.el.appendChild(this.tooltipEl);
        }
        this.tooltipEl.setAttribute('visible', true);
    },
    hideTooltip: function () {
        if (this.tooltipEl) {
            this.tooltipEl.setAttribute('visible', false);
        }
    },
    remove: function () {
        this.el.removeEventListener('mouseenter', this.showTooltip);
        this.el.removeEventListener('mouseleave', this.hideTooltip);
        this.el.removeEventListener('click', this.hideTooltip);
    }
});
