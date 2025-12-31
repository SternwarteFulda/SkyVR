window.ntExample = {
    randomColor: () => {
        return '#' + new THREE.Color(Math.random(), Math.random(), Math.random()).getHexString();
    }
};

AFRAME.registerComponent('player-info', {
// notice that color and name are both listed in the schema; NAF will only keep
// properties declared in the schema in sync.
    schema: {
        name: { type: 'string', default: 'user-' + Math.round(Math.random() * 10000) },
        color: {
            type: 'color', // btw: color is just a string under the hood in A-Frame
            default: window.ntExample.randomColor()
        }
    },

    init: function () {
        this.head = this.el.querySelector('.head');
        this.nametag = this.el.querySelector('.nametag');

        this.ownedByLocalUser = this.el.id === 'camera';
        console.log('this.el.id', this.el.id);

        if (this.ownedByLocalUser) {
            // populate the html overlay with the correct name on init
            this.nametagInput = document.getElementById('username-overlay');
            this.nametagInput.value = this.data.name;

            // add the initial color to the html overlay color picker button
            document.querySelector('#color-changer').style.backgroundColor = this.data.color;
            document.querySelector('#color-changer').style.color = this.data.color;
        }
    },

    // here as an example, not used in current demo. Could build a user list, expanding on this.
    listUsers: function () {
        console.log(
            'userlist',
            [...document.querySelectorAll('[player-info]')].map((el) => el.components['player-info'].data.name)
        );
    },

    newRandomColor: function () {
        this.el.setAttribute('player-info', 'color', window.ntExample.randomColor());
    },

    update: function () {
        if (this.head) this.head.setAttribute('material', 'color', this.data.color);
        if (this.nametag) this.nametag.setAttribute('value', this.data.name);
    }
});