/* global i18next, i18nextBrowserLanguageDetector */

async function initI18n() {
    const enRes = await fetch('/locales/en.json').then(r => r.json());
    const deRes = await fetch('/locales/de.json').then(r => r.json());

    await i18next
        .use(i18nextBrowserLanguageDetector)
        .init({
            fallbackLng: 'en',
            debug: false,
            resources: {
                en: { translation: enRes },
                de: { translation: deRes }
            }
        });

    updateContent();
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: i18next.language }));
}

function updateContent() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = i18next.t(key);

        if (el.tagName === 'INPUT' && el.getAttribute('placeholder')) {
            el.setAttribute('placeholder', translation);
        } else if (el.hasAttribute('title')) {
            el.setAttribute('title', translation);
        } else {
            el.innerHTML = translation;
        }
    });

    // Handle attributes like data-i18n-title, data-i18n-placeholder
    const attrElements = document.querySelectorAll('[data-i18n-title], [data-i18n-placeholder], [data-i18n-value]');
    attrElements.forEach(el => {
        if (el.hasAttribute('data-i18n-title')) {
            el.setAttribute('title', i18next.t(el.getAttribute('data-i18n-title')));
        }
        if (el.hasAttribute('data-i18n-placeholder')) {
            el.setAttribute('placeholder', i18next.t(el.getAttribute('data-i18n-placeholder')));
        }
        if (el.hasAttribute('data-i18n-value')) {
            const translation = i18next.t(el.getAttribute('data-i18n-value'));
            if (el.tagName.startsWith('A-')) {
                // 1. Check for specific common multi-property components
                if (el.hasAttribute('custom-fogless-text')) {
                    el.setAttribute('custom-fogless-text', 'value', translation);
                }
                if (el.hasAttribute('troika-text')) {
                    el.setAttribute('troika-text', 'value', translation);
                }
                
                // 2. Handle the 'text' component specifically
                if (el.hasAttribute('text')) {
                    const textData = el.getAttribute('text');
                    if (typeof textData === 'string') {
                        if (textData.includes('value:')) {
                            el.setAttribute('text', textData.replace(/value:\s*[^;]+/, `value: ${translation}`));
                        } else {
                            el.setAttribute('text', textData + `; value: ${translation}`);
                        }
                    } else {
                        el.setAttribute('text', 'value', translation);
                    }
                }
                
                // 3. Always set the 'value' attribute for primitives like a-text or single-prop components
                el.setAttribute('value', translation);
            } else {
                el.setAttribute('value', translation);
            }
        }
    });
}

// Language switch helper
window.changeLanguage = function (lng) {
    i18next.changeLanguage(lng, () => {
        updateContent();
        document.documentElement.lang = lng;
        localStorage.setItem('i18nextLng', lng);
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: lng }));
    });
};

// Initial load
document.addEventListener('DOMContentLoaded', initI18n);
