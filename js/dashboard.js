import authManager, { showToast } from './auth.js';

// Resource monitoring and alerts
export class ResourceMonitor {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        if (!this.token || !this.user) {
            console.error('User not authenticated');
            return;
        }

        this.resources = {};
        this.alertThresholds = this.user.thresholds;
        this.gauges = {};
        this.activeAlerts = new Set();
        this.setupGauges();
        this.setupAlerts();
        this.init();
    }

    async init() {
        try {
            const response = await fetch('/api/resources/status', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch resource data');
            this.resources = await response.json();
            this.setupGauges();
            this.setupAlerts();
            this.setupWebSocket();
        } catch (error) {
            console.error('Failed to initialize resource monitor:', error);
            showToast('Failed to load resource data', 'error');
        }
    }

    setupGauges() {
        const gaugeConfig = {
            fuel: { color: '#0066cc', label: 'Fuel Level' },
            oil: { color: '#006633', label: 'Oil Level' },
            food: { color: '#ff6600', label: 'Food Stock' },
            water: { color: '#0099cc', label: 'Water Level' }
        };

        Object.keys(gaugeConfig).forEach(resource => {
            const canvas = document.getElementById(`${resource}Gauge`);
            if (!canvas) return;
            const level = this.resources[resource]?.level || 80;

            this.gauges[resource] = new Chart(canvas.getContext('2d'), {
                type: 'doughnut',
                data: {
                    datasets: [{
                        data: [level, 100 - level],
                        backgroundColor: [gaugeConfig[resource].color, '#e0e0e0'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutoutPercentage: 70,
                    rotation: Math.PI,
                    circumference: Math.PI,
                    title: { display: true, text: `${gaugeConfig[resource].label}: ${level}%` }
                }
            });
        });
        
        // Update autonomy displays
        this.updateAutonomyDisplays();
    }

    async updateGauges() {
        try {
            Object.keys(this.gauges).forEach(resource => {
                const gauge = this.gauges[resource];
                const resourceData = this.resources[resource];
                if (!resourceData) return;
                const level = resourceData.level;
                gauge.data.datasets[0].data = [level, 100 - level];
                gauge.options.title.text = `${level.toFixed(1)}%`;
                gauge.update();
            });
            
            // Update autonomy displays
            this.updateAutonomyDisplays();
        } catch (error) {
            console.error('Error updating gauges:', error);
            showToast('Failed to update resource data', 'error');
        }
    }
    
    updateAutonomyDisplays() {
        try {
            // Update fuel range in hours (for main engine)
            const fuelRange = document.getElementById('fuelRange');
            if (fuelRange && this.resources.fuel) {
                const fuelData = this.resources.fuel;
                const currentAmount = (fuelData.level / 100) * fuelData.capacity;
                const consumptionRate = fuelData.consumptionRate?.value || 100; // L/h
                const hoursRemaining = consumptionRate > 0 ? currentAmount / consumptionRate : 0;
                fuelRange.textContent = `${hoursRemaining.toFixed(1)} hours`;
            }
            
            // Update fuel level
            const fuelLevel = document.getElementById('fuelLevel');
            if (fuelLevel && this.resources.fuel) {
                fuelLevel.textContent = `${this.resources.fuel.level.toFixed(1)}`;
            }
            
            // Update oil duration in days
            const engineStatus = document.getElementById('engineStatus');
            if (engineStatus && this.resources.oil) {
                const oilData = this.resources.oil;
                const currentAmount = (oilData.level / 100) * oilData.capacity;
                const consumptionRate = oilData.consumptionRate?.value || 10; // L/h
                const hoursRemaining = consumptionRate > 0 ? currentAmount / consumptionRate : 0;
                const daysRemaining = hoursRemaining / 24;
                engineStatus.textContent = `${daysRemaining.toFixed(1)} days`;
            }
            
            // Update oil level
            const oilLevel = document.getElementById('oilLevel');
            if (oilLevel && this.resources.oil) {
                oilLevel.textContent = `${this.resources.oil.level.toFixed(1)}`;
            }
            
            // Update food duration in days
            const foodDuration = document.getElementById('foodDuration');
            if (foodDuration && this.resources.food) {
                const foodData = this.resources.food;
                const currentAmount = (foodData.level / 100) * foodData.capacity;
                const consumptionRate = foodData.consumptionRate?.value || 50; // kg/day
                const daysRemaining = consumptionRate > 0 ? currentAmount / consumptionRate : 0;
                foodDuration.textContent = `${daysRemaining.toFixed(1)} days`;
            }
            
            // Update food level
            const foodLevel = document.getElementById('foodLevel');
            if (foodLevel && this.resources.food) {
                foodLevel.textContent = `${this.resources.food.level.toFixed(1)}`;
            }
            
            // Update water duration in days
            const waterDuration = document.getElementById('waterDuration');
            if (waterDuration && this.resources.water) {
                const waterData = this.resources.water;
                const currentAmount = (waterData.level / 100) * waterData.capacity;
                const consumptionRate = waterData.consumptionRate?.value || 200; // L/day
                const daysRemaining = consumptionRate > 0 ? currentAmount / consumptionRate : 0;
                waterDuration.textContent = `${daysRemaining.toFixed(1)} days`;
            }
            
            // Update water level
            const waterLevel = document.getElementById('waterLevel');
            if (waterLevel && this.resources.water) {
                waterLevel.textContent = `${this.resources.water.level.toFixed(1)}`;
            }
        } catch (error) {
            console.error('Error updating autonomy displays:', error);
        }
    }

    async setupAlerts() {
        try {
            const alertsList = document.getElementById('alertsList');
            if (!alertsList) return;
            
            const response = await fetch('/api/alerts/active', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch alerts');
            const alerts = await response.json();
            
            if (alerts.length === 0) {
                alertsList.innerHTML = '<div class="no-alerts">No active alerts</div>';
                return;
            }
            
            alertsList.innerHTML = alerts.map(alert => this.displayAlert(alert)).join('');
        } catch (error) {
            console.error('Error setting up alerts:', error);
            showToast('Failed to load alerts', 'error');
        }
    }

    async triggerAlert(resource, severity, data) {
        if (this.activeAlerts.has(`${resource}-${severity}`)) return;

        try {
            const response = await fetch('/api/alerts', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    resource, 
                    type: severity, 
                    level: data.level,
                    message: `${resource} level is ${severity} at ${data.level}%`,
                    metadata: {
                        consumptionRate: data.consumptionRate,
                        estimatedDepletion: data.estimatedDepletion
                    }
                })
            });

            if (!response.ok) throw new Error('Failed to create alert');
            const alert = await response.json();
            this.activeAlerts.add(`${resource}-${severity}`);
            
            // Add alert to the alerts list
            const alertsList = document.getElementById('alertsList');
            if (alertsList) {
                const noAlertsMsg = alertsList.querySelector('.no-alerts');
                if (noAlertsMsg) {
                    alertsList.innerHTML = '';
                }
                
                const alertElement = document.createElement('div');
                alertElement.innerHTML = this.displayAlert(alert);
                alertsList.appendChild(alertElement.firstChild);
            }
            
            // Play sound if enabled
            if (this.user.alertPreferences.sound) {
                this.playAlertSound(severity);
            }
            
            // Send notifications
            this.sendAlertNotifications(alert.id, severity);
        } catch (error) {
            console.error('Error triggering alert:', error);
            showToast('Failed to create alert', 'error');
        }
    }
    
    displayAlert(alert) {
        return `
            <div class="alert-item ${alert.type}" data-id="${alert._id}">
                <span class="alert-icon">${alert.type === 'critical' ? '⚠️' : '⚠'}</span>
                <div class="alert-content">
                    <div class="alert-title">${alert.resource.toUpperCase()} ${alert.type} Alert</div>
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-timestamp">${new Date(alert.timestamp).toLocaleString()}</div>
                </div>
                <button class="alert-acknowledge" data-id="${alert._id}">Acknowledge</button>
            </div>
        `;
    }
    
    playAlertSound(severity) {
        try {
            const alertSound = new Audio('/assets/alert.mp3');
            alertSound.volume = severity === 'critical' ? 1.0 : 0.7;
            alertSound.play();
        } catch (error) {
            console.error('Error playing alert sound:', error);
        }
    }
    
    async sendAlertNotifications(alertId, severity) {
        try {
            const notificationTypes = {
                email: this.user.alertPreferences.email,
                sms: this.user.alertPreferences.sms,
                sound: this.user.alertPreferences.sound
            };
            
            await fetch(`/api/alerts/${alertId}/notify`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(notificationTypes)
            });
        } catch (error) {
            console.error('Error sending alert notifications:', error);
        }
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onopen = () => console.log('WebSocket connection established');
        ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'resource_update') {
                    this.resources = data.resources;
                    await this.updateGauges();
                    
                    // Check thresholds and trigger alerts if needed
                    this.checkResourceThresholds();
                } else if (data.type === 'alert') {
                    const alertsList = document.getElementById('alertsList');
                    if (alertsList) {
                        const noAlertsMsg = alertsList.querySelector('.no-alerts');
                        if (noAlertsMsg) {
                            alertsList.innerHTML = '';
                        }
                        
                        const alertElement = document.createElement('div');
                        alertElement.innerHTML = this.displayAlert(data.alert);
                        alertsList.appendChild(alertElement.firstChild);
                    }
                }
            } catch (error) {
                console.error('WebSocket message error:', error);
            }
        };

        ws.onclose = () => {
            console.log('WebSocket connection closed, falling back to polling');
            this.startPolling();
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.startPolling();
        };
    }
    
    checkResourceThresholds() {
        Object.keys(this.resources).forEach(resourceType => {
            const resource = this.resources[resourceType];
            const thresholds = this.user.thresholds[resourceType];
            
            if (!resource || !thresholds) return;
            
            const level = resource.level;
            
            // Calculate estimated depletion time
            const currentAmount = (level / 100) * resource.capacity;
            const consumptionRate = resource.consumptionRate?.value || 0;
            const hoursRemaining = consumptionRate > 0 ? currentAmount / consumptionRate : 0;
            const estimatedDepletion = new Date();
            estimatedDepletion.setHours(estimatedDepletion.getHours() + hoursRemaining);
            
            // Check critical threshold
            if (level <= thresholds.critical) {
                this.triggerAlert(resourceType, 'critical', {
                    level,
                    consumptionRate: resource.consumptionRate,
                    estimatedDepletion
                });
            }
            // Check warning threshold
            else if (level <= thresholds.warning) {
                this.triggerAlert(resourceType, 'warning', {
                    level,
                    consumptionRate: resource.consumptionRate,
                    estimatedDepletion
                });
            }
        });
    }

    startPolling() {
        setInterval(async () => {
            try {
                const response = await fetch('/api/resources/status', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });

                if (!response.ok) throw new Error('Failed to fetch resource data');
                this.resources = await response.json();
                await this.updateGauges();
                
                // Check thresholds and trigger alerts if needed
                this.checkResourceThresholds();
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 5000);
    }
    
    updateThresholds(newThresholds) {
        this.user.thresholds = newThresholds;
        this.checkResourceThresholds();
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.resourceMonitor = new ResourceMonitor();
    }
});

export default { ResourceMonitor };
