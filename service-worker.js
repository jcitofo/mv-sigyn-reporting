const CACHE_NAME = 'mv-sigyn-v7';
const STATIC_CACHE = 'static-v7';
const DYNAMIC_CACHE = 'dynamic-v7';
const OFFLINE_CACHE = 'offline-v7';

const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/css/styles.css?v=3',
    '/js/app.js?v=5',
    '/js/auth.js?v=2',
    '/js/dashboard.js?v=3',
    '/js/sw-register.js?v=4',
    '/assets/favicon.png',
    '/assets/alert.mp3',
    'https://cdn.jsdelivr.net/npm/chart.js@2.9.4/dist/Chart.min.js'
];

// Offline fallback page
const OFFLINE_PAGE = '/offline.html';

// Security headers with updated CSP for auth endpoints and modules
const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; connect-src 'self' https://api.openweathermap.org; img-src 'self' https://openweathermap.org; worker-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)'
};

// API endpoints that should not be cached
const API_ENDPOINTS = [
    '/api/auth/',
    '/api/resources/',
    '/api/alerts/',
    '/api/engine/',
    '/api/weather'
];

// Create offline page
const createOfflinePage = () => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Offline - MV Sigyn</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            background-color: #f0f7ff;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
            text-align: center;
        }
        .offline-message {
            background: white;
            padding: 2rem;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 90%;
        }
        h1 { color: #003366; }
        .retry-button {
            background: #0066cc;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 20px;
        }
        .retry-button:hover {
            background: #003366;
        }
    </style>
</head>
<body>
    <div class="offline-message">
        <h1>You're Offline</h1>
        <p>The MV Sigyn dashboard requires an internet connection to monitor vessel resources.</p>
        <p>Please check your connection and try again.</p>
        <button class="retry-button" onclick="window.location.reload()">Retry Connection</button>
    </div>
</body>
</html>
`;

// Install event - cache assets and create offline page
self.addEventListener('install', event => {
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then(cache => {
                console.log('Caching static assets');
                return cache.addAll(ASSETS_TO_CACHE);
            }),
            // Create and cache offline page
            caches.open(OFFLINE_CACHE).then(cache => {
                console.log('Creating offline page');
                return cache.put(OFFLINE_PAGE, new Response(
                    createOfflinePage(),
                    {
                        headers: {
                            'Content-Type': 'text/html',
                            ...securityHeaders
                        }
                    }
                ));
            }),
            // Prepare dynamic cache
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

// Fetch event with improved caching strategy, API handling, and offline support
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

    // Check if request is for an API endpoint
    const isApiRequest = API_ENDPOINTS.some(endpoint => 
        event.request.url.includes(endpoint)
    );

    // Handle API requests
    if (isApiRequest) {
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.error('API request failed:', error);
                    return new Response(
                        JSON.stringify({ error: 'Network error', offline: true }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // Handle non-GET requests
    if (event.request.method !== 'GET') {
        event.respondWith(
            fetch(event.request)
                .catch(error => {
                    console.error('Non-GET request failed:', error);
                    return new Response(
                        JSON.stringify({ error: 'Network error', offline: true }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
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
                        // Return cached response or offline page
                        return cachedResponse || caches.match(OFFLINE_PAGE);
                    });

                return cachedResponse || fetchPromise;
            })
    );
});

// Handle background sync for offline data
self.addEventListener('sync', event => {
    if (event.tag === 'sync-reports') {
        event.waitUntil(syncReports());
    } else if (event.tag === 'sync-alerts') {
        event.waitUntil(syncAlerts());
    } else if (event.tag === 'sync-resources') {
        event.waitUntil(syncResources());
    }
});

// Handle push notifications with improved options
self.addEventListener('push', event => {
    const data = event.data.json();
    
    const options = {
        body: data.message,
        icon: '/assets/favicon.png',
        badge: '/assets/favicon.png',
        vibrate: [100, 50, 100],
        data: {
            timestamp: Date.now(),
            type: data.type,
            resourceId: data.resourceId
        },
        actions: [
            {
                action: 'view',
                title: 'View Details'
            },
            {
                action: 'acknowledge',
                title: 'Acknowledge'
            }
        ],
        tag: data.type === 'critical' ? 'critical-alert' : 'alert',
        renotify: data.type === 'critical'
    };

    event.waitUntil(
        self.registration.showNotification(
            `MV Sigyn ${data.type.toUpperCase()} Alert`,
            options
        )
    );
});

// Handle notification clicks with improved navigation
self.addEventListener('notificationclick', event => {
    event.notification.close();

    if (event.action === 'view') {
        // Open the app and navigate to the specific resource
        event.waitUntil(
            clients.openWindow(`/#resource=${event.notification.data.resourceId}`)
        );
    } else if (event.action === 'acknowledge') {
        // Acknowledge the alert
        event.waitUntil(
            fetch(`/api/alerts/${event.notification.data.resourceId}/acknowledge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
        );
    }
});

// Utility functions for background sync
async function syncReports() {
    const db = await openDB();
    const unsentReports = await db.getAll('reports', 'unsent');
    
    for (const report of unsentReports) {
        try {
            const response = await fetch('/api/reports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(report)
            });

            if (response.ok) {
                await db.delete('reports', report.id);
            }
        } catch (error) {
            console.error('Error syncing report:', error);
        }
    }
}

async function syncAlerts() {
    const db = await openDB();
    const unsentAlerts = await db.getAll('alerts', 'unsent');
    
    for (const alert of unsentAlerts) {
        try {
            const response = await fetch('/api/alerts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(alert)
            });

            if (response.ok) {
                await db.delete('alerts', alert.id);
            }
        } catch (error) {
            console.error('Error syncing alert:', error);
        }
    }
}

async function syncResources() {
    const db = await openDB();
    const unsentUpdates = await db.getAll('resources', 'unsent');
    
    for (const update of unsentUpdates) {
        try {
            const response = await fetch(`/api/resources/${update.type}/level`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(update)
            });

            if (response.ok) {
                await db.delete('resources', update.id);
            }
        } catch (error) {
            console.error('Error syncing resource update:', error);
        }
    }
}

// IndexedDB helper
async function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('mv-sigyn-offline', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            // Create stores with indexes
            if (!db.objectStoreNames.contains('reports')) {
                const reportsStore = db.createObjectStore('reports', { keyPath: 'id' });
                reportsStore.createIndex('status', 'status');
            }
            
            if (!db.objectStoreNames.contains('alerts')) {
                const alertsStore = db.createObjectStore('alerts', { keyPath: 'id' });
                alertsStore.createIndex('status', 'status');
            }
            
            if (!db.objectStoreNames.contains('resources')) {
                const resourcesStore = db.createObjectStore('resources', { keyPath: 'id' });
                resourcesStore.createIndex('status', 'status');
            }
        };
    });
}
