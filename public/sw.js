const CACHE_NAME = 'skyvr-cache-v65';

self.addEventListener('install', (event) => {
    self.skipWaiting();
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

const pendingRequests = new Map();

self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    const url = event.request.url;

    // 1. Bypass Service Worker for socket.io and dynamic routes
    if (url.includes('/socket.io/') || url.includes('/easyrtc/') || url.includes('/config')) {
        return;
    }

    // 2. Dedup: Check if there's already a pending request for this URL
    if (pendingRequests.has(url)) {
        event.respondWith(
            pendingRequests.get(url).then(response => response.clone())
        );
        return;
    }

    // 2. Create the response promise (Strategy: Cache -> Network)
    const responsePromise = caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
            console.log('Serving from cache:', url);
            return cachedResponse;
        }

        return fetch(event.request).then((networkResponse) => {
            // Check if we received a valid response
            if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                return networkResponse;
            }

            // Get content length
            const contentLength = networkResponse.headers.get('content-length');

            // If content length is available and > 2MB (2 * 1024 * 1024 bytes)
            if (contentLength && parseInt(contentLength) > 2 * 1024 * 1024) {
                console.log(`Caching large file (${(parseInt(contentLength) / (1024 * 1024)).toFixed(2)} MB):`, url);
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
            }

            return networkResponse;
        });
    });

    // 3. Save the promise to the map
    pendingRequests.set(url, responsePromise);

    // 4. Clean up when the promise settles (success or failure)
    responsePromise.finally(() => {
        pendingRequests.delete(url);
    });

    // 5. Respond with a CLONE of the master response, keeping the master valid for other potential subscribers
    event.respondWith(
        responsePromise.then(response => response.clone())
    );
});
