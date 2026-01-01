const CACHE_NAME = 'skyvr-cache-v26';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/lobby.html',
    '/css/style.css',
    '/js/astronomy.browser.min.js',
    '/js/luxon.min.js',
    '/js/custom-fogless-text.js',
    '/components/skyvr-player-info-component.js',
    '/components/skyvr-drawing-component.js',
    '/components/aframe-environment-component.js',
    '/components/aframe-extras.primitives.min.js',
    '/components/spawn-in-spots.component.js',
    '/components/skyvr-high-res-component.js',
    '/components/skyvr-starfield-component.js',
    '/components/skyvr-cylinder-component.js',
    '/components/skyvr-rounded-component.js',
    '/components/skyvr-glow-effect-component.js',
    '/components/skyvr-control-panel-component.js',
    '/components/skyvr-switch-component.js',
    '/components/skyvr-rig-follower-component.js',
    '/components/skyvr-infobar-component.js',
    '/assets/icons/door.svg',
    '/assets/icons/mic-on.svg',
    '/assets/icons/mic-off.svg',
    '/assets/icons/draw.svg',
    '/assets/icons/stamp.svg',
    '/assets/icons/sticky.svg',
    '/assets/icons/constellation.svg',

    '/assets/arrow.svg',
    '/assets/cosmic_background.png',
    '/assets/gaia.png',
    '/assets/halo.png',
    '/assets/ldem_3_8bit.jpg',
    '/assets/lroc_color_poles_1k.jpg',
    '/assets/star.png',
    'https://aframe.io/releases/1.7.1/aframe.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.8.1/socket.io.min.js',
    'https://unpkg.com/networked-aframe@^0.14.0/dist/networked-aframe.min.js',
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap',
    '/data/hyglike_from_athyg_v31.csv',
    '/data/ConstellationLines.csv'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Opened cache');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            self.clients.claim()
        ])
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Check if it's one of our precached assets (matches by URL or pathname)
    const isPrecached = ASSETS_TO_CACHE.some(asset => {
        if (asset.startsWith('http')) {
            return event.request.url === asset;
        }
        return url.pathname === asset;
    });

    // Strategy: Network First for HTML, Cache First for assets/data
    if (url.pathname.endsWith('.html') || url.pathname === '/') {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                })
                .catch(() => caches.match(event.request, { ignoreSearch: true }))
        );
        return;
    }

    // Strategy: Cache First for assets, data, and precached scripts
    if (isPrecached || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/data/')) {
        event.respondWith(
            caches.match(event.request).then((response) => {
                if (response) {
                    return response;
                }

                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200) {
                        return networkResponse;
                    }

                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });

                    return networkResponse;
                });
            })
        );
    }
});
