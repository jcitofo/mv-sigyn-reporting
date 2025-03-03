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
        } catch (error) {
            console.error('Error updating gauges:', error);
            showToast('Failed to update resource data', 'error');
        }
    }

    async setupAlerts() {
        try {
            const response = await fetch('/api/alerts/active', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch alerts');
            const alerts = await response.json();
            this.alertsList.innerHTML = alerts.map(alert => this.displayAlert(alert)).join('');
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
                body: JSON.stringify({ resource, type: severity, level: data.level })
            });

            if (!response.ok) throw new Error('Failed to create alert');
            const alert = await response.json();
            this.activeAlerts.add(`${resource}-${severity}`);
            this.displayAlert(alert);
        } catch (error) {
            console.error('Error triggering alert:', error);
            showToast('Failed to create alert', 'error');
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

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.startPolling();
        };
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
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 5000);
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.resourceMonitor = new ResourceMonitor();
    }
});

export default { ResourceMonitor };
