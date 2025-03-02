const CACHE_NAME = 'mv-sigyn-v5';
const STATIC_CACHE = 'static-v5';
const DYNAMIC_CACHE = 'dynamic-v5';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css?v=2',
    '/js/app.js?v=3',
    '/js/sw-register.js?v=2',
    '/assets/favicon.png',
    'https://cdn.jsdelivr.net/npm/chart.js@2.9.4/dist/Chart.min.js'
];

// Security headers
const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' https://cdn.jsdelivr.net; connect-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

// Install event - cache assets with improved error handling and versioning
self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE).then(cache => {
                console.log('Caching static assets');
                return cache.addAll(ASSETS_TO_CACHE);
            }),
            caches.open(DYNAMIC_CACHE).then(cache => {
                console.log('Preparing dynamic cache');
            })
        ])
        .catch(error => {
            console.error('Cache installation failed:', error);
            throw error;
        })
        .finally(() => {
            self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                // Take control of all clients immediately
                return self.clients.claim();
            })
            .catch(error => {
                console.error('Error in activate handler:', error);
            })
    );
});

// Fetch event with improved caching strategy and security headers
self.addEventListener('fetch', event => {
    // Apply security headers to same-origin responses
    const applySecurityHeaders = (response) => {
        if (response.url.startsWith(self.location.origin)) {
            const newHeaders = new Headers(response.headers);
            Object.entries(securityHeaders).forEach(([key, value]) => {
                newHeaders.set(key, value);
            });
            return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders
            });
        }
        return response;
    };

    // Handle different types of requests
    if (event.request.method !== 'GET') {
        // For non-GET requests, network-only
        event.respondWith(fetch(event.request));
        return;
    }

    // For GET requests, use stale-while-revalidate strategy
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {
                        // Clone the response before using it
                        const responseToCache = networkResponse.clone();

                        // Cache successful responses
                        if (networkResponse.status === 200) {
                            caches.open(DYNAMIC_CACHE)
                                .then(cache => {
                                    cache.put(event.request, responseToCache);
                                })
                                .catch(error => {
                                    console.error('Error caching new resource:', error);
                                });
                        }

                        return applySecurityHeaders(networkResponse);
                    })
                    .catch(error => {
                        console.error('Network fetch failed:', error);
                        // Return cached response if available
                        return cachedResponse || new Response('Offline', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });

                return cachedResponse || fetchPromise;
            })
    );
});

// Handle background sync for offline form submissions
self.addEventListener('sync', event => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(
            // Get all reports from IndexedDB that need to be synced
            // and send them to the server
            syncReports()
        );
    }
});

// Handle push notifications
self.addEventListener('push', event => {
    const options = {
        body: event.data.text(),
        icon: '/assets/favicon.png',
        badge: '/assets/favicon.png',
        vibrate: [100, 50, 100],
        data: {
            dateOfArrival: Date.now(),
            primaryKey: 1
        },
        actions: [
            {
                action: 'explore',
                title: 'View Report'
            },
            {
                action: 'close',
                title: 'Close'
            }
        ]
    };

    event.waitUntil(
        self.registration.showNotification('MV Sigyn Report System', options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'explore') {
        // Open the app and navigate to the specific report
        event.waitUntil(
            clients.openWindow('/')
        );
    }
});

// Utility function to sync reports
async function syncReports() {
    try {
        // Here you would implement the logic to:
        // 1. Get unsent reports from IndexedDB
        // 2. Send them to your server
        // 3. Update their status in IndexedDB
        console.log('Syncing reports...');
    } catch (error) {
        console.error('Error syncing reports:', error);
        throw error;
    }
}
