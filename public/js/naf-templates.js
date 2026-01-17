/* global NAF */

// see issue https://github.com/networked-aframe/networked-aframe/issues/267
if (typeof NAF !== 'undefined') {
    NAF.schemas.getComponentsOriginal = NAF.schemas.getComponents;
    NAF.schemas.getComponents = (template) => {
        if (!NAF.schemas.hasTemplate('#rig-template')) {
            NAF.schemas.add({
                template: '#rig-template',
                components: [
                    {
                        component: 'position',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.001)
                    },
                    {
                        component: 'rotation',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.5)
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#camera-template')) {
            NAF.schemas.add({
                template: '#camera-template',
                components: [
                    {
                        component: 'position',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.001)
                    },
                    {
                        component: 'rotation',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.5)
                    },
                    {
                        selector: '.nametag',
                        component: 'position'
                    },
                    {
                        selector: '.mic-indicator',
                        component: 'position'
                    },
                    {
                        component: 'player-info',
                        property: 'name'
                    },
                    {
                        component: 'player-info',
                        property: 'color'
                    },
                    {
                        component: 'player-info',
                        property: 'spawned'
                    },
                    {
                        component: 'player-info',
                        property: 'spotId'
                    },
                    {
                        component: 'player-info',
                        property: 'micStatus'
                    },
                    {
                        component: 'player-info',
                        property: 'presence'
                    },
                    {
                        component: 'player-info',
                        property: 'videoEnabled'
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#right-controller-template')) {
            NAF.schemas.add({
                template: '#right-controller-template',
                components: [
                    {
                        component: 'position',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.001)
                    },
                    {
                        component: 'rotation',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.5)
                    },
                    {
                        selector: '.pointer',
                        component: 'visible'
                    },
                    {
                        selector: '.pointer',
                        component: 'position'
                    },
                    {
                        selector: '.pointer',
                        component: 'bottom-origin-cylinder',
                        property: 'opacity'
                    },
                    {
                        selector: '.pointer',
                        component: 'rotation'
                    },
                    {
                        selector: '.pointer-arrow',
                        component: 'visible'
                    },
                    {
                        selector: '.arrow-mesh',
                        component: 'material',
                        property: 'color'
                    },
                    {
                        selector: '.pointer-arrow',
                        component: 'rotation'
                    },
                    {
                        component: 'player-info',
                        property: 'name'
                    },
                    {
                        component: 'player-info',
                        property: 'color'
                    },
                    {
                        component: 'player-info',
                        property: 'spawned'
                    },
                    {
                        component: 'player-info',
                        property: 'spotId'
                    },
                    {
                        component: 'player-info',
                        property: 'micStatus'
                    },
                    {
                        component: 'player-info',
                        property: 'presence'
                    },
                    {
                        component: 'player-info',
                        property: 'videoEnabled'
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#left-controller-template')) {
            NAF.schemas.add({
                template: '#left-controller-template',
                components: [
                    {
                        component: 'position',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.001)
                    },
                    {
                        component: 'rotation',
                        requiresNetworkUpdate: NAF.utils.vectorRequiresUpdate(0.5)
                    },
                    {
                        selector: '.binoculars-model',
                        component: 'visible'
                    },
                    {
                        selector: '.binoculars-model',
                        component: 'position'
                    },
                    {
                        selector: '.binoculars-model',
                        component: 'rotation'
                    },
                    {
                        component: 'player-info',
                        property: 'name'
                    },
                    {
                        component: 'player-info',
                        property: 'color'
                    },
                    {
                        component: 'player-info',
                        property: 'spawned'
                    },
                    {
                        component: 'player-info',
                        property: 'spotId'
                    },
                    {
                        component: 'player-info',
                        property: 'micStatus'
                    },
                    {
                        component: 'player-info',
                        property: 'presence'
                    },
                    {
                        component: 'player-info',
                        property: 'videoEnabled'
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#sky-template')) {
            NAF.schemas.add({
                template: '#sky-template',
                components: ['sky-state']
            });
        }
        if (!NAF.schemas.hasTemplate('#constellation-illustration-template')) {
            NAF.schemas.add({
                template: '#constellation-illustration-template',
                components: [
                    {
                        component: 'constellation-illustration',
                        property: 'constellationId'
                    },
                    {
                        component: 'constellation-illustration',
                        property: 'opacity'
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#drawing-stroke-template')) {
            NAF.schemas.add({
                template: '#drawing-stroke-template',
                components: [
                    {
                        component: 'drawing-stroke',
                        property: 'points'
                    },
                    {
                        component: 'drawing-stroke',
                        property: 'color'
                    }
                ]
            });
        }
        if (!NAF.schemas.hasTemplate('#identified-info-template')) {
            NAF.schemas.add({
                template: '#identified-info-template',
                components: [
                    {
                        component: 'identified-info',
                        property: 'name'
                    },
                    {
                        component: 'identified-info',
                        property: 'info'
                    },
                    {
                        component: 'identified-info',
                        property: 'type'
                    },
                    {
                        component: 'identified-info',
                        property: 'targetTextOpacity'
                    },
                    {
                        component: 'identified-info',
                        property: 'targetMarkerOpacity'
                    },
                    {
                        component: 'identified-info',
                        property: 'isRemoving'
                    },
                    'position'
                ]
            });
        }

        const components = NAF.schemas.getComponentsOriginal(template);
        return components;
    };
}
