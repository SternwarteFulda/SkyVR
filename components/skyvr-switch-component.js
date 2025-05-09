AFRAME.registerComponent('switch', {
    schema: {
        controlPanelId: { type: 'string', default: '' },
        position: { type: 'vec3', default: { x: -0.05, y: 0.05, z: 0 } },
        clickActionParam: { type: 'string', default: 'green' },
        toggled: { type: 'boolean', default: false },
    },

    init: function () {
        const el = this.el;
        const data = this.data;

        this.activeColor = '#fb6419';

        // Set initial position
        el.setAttribute('position', data.position);

        // Create switch base
        const switchBase = document.createElement('a-rounded');
        switchBase.setAttribute('class', 'switch-base');
        switchBase.setAttribute('position', '0 0 0.00001');
        switchBase.setAttribute('width', '0.025');
        switchBase.setAttribute('height', '0.015');
        switchBase.setAttribute('radius', '0.0075');
        switchBase.setAttribute('material', `shader: flat; color: ${this.activeColor}`);
        el.appendChild(switchBase);

        // Create switch slider
        const switchSlider = document.createElement('a-circle');
        switchSlider.setAttribute('class', 'switch-slider');
        switchSlider.setAttribute('position', '0.005 0 0.00002');
        switchSlider.setAttribute('radius', '0.005');
        switchSlider.setAttribute('material', 'shader: flat; color: white');
        el.appendChild(switchSlider);

        // Create switch clickarea
        const switchClickarea = document.createElement('a-plane');
        switchClickarea.setAttribute('class', 'switch-clickarea');
        switchClickarea.setAttribute('position', '0 0 0.00003');
        switchClickarea.setAttribute('width', '0.03');
        switchClickarea.setAttribute('height', '0.02');
        switchClickarea.setAttribute('material', 'shader: flat; transparent: true; opacity: 0');
        switchClickarea.setAttribute('data-raycastable', '');
        // switchClickarea.addEventListener('click', () => {
        //     window.onTogglerClick(data.clickActionParam);
        // });
        el.appendChild(switchClickarea);

        this.onClick = this.onClick.bind(this);
    },

    play: function () {
        // this.controlPanel = document.querySelector('#control-panel-1');
        // console.log('Control Panel', this.controlPanel);
        // this.onVisibilityChange = this.onVisibilityChange.bind(this);
        // if (this.controlPanel) {
        //     this.controlPanel.addEventListener('componentchanged', this.onVisibilityChange);
        // }
        this.el.addEventListener('click', this.onClick);
    },

    pause: function () {
        // if (this.controlPanel) {
        //     this.controlPanel.removeEventListener('componentchanged', this.onVisibilityChange);
        // }
        this.el.removeEventListener('click', this.onClick);
    },

    onVisibilityChange: function (event) {
        console.log(event);
        if (event.detail.name === 'control-panel') {
            const switchClickarea = this.el.querySelector('.switch-clickarea');
            const isVisible = event.detail.newData.visible;
        
            if (isVisible) {
                switchClickarea.setAttribute('data-raycastable', '');
            } else {
                switchClickarea.removeAttribute('data-raycastable');
            }
        }
    },

    onClick: function () {
        const data = this.data;
        const switchSlider = this.el.querySelector('.switch-slider');
        const switchBase = this.el.querySelector('.switch-base');
    
        data.toggled = !data.toggled;
    
        if (data.toggled) {
            switchSlider.setAttribute('position', '-0.005 0 0.00002');
            switchBase.setAttribute('material', 'color: #808080');
        } else {
            switchSlider.setAttribute('position', '0.005 0 0.00002');
            switchBase.setAttribute('material', `color: ${this.activeColor}`);
        }
    
        window.onTogglerClick(data.clickActionParam);
      },
});