AFRAME.registerComponent('rounded', {
    schema: {
        enabled: { default: true },
        width: { type: 'number', default: 1 },
        height: { type: 'number', default: 1 },
        radius: { type: 'number', default: 0.3 },
        topLeftRadius: { type: 'number', default: -1 },
        topRightRadius: { type: 'number', default: -1 },
        bottomLeftRadius: { type: 'number', default: -1 },
        bottomRightRadius: { type: 'number', default: -1 },
        color: { type: 'color', default: "#F0F0F0" },
        opacity: { type: 'number', default: 1 }
    },
    init: function () {
        this.rounded = new THREE.Mesh(this.draw(), new THREE.MeshLambertMaterial({ color: new THREE.Color(this.data.color), side: THREE.DoubleSide }));
        this.updateOpacity();
        this.el.setObject3D('mesh', this.rounded)
    },
    update: function () {
        if (this.data.enabled) {
            if (this.rounded) {
                this.rounded.visible = true;
                this.rounded.geometry = this.draw();
                this.rounded.material.color = new THREE.Color(this.data.color);
                this.el.object3D.visible = true;
                //this.el.setAttribute('data-raycastable', '');
                // // Set data-raycastable attribute for all switch-clickarea elements
                // const switchClickareas = this.el.querySelectorAll('[switch] .switch-clickarea');
                // switchClickareas.forEach(clickarea => {
                //     clickarea.setAttribute('data-raycastable', '');
                // });
                this.updateOpacity();
            }
        } else {
            this.rounded.visible = false;
            this.el.object3D.visible = false;
            //this.el.removeAttribute('data-raycastable');
            // // Remove data-raycastable attribute from all switch-clickarea elements
            // const switchClickareas = this.el.querySelectorAll('[switch] .switch-clickarea');
            // switchClickareas.forEach(clickarea => {
            //     clickarea.removeAttribute('data-raycastable');
            // });
        }
    },
    updateOpacity: function () {
        if (this.data.opacity < 0) { this.data.opacity = 0; }
        if (this.data.opacity > 1) { this.data.opacity = 1; }
        if (this.data.opacity < 1) {
            this.rounded.material.transparent = true;
        } else {
            this.rounded.material.transparent = false;
        }
        this.rounded.material.opacity = this.data.opacity;
    },
    tick: function () { },
    remove: function () {
        if (!this.rounded) { return; }
        this.el.object3D.remove(this.rounded);
        this.rounded = null;
    },
    draw: function () {
        var roundedRectShape = new THREE.Shape();
        function roundedRect(ctx, x, y, width, height, topLeftRadius, topRightRadius, bottomLeftRadius, bottomRightRadius) {
            if (!topLeftRadius) { topLeftRadius = 0.00001; }
            if (!topRightRadius) { topRightRadius = 0.00001; }
            if (!bottomLeftRadius) { bottomLeftRadius = 0.00001; }
            if (!bottomRightRadius) { bottomRightRadius = 0.00001; }

            ctx.moveTo(x + topLeftRadius, y);
            ctx.lineTo(x + width - topRightRadius, y);
            ctx.absarc(x + width - topRightRadius, y + topRightRadius, topRightRadius, Math.PI * 1.5, Math.PI * 2);
            ctx.lineTo(x + width, y + height - topRightRadius);
            ctx.absarc(x + width - bottomRightRadius, y + height - bottomRightRadius, bottomRightRadius, 0, Math.PI * 0.5);
            ctx.lineTo(x + bottomLeftRadius, y + height);
            ctx.absarc(x + bottomLeftRadius, y + height - bottomLeftRadius, bottomLeftRadius, Math.PI * 0.5, Math.PI);
            ctx.lineTo(x, y + topLeftRadius);
            ctx.absarc(x + topLeftRadius, y + topLeftRadius, topLeftRadius, Math.PI, Math.PI * 1.5);
        }

        var corners = [this.data.radius, this.data.radius, this.data.radius, this.data.radius];
        if (this.data.topLeftRadius != -1) { corners[0] = this.data.topLeftRadius; }
        if (this.data.topRightRadius != -1) { corners[1] = this.data.topRightRadius; }
        if (this.data.bottomLeftRadius != -1) { corners[2] = this.data.bottomLeftRadius; }
        if (this.data.bottomRightRadius != -1) { corners[3] = this.data.bottomRightRadius; }

        roundedRect(roundedRectShape, -this.data.width / 2, -this.data.height / 2, this.data.width, this.data.height, corners[0], corners[1], corners[2], corners[3]);
        return new THREE.ShapeGeometry(roundedRectShape);
    },
    pause: function () { },
    play: function () { }
});

AFRAME.registerPrimitive('a-rounded', {
    defaultComponents: {
        rounded: {}
    },
    mappings: {
        enabled: 'rounded.enabled',
        width: 'rounded.width',
        height: 'rounded.height',
        radius: 'rounded.radius',
        'top-left-radius': 'rounded.topLeftRadius',
        'top-right-radius': 'rounded.topRightRadius',
        'bottom-left-radius': 'rounded.bottomLeftRadius',
        'bottom-right-radius': 'rounded.bottomRightRadius',
        color: 'rounded.color',
        opacity: 'rounded.opacity'
    }
});