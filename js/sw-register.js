// Service Worker Registration with enhanced error handling and offline support
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // Check if we need to update the service worker
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                if (registration.active) {
                    const currentVersion = registration.active.scriptURL.includes('v5');
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

            // Setup periodic sync if supported
            if ('periodicSync' in registration) {
                try {
                    await registration.periodicSync.register('sync-reports', {
                        minInterval: 24 * 60 * 60 * 1000 // 24 hours
                    });
                    console.log('Periodic sync registered');
                } catch (error) {
                    console.log('Periodic sync could not be registered:', error);
                }
            }

            // Setup push notifications if supported
            if ('pushManager' in registration) {
                try {
                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(
                            'YOUR_PUBLIC_VAPID_KEY_HERE' // Replace with actual VAPID key
                        )
                    });
                    console.log('Push notification subscription:', subscription);
                } catch (error) {
                    console.log('Push subscription failed:', error);
                }
            }

        } catch (error) {
            console.error('ServiceWorker registration failed:', error);
            // Show offline notification to user
            showOfflineNotification();
        }
    });

    // Listen for offline/online events
    window.addEventListener('online', () => {
        document.body.classList.remove('offline');
        // Trigger sync when coming back online
        navigator.serviceWorker.ready.then(registration => {
            registration.sync.register('sync-reports');
        });
    });

    window.addEventListener('offline', () => {
        document.body.classList.add('offline');
    });
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
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
}

// Show offline notification
function showOfflineNotification() {
    const notification = document.createElement('div');
    notification.className = 'offline-notification';
    notification.textContent = 'You are currently offline. Some features may be limited.';
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 5000);
}
