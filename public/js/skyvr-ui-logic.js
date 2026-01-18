// Set renderOrder ensuring Milkyway is behind stars (10 vs 20) and enable boost on Quest
document.addEventListener('DOMContentLoaded', () => {
    // Check for VR headset or Mobile
    const isMobile = AFRAME.utils.device.isMobile();
    const isHeadset = AFRAME.utils.device.checkHeadsetConnected();
    const isVR = isMobile || isHeadset;

    const milkywayEl = document.getElementById('milkyway');
    const milkywayBoost = document.getElementById('milkyway-boost');

    if (milkywayEl) {
        if (milkywayEl.hasLoaded) {
            setMilkywayRenderOrder(milkywayEl);
        } else {
            milkywayEl.addEventListener('loaded', function () {
                setMilkywayRenderOrder(this);
            });
        }
    }

    if (milkywayBoost) {
        // Enable boost layer on VR devices / Mobile to compensate for dim screens
        if (isVR) {
            console.log('VR/Mobile device detected: Enabling Milkyway Boost Layer');
            milkywayBoost.setAttribute('visible', true);
            if (milkywayBoost.hasLoaded) {
                setMilkywayRenderOrder(milkywayBoost);
            } else {
                milkywayBoost.addEventListener('loaded', function () {
                    setMilkywayRenderOrder(this);
                });
            }
        }
    }
});

function setMilkywayRenderOrder(el) {
    // Set to 10 so it renders BEFORE stars (default 20 by render-order component)
    // This allows stars to "pop" on top regardless of blending
    el.object3D.renderOrder = 10;
    const mesh = el.getObject3D('mesh');
    if (mesh && mesh.material) {
        mesh.material.depthWrite = false;
    }
}




// Native Fullscreen Logic
document.addEventListener('DOMContentLoaded', () => {
    const fsBtn = document.getElementById('infobar-2d-fullscreen');
    const fsIcon = fsBtn ? fsBtn.querySelector('img') : null;
    if (fsBtn && fsIcon) {
        fsBtn.addEventListener('click', function () {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().then(() => {
                    fsIcon.src = 'assets/icons/exit-fullscreen.svg';
                    fsBtn.title = i18next.t('infobar.exit_fullscreen', { defaultValue: 'Exit Fullscreen' });
                }).catch(err => {
                    console.error(`Error attempting to enable fullscreen: ${err.message}`);
                });
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                    fsIcon.src = 'assets/icons/fullscreen.svg';
                    fsBtn.title = i18next.t('infobar.enter_fullscreen', { defaultValue: 'Enter Fullscreen' });
                }
            }
        });

        // Handle ESC key or other ways fullscreen exits
        document.addEventListener('fullscreenchange', () => {
            if (!document.fullscreenElement) {
                fsIcon.src = 'assets/icons/fullscreen.svg';
                fsBtn.title = i18next.t('infobar.enter_fullscreen', { defaultValue: 'Enter Fullscreen' });
            } else {
                fsIcon.src = 'assets/icons/exit-fullscreen.svg';
                fsBtn.title = i18next.t('infobar.exit_fullscreen', { defaultValue: 'Exit Fullscreen' });
            }
        });
    }
});

// Fetch config for legal links
document.addEventListener('DOMContentLoaded', () => {
    fetch('/config')
        .then(response => response.json())
        .then(config => {
            const legalLinks = document.getElementById('legal-links-2d');
            const imprintLink = document.getElementById('imprint-link-2d');
            const privacyLink = document.getElementById('privacy-link-2d');

            if (!legalLinks) return;

            // Always show the container since the About button is present
            legalLinks.style.display = 'block';

            if (config.imprintUrl) {
                imprintLink.href = config.imprintUrl;
            } else {
                imprintLink.style.display = 'none';
                // Hide the separator before Imprint
                if (imprintLink.previousElementSibling && imprintLink.previousElementSibling.classList.contains('separator')) {
                    imprintLink.previousElementSibling.style.display = 'none';
                }
            }

            if (config.privacyPolicyUrl) {
                privacyLink.href = config.privacyPolicyUrl;
            } else {
                privacyLink.style.display = 'none';
                // Hide the separator before Privacy
                if (privacyLink.previousElementSibling && privacyLink.previousElementSibling.classList.contains('separator')) {
                    privacyLink.previousElementSibling.style.display = 'none';
                }
            }
        })
        .catch(err => console.error('Error fetching config:', err));

    // Listen for VR mode changes to toggle visibility
    const scene = document.querySelector('a-scene');
    if (scene) {
        scene.addEventListener('enter-vr', function () {
            const links = document.getElementById('legal-links-2d');
            if (links) links.style.display = 'none';

            if (links && (links.querySelector('a[href="#"]') === null)) { // simplistic check
                links.style.display = 'block';
            }
        });
    }
});
