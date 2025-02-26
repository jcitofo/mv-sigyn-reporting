const CACHE_NAME = 'mv-sigyn-v4'; // Incrementing version to force update
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css?v=2',
    '/js/app.js?v=3',
    '/js/sw-register.js?v=2',
    '/assets/favicon.png',
    'https://cdn.jsdelivr.net/npm/chart.js@2.9.4/dist/Chart.min.js'
];

// Install event - cache assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .catch(error => {
                console.error('Error in install handler:', error);
            })
    );
    // Force the waiting service worker to become the active service worker
    self.skipWaiting();
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

// Fetch event - network first, falling back to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Clone the response because it's a one-time use stream
                const responseToCache = response.clone();

                // Cache the updated version
                if (response.status === 200) {
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        })
                        .catch(error => {
                            console.error('Error caching new resource:', error);
                        });
                }

                return response;
            })
            .catch(() => {
                // If network fails, try to get it from the cache
                return caches.match(event.request);
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
