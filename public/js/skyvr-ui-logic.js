/* global document, fetch, console */

// Set low renderOrder for milkyway sphere
document.addEventListener('DOMContentLoaded', () => {
    const milkywayEl = document.getElementById('milkyway');
    if (milkywayEl) {
        if (milkywayEl.hasLoaded) {
            setMilkywayRenderOrder(milkywayEl);
        } else {
            milkywayEl.addEventListener('loaded', function () {
                setMilkywayRenderOrder(this);
            });
        }
    }
});

function setMilkywayRenderOrder(el) {
    el.object3D.renderOrder = 5;
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
        });
        scene.addEventListener('exit-vr', function () {
            const links = document.getElementById('legal-links-2d');
            // We need to check if they should be visible (i.e. config loaded)
            // A simple way is to check if they were supposed to be visible.
            // For now, let's just re-fetch or assume if it has content it should show.
            // Simpler: Just remove the inline display:none that we added above, 
            // reverting to the class/ID rule (which might be display:block from the fetch).
            if (links && (links.querySelector('a[href="#"]') === null)) { // simplistic check
                links.style.display = 'block';
            }
        });
    }
});
