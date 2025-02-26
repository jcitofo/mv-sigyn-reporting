// Register service worker
if ('serviceWorker' in navigator) {
    // First, try to unregister any existing service workers
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    }).then(function() {
        // After unregistering, register the new service worker
        navigator.serviceWorker
            .register('/service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(error => {
                console.error('ServiceWorker registration failed:', error);
            });
    });
}
