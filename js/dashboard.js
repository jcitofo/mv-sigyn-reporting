// Resource monitoring and alerts
class ResourceMonitor {
    constructor() {
        // Get auth token and user preferences
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        
        if (!this.token || !this.user) {
            console.error('User not authenticated');
            return;
        }

        this.resources = {};
        this.alertThresholds = this.user.thresholds;
        
        this.gauges = {};
        this.setupGauges();
        this.setupAlerts();
        this.startMonitoring();
    }

    async init() {
        try {
            // Fetch initial resource data
            const response = await fetch('/api/resources/status', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch resource data');
            
            this.resources = await response.json();
            
            // Setup UI components
            this.setupGauges();
            this.setupAlerts();
            this.startMonitoring();

            // Setup WebSocket connection if available
            this.setupWebSocket();
        } catch (error) {
            console.error('Failed to initialize resource monitor:', error);
            this.showToast('Failed to load resource data', 'error');
        }
    }

    setupGauges() {
        // Configure gauge charts with maritime theme
        const gaugeConfig = {
            fuel: { color: '#0066cc', label: 'Fuel Level' },
            oil: { color: '#006633', label: 'Oil Level' },
            food: { color: '#ff6600', label: 'Food Stock' },
            water: { color: '#0099cc', label: 'Water Level' }
        };

        // Initialize gauges
        Object.keys(gaugeConfig).forEach(resource => {
            const canvas = document.getElementById(`${resource}Gauge`);
            if (!canvas) return;

            const resourceData = this.resources[resource];
            if (!resourceData) return;

            this.gauges[resource] = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [resourceData.level, 100 - resourceData.level],
                        backgroundColor: [gaugeConfig[resource].color, '#e0e0e0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    cutoutPercentage: 70,
                    rotation: Math.PI,
                    circumference: Math.PI,
                    legend: { display: false },
                    tooltips: {
                        enabled: true,
                        callbacks: {
                            label: (tooltipItem, data) => {
                                const value = data.datasets[0].data[0];
                                return `${value.toFixed(1)}%`;
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: `${gaugeConfig[resource].label}: ${resourceData.level}%`,
                        position: 'bottom'
                    }
                }
            });
        });
    }

    async updateGauges() {
        try {
            Object.keys(this.gauges).forEach(resource => {
                const gauge = this.gauges[resource];
                const resourceData = this.resources[resource];
                if (!resourceData) return;

                const level = resourceData.level;

                // Update gauge data
                gauge.data.datasets[0].data = [level, 100 - level];
                gauge.options.title.text = `${level.toFixed(1)}%`;
                gauge.update();

                // Update display values
                const levelElement = document.getElementById(`${resource}Level`);
                if (levelElement) {
                    levelElement.textContent = level.toFixed(1);
                    levelElement.className = this.getLevelClass(level);
                }
                
                // Update additional resource-specific information
                this.updateResourceDetails(resource, resourceData);
            });
        } catch (error) {
            console.error('Error updating gauges:', error);
            this.showToast('Failed to update resource data', 'error');
        }
    }

    updateResourceDetails(resource, data) {
        switch(resource) {
            case 'fuel':
                const range = Math.floor(data.level * data.capacity / 100);
                document.getElementById('fuelRange').textContent = range;
                break;
            case 'oil':
                document.getElementById('engineStatus').textContent = 
                    data.level > 50 ? 'Good' : data.level > 25 ? 'Fair' : 'Critical';
                break;
            case 'food':
                const foodDays = Math.floor(data.level * data.capacity / (100 * data.consumptionRate.value));
                document.getElementById('foodDuration').textContent = foodDays;
                break;
            case 'water':
                const waterDays = Math.floor(data.level * data.capacity / (100 * data.consumptionRate.value));
                document.getElementById('waterDuration').textContent = waterDays;
                break;
        }
    }

    getLevelClass(level) {
        const thresholds = this.user.thresholds[resource] || {
            critical: 20,
            warning: 35
        };
        
        if (level <= thresholds.critical) return 'level-indicator level-critical';
        if (level <= thresholds.warning) return 'level-indicator level-warning';
        return 'level-indicator level-good';
    }

    async setupAlerts() {
        this.alertsList = document.getElementById('alertsList');
        this.activeAlerts = new Set();

        try {
            // Fetch active alerts
            const response = await fetch('/api/alerts/active', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to fetch alerts');
            
            const alerts = await response.json();
            
            // Clear existing alerts
            this.alertsList.innerHTML = '';
            
            // Display active alerts
            alerts.forEach(alert => this.displayAlert(alert));
        } catch (error) {
            console.error('Error setting up alerts:', error);
            this.showToast('Failed to load alerts', 'error');
        }
    }

    async checkAlerts() {
        try {
            Object.entries(this.resources).forEach(async ([resource, data]) => {
                const thresholds = this.user.thresholds[resource];
                if (!thresholds) return;

                if (data.level <= thresholds.critical) {
                    await this.triggerAlert(resource, 'critical', data);
                } else if (data.level <= thresholds.warning) {
                    await this.triggerAlert(resource, 'warning', data);
                }
            });
        } catch (error) {
            console.error('Error checking alerts:', error);
        }
    }

    async triggerAlert(resource, severity, data) {
        const alertId = `${resource}-${severity}`;
        if (this.activeAlerts.has(alertId)) return;

        try {
            // Create alert in database
            const response = await fetch('/api/alerts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    resource,
                    type: severity,
                    level: data.level,
                    message: this.getAlertMessage(resource, severity, data),
                    metadata: {
                        consumptionRate: data.consumptionRate,
                        estimatedDepletion: new Date(Date.now() + (data.level / data.consumptionRate.value) * 3600000)
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to create alert');

            const alert = await response.json();
            this.activeAlerts.add(alertId);
            this.displayAlert(alert);

            // Send notifications based on user preferences
            if (severity === 'critical') {
                await this.sendAlertNotifications(alert);
            }
        } catch (error) {
            console.error('Error triggering alert:', error);
            this.showToast('Failed to create alert', 'error');
        }
    }

    displayAlert(alert) {
        const alertElement = document.createElement('div');
        alertElement.className = `alert-item ${alert.type}`;
        alertElement.innerHTML = `
            <span class="alert-icon">${alert.type === 'critical' ? '⚠️' : '⚠'}</span>
            <div class="alert-content">
                <strong>${this.getResourceName(alert.resource)} Alert:</strong>
                <p>${alert.message}</p>
                <span class="alert-timestamp">${new Date(alert.timestamp).toLocaleTimeString()}</span>
            </div>
            ${!alert.acknowledged.status ? `
                <button class="acknowledge-btn" data-alert-id="${alert._id}">
                    Acknowledge
                </button>
            ` : ''}
        `;

        // Add to alerts list
        if (this.alertsList.innerHTML === 'No active alerts') {
            this.alertsList.innerHTML = '';
        }
        this.alertsList.insertBefore(alertElement, this.alertsList.firstChild);

        // Setup acknowledge button listener
        const ackBtn = alertElement.querySelector('.acknowledge-btn');
        if (ackBtn) {
            ackBtn.addEventListener('click', () => this.acknowledgeAlert(alert._id));
        }
    }

    async acknowledgeAlert(alertId) {
        try {
            const response = await fetch(`/api/alerts/${alertId}/acknowledge`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) throw new Error('Failed to acknowledge alert');

            // Refresh alerts list
            await this.setupAlerts();
            this.showToast('Alert acknowledged', 'success');
        } catch (error) {
            console.error('Error acknowledging alert:', error);
            this.showToast('Failed to acknowledge alert', 'error');
        }
    }

    async playAlertSound() {
        if (!this.user.alertPreferences.sound) return;

        try {
            const audio = new Audio('/assets/alert.mp3');
            await audio.play();
        } catch (error) {
            console.error('Error playing alert sound:', error);
        }
    }

    getResourceName(resource) {
        const names = {
            fuel: 'Fuel',
            oil: 'Engine Oil',
            food: 'Food Supply',
            water: 'Fresh Water'
        };
        return names[resource] || resource.charAt(0).toUpperCase() + resource.slice(1);
    }

    getAlertMessage(resource, severity, data) {
        const level = data.level.toFixed(1);
        const timeToDepletion = Math.ceil(level / data.consumptionRate.value);
        
        const messages = {
            critical: {
                fuel: `Fuel level critically low at ${level}%. Estimated ${timeToDepletion} hours remaining. Immediate refueling required.`,
                oil: `Engine oil level critically low at ${level}%. Maintenance required within ${timeToDepletion} hours.`,
                food: `Food supplies critically low at ${level}%. Only ${timeToDepletion} days of supplies remaining.`,
                water: `Fresh water level critically low at ${level}%. Only ${timeToDepletion} days of water remaining.`
            },
            warning: {
                fuel: `Fuel level low at ${level}%. Plan refueling within ${timeToDepletion} hours.`,
                oil: `Engine oil level low at ${level}%. Schedule maintenance within ${timeToDepletion} hours.`,
                food: `Food supplies low at ${level}%. Plan resupply within ${timeToDepletion} days.`,
                water: `Fresh water level low at ${level}%. Plan refill within ${timeToDepletion} days.`
            }
        };
        return messages[severity][resource];
    }

    async showNotification(alert) {
        if (!('Notification' in window)) return;
        
        try {
            if (Notification.permission === 'granted') {
                new Notification(`${this.getResourceName(alert.resource)} Alert`, {
                    body: alert.message,
                    icon: '/assets/favicon.png',
                    tag: `${alert.resource}-${alert.type}`,
                    requireInteraction: alert.type === 'critical'
                });
            } else if (Notification.permission !== 'denied') {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    this.showNotification(alert);
                }
            }
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }

    async sendAlertNotifications(alert) {
        try {
            const response = await fetch(`/api/alerts/${alert._id}/notify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: this.user.alertPreferences.email,
                    sms: this.user.alertPreferences.sms,
                    sound: this.user.alertPreferences.sound
                })
            });

            if (!response.ok) throw new Error('Failed to send notifications');

            if (this.user.alertPreferences.sound) {
                await this.playAlertSound();
            }
        } catch (error) {
            console.error('Error sending notifications:', error);
            this.showToast('Failed to send notifications', 'error');
        }
    }

    showToast(message, type) {
        const toastContainer = document.querySelector('.toast-container') || (() => {
            const container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
            return container;
        })();

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" aria-label="Close">&times;</button>
        `;

        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => toast.remove());

        toastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'resource_update') {
                    this.resources = data.resources;
                    await this.updateGauges();
                    await this.checkAlerts();
                } else if (data.type === 'alert') {
                    this.displayAlert(data.alert);
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed, falling back to polling');
            this.startPolling();
        };
    }

    startPolling() {
        // Poll for updates every 5 seconds if WebSocket is not available
        setInterval(async () => {
            try {
                const response = await fetch('/api/resources/status', {
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });

                if (!response.ok) throw new Error('Failed to fetch resource data');
                
                this.resources = await response.json();
                await this.updateGauges();
                await this.checkAlerts();
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 5000);
    }

    updateThresholds(newThresholds) {
        this.alertThresholds = newThresholds;
        this.checkAlerts();
    }
}

// Weather monitoring with maritime focus
class WeatherMonitor {
    constructor() {
        this.weatherContainer = document.getElementById('weatherData');
        this.updateWeather();
        setInterval(() => this.updateWeather(), 300000); // Update every 5 minutes
    }

    async updateWeather() {
        try {
            // Get ship's current position (simulated for demo)
            const shipPosition = {
                lat: -18.8792, // Antananarivo coordinates
                lon: 47.5079
            };
            
            const response = await fetch(`/api/weather?lat=${shipPosition.lat}&lon=${shipPosition.lon}`);
            if (!response.ok) throw new Error('Weather data fetch failed');
            
            const data = await response.json();
            this.displayWeather(data);
        } catch (error) {
            console.error('Error fetching weather data:', error);
            this.weatherContainer.innerHTML = `
                <div class="weather-error">
                    <p>⚠️ Weather data temporarily unavailable</p>
                    <small>Will retry in 5 minutes</small>
                </div>
            `;
        }
    }

    getWindDirection(degrees) {
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    getBeaufortScale(windSpeed) {
        const beaufortScale = [
            { force: 0, description: 'Calm' },
            { force: 1, description: 'Light air' },
            { force: 2, description: 'Light breeze' },
            { force: 3, description: 'Gentle breeze' },
            { force: 4, description: 'Moderate breeze' },
            { force: 5, description: 'Fresh breeze' },
            { force: 6, description: 'Strong breeze' },
            { force: 7, description: 'Near gale' },
            { force: 8, description: 'Gale' },
            { force: 9, description: 'Strong gale' },
            { force: 10, description: 'Storm' },
            { force: 11, description: 'Violent storm' },
            { force: 12, description: 'Hurricane' }
        ];

        const force = Math.floor(Math.pow(windSpeed / 0.836, 2/3));
        return beaufortScale[Math.min(force, 12)];
    }

    displayWeather(data) {
        const windDirection = this.getWindDirection(data.wind.deg);
        const beaufort = this.getBeaufortScale(data.wind.speed);
        
        this.weatherContainer.innerHTML = `
            <div class="weather-current">
                <div class="weather-main">
                    <img src="https://openweathermap.org/img/w/${data.weather[0].icon}.png" 
                         alt="${data.weather[0].description}"
                         class="weather-icon">
                    <span class="temperature">${Math.round(data.main.temp)}°C</span>
                </div>
                <div class="weather-details">
                    <p>Conditions: ${data.weather[0].description}</p>
                    <p>Wind: ${data.wind.speed} m/s ${windDirection} (${beaufort.description})</p>
                    <p>Wave Height: ${this.estimateWaveHeight(data.wind.speed)} m</p>
                    <p>Visibility: ${(data.visibility / 1000).toFixed(1)} km</p>
                    <p>Pressure: ${data.main.pressure} hPa</p>
                    <p>Humidity: ${data.main.humidity}%</p>
                </div>
                <div class="weather-update">
                    Last updated: ${new Date().toLocaleTimeString()}
                </div>
            </div>
        `;
    }

    estimateWaveHeight(windSpeed) {
        // Simple wave height estimation based on wind speed
        // This is a rough approximation and should be replaced with actual wave height data
        return (windSpeed * 0.2).toFixed(1);
    }
}

// Engine Management
class EngineManager {
    constructor() {
        this.engineToggle = document.getElementById('engineToggle');
        this.engineStatus = document.getElementById('engineRunningStatus');
        this.engineHours = document.getElementById('engineHours');
        this.fuelRate = document.getElementById('fuelRate');
        this.oilRate = document.getElementById('oilRate');
        this.updateRatesBtn = document.getElementById('updateRates');
        this.deliveryForm = {
            type: document.getElementById('deliveryType'),
            amount: document.getElementById('deliveryAmount'),
            doc: document.getElementById('deliveryDoc'),
            submit: document.getElementById('recordDelivery')
        };
        this.deliveriesList = document.getElementById('deliveriesList');

        this.setupEventListeners();
        this.startPolling();
    }

    setupEventListeners() {
        // Engine toggle
        this.engineToggle.addEventListener('click', () => this.toggleEngine());

        // Update consumption rates
        this.updateRatesBtn.addEventListener('click', () => this.updateConsumptionRates());

        // Record delivery
        this.deliveryForm.submit.addEventListener('click', () => this.recordDelivery());
    }

    async toggleEngine() {
        try {
            const response = await fetch('/api/engine/toggle', { method: 'POST' });
            const data = await response.json();
            
            this.engineToggle.textContent = data.status ? 'Stop Engine' : 'Start Engine';
            this.engineToggle.classList.toggle('running', data.status);
            this.engineStatus.textContent = data.status ? 'Running' : 'Stopped';
        } catch (error) {
            console.error('Error toggling engine:', error);
            showToast('Failed to toggle engine status', 'error');
        }
    }

    async updateConsumptionRates() {
        try {
            const response = await fetch('/api/engine/consumption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fuelRate: parseFloat(this.fuelRate.value),
                    oilRate: parseFloat(this.oilRate.value)
                })
            });
            
            if (!response.ok) throw new Error('Failed to update consumption rates');
            
            showToast('Consumption rates updated successfully', 'success');
        } catch (error) {
            console.error('Error updating consumption rates:', error);
            showToast('Failed to update consumption rates', 'error');
        }
    }

    async recordDelivery() {
        try {
            const amount = parseFloat(this.deliveryForm.amount.value);
            if (!amount || amount <= 0) {
                showToast('Please enter a valid amount', 'error');
                return;
            }

            const response = await fetch('/api/engine/delivery', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: this.deliveryForm.type.value,
                    amount: amount,
                    document: this.deliveryForm.doc.value
                })
            });

            if (!response.ok) throw new Error('Failed to record delivery');

            const data = await response.json();
            showToast('Delivery recorded successfully', 'success');
            
            // Clear form
            this.deliveryForm.amount.value = '';
            this.deliveryForm.doc.value = '';
            
            // Update deliveries list
            this.updateDeliveriesList();
        } catch (error) {
            console.error('Error recording delivery:', error);
            showToast('Failed to record delivery', 'error');
        }
    }

    async updateDeliveriesList() {
        try {
            const response = await fetch('/api/engine/status');
            const data = await response.json();
            
            if (data.deliveries.length === 0) {
                this.deliveriesList.innerHTML = 'No recent deliveries';
                return;
            }

            this.deliveriesList.innerHTML = data.deliveries
                .slice(-5) // Show last 5 deliveries
                .reverse()
                .map(delivery => `
                    <div class="delivery-item ${delivery.type}">
                        <div class="delivery-content">
                            <strong>${delivery.type.toUpperCase()}</strong>: ${delivery.amount}L
                            ${delivery.document ? `<br>Doc: ${delivery.document}` : ''}
                        </div>
                        <div class="delivery-meta">
                            ${new Date(delivery.timestamp).toLocaleString()}
                        </div>
                    </div>
                `).join('');
        } catch (error) {
            console.error('Error updating deliveries list:', error);
        }
    }

    startPolling() {
        // Poll engine status every 5 seconds
        setInterval(async () => {
            try {
                const response = await fetch('/api/engine/status');
                const data = await response.json();
                
                // Update engine hours
                this.engineHours.textContent = data.engineHours.toFixed(1);
                
                // Update status
                this.engineStatus.textContent = data.runningStatus ? 'Running' : 'Stopped';
                this.engineToggle.textContent = data.runningStatus ? 'Stop Engine' : 'Start Engine';
                this.engineToggle.classList.toggle('running', data.runningStatus);
                
                // Update fuel and oil levels
                document.getElementById('fuelLevel').textContent = 
                    ((data.fuelTank.current / data.fuelTank.capacity) * 100).toFixed(1);
                document.getElementById('oilLevel').textContent = 
                    ((data.oilTank.current / data.oilTank.capacity) * 100).toFixed(1);
            } catch (error) {
                console.error('Error polling engine status:', error);
            }
        }, 5000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const resourceMonitor = new ResourceMonitor();
    const weatherMonitor = new WeatherMonitor();
    const engineManager = new EngineManager();
});
