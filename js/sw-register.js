import { showToast } from './auth.js';

// Configuration
const SW_VERSION = 'v7';
// Create window.ENV if it doesn't exist
window.ENV = window.ENV || {};
// Set VAPID_PUBLIC_KEY with a fallback
window.ENV.VAPID_PUBLIC_KEY = window.ENV.VAPID_PUBLIC_KEY || 'mock-public-key';
const VAPID_PUBLIC_KEY = window.ENV.VAPID_PUBLIC_KEY;

// Service Worker Registration with enhanced error handling and offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // Check if we need to update the service worker
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                if (registration.active) {
                    const currentVersion = registration.active.scriptURL.includes(SW_VERSION);
                    if (!currentVersion) {
                        await registration.unregister();
                        console.log('Outdated ServiceWorker unregistered');
                    }
                }
            }

            // Register the new service worker
            const registration = await navigator.serviceWorker.register('/service-worker.js', {
                scope: '/'
            });
            
            console.log('ServiceWorker registration successful with scope:', registration.scope);

            // Setup periodic sync for different data types
            if ('periodicSync' in registration) {
                const syncOptions = {
                    reports: { minInterval: 24 * 60 * 60 * 1000 }, // 24 hours
                    alerts: { minInterval: 15 * 60 * 1000 },       // 15 minutes
                    resources: { minInterval: 5 * 60 * 1000 }      // 5 minutes
                };

                for (const [type, options] of Object.entries(syncOptions)) {
                    try {
                        await registration.periodicSync.register(`sync-${type}`, options);
                        console.log(`Periodic sync registered for ${type}`);
                    } catch (error) {
                        console.log(`Periodic sync could not be registered for ${type}:`, error);
                    }
                }
            }

            // Setup push notifications if supported
            if ('pushManager' in registration) {
                try {
                    // Check if we already have permission
                    if (Notification.permission === 'granted') {
                        const subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                        });

                        // Send subscription to server
                        await fetch('/api/notifications/subscribe', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${localStorage.getItem('token')}`
                            },
                            body: JSON.stringify(subscription)
                        });

                        console.log('Push notification subscription successful');
                    } else if (Notification.permission !== 'denied') {
                        const permission = await Notification.requestPermission();
                        if (permission === 'granted') {
                            // Retry subscription after permission granted
                            window.location.reload();
                        }
                    }
                } catch (error) {
                    console.log('Push subscription failed:', error);
                }
            }

        } catch (error) {
            console.error('ServiceWorker registration failed:', error);
            showOfflineNotification('Service Worker registration failed. Some features may be limited.');
        }
    });

    // Listen for offline/online events
    window.addEventListener('online', async () => {
        document.body.classList.remove('offline');
        try {
            const registration = await navigator.serviceWorker.ready;
            // Sync all data types
            await Promise.all([
                registration.sync.register('sync-reports'),
                registration.sync.register('sync-alerts'),
                registration.sync.register('sync-resources')
            ]);
            showToast('Connection restored. Syncing data...', 'success');
        } catch (error) {
            console.error('Error syncing data:', error);
        }
    });

    window.addEventListener('offline', () => {
        document.body.classList.add('offline');
        showOfflineNotification('You are offline. Changes will be saved and synced when connection is restored.');
    });
}

// Helper functions
function urlBase64ToUint8Array(base64String) {
    try {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/\-/g, '+')
            .replace(/_/g, '/');

        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);

        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    } catch (error) {
        console.error('Error converting VAPID key:', error);
        throw error;
    }
}

function showOfflineNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.innerHTML = `
        <div class="offline-content">
            <span class="offline-icon">📡</span>
            <span class="offline-message">${message}</span>
            <button class="offline-close" aria-label="Close notification">&times;</button>
        </div>
    `;

    // Add close button functionality
    const closeButton = notification.querySelector('.offline-close');
    closeButton.addEventListener('click', () => notification.remove());

    document.body.appendChild(notification);

    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (document.body.contains(notification)) {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }
    }, 10000);
}
