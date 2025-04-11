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
            // Fetch resource data
            const resourceResponse = await fetch('/api/resources/status', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            if (!resourceResponse.ok) throw new Error('Failed to fetch resource data');
            this.resources = await resourceResponse.json();
            
            // Fetch weather data
            this.fetchWeatherData();
            
            // Fetch vessel location
            this.fetchVesselLocation();
            
            // Setup UI components
            this.setupGauges();
            this.setupAlerts();
            this.setupWebSocket();
            this.setupEventListeners();
        } catch (error) {
            console.error('Failed to initialize resource monitor:', error);
            showToast('Failed to load resource data', 'error');
        }
    }
    
    async fetchWeatherData() {
        try {
            const weatherResponse = await fetch('/api/weather', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!weatherResponse.ok) throw new Error('Failed to fetch weather data');
            const weatherData = await weatherResponse.json();
            
            this.updateWeatherDisplay(weatherData);
        } catch (error) {
            console.error('Failed to fetch weather data:', error);
            document.getElementById('weatherData').innerHTML = 'Weather data unavailable';
        }
    }
    
    updateWeatherDisplay(data) {
        const weatherContainer = document.getElementById('weatherData');
        if (!weatherContainer) return;
        
        const iconUrl = data.weather && data.weather[0] ? 
            `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png` : '';
        
        weatherContainer.innerHTML = `
            <div class="weather-main">
                ${iconUrl ? `<img src="${iconUrl}" alt="Weather icon" class="weather-icon">` : ''}
                <div>
                    <div class="weather-temp">${Math.round(data.main?.temp || 0)}°C</div>
                    <div class="weather-description">${data.weather?.[0]?.description || 'Unknown'}</div>
                </div>
            </div>
            <div class="weather-details">
                <div class="weather-detail-item">
                    <span class="weather-detail-label">Humidity</span>
                    <span class="weather-detail-value">${data.main?.humidity || 0}%</span>
                </div>
                <div class="weather-detail-item">
                    <span class="weather-detail-label">Wind</span>
                    <span class="weather-detail-value">${data.wind?.speed || 0} m/s</span>
                </div>
                <div class="weather-detail-item">
                    <span class="weather-detail-label">Pressure</span>
                    <span class="weather-detail-value">${data.main?.pressure || 0} hPa</span>
                </div>
                <div class="weather-detail-item">
                    <span class="weather-detail-label">Visibility</span>
                    <span class="weather-detail-value">${(data.visibility || 0) / 1000} km</span>
                </div>
            </div>
        `;
    }
    
    async fetchVesselLocation() {
        try {
            const locationResponse = await fetch('/api/location', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!locationResponse.ok) throw new Error('Failed to fetch vessel location');
            const locationData = await locationResponse.json();
            
            this.updateLocationDisplay(locationData);
        } catch (error) {
            console.error('Failed to fetch vessel location:', error);
            const locationName = document.getElementById('locationName');
            const locationCoords = document.getElementById('locationCoords');
            
            if (locationName) locationName.textContent = 'Unknown';
            if (locationCoords) locationCoords.textContent = 'Unknown';
        }
    }
    
    updateLocationDisplay(data) {
        const locationName = document.getElementById('locationName');
        const locationCoords = document.getElementById('locationCoords');
        
        if (locationName) {
            locationName.textContent = data.name ? `${data.name}, ${data.country}` : 'Unknown';
        }
        
        if (locationCoords) {
            locationCoords.textContent = data.lat && data.lon ? 
                `${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}` : 'Unknown';
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
            // Default to 80% if resource data is not available
            const level = this.resources[resource]?.level || 80;

            // Make sure Chart.js is available
            if (typeof Chart === 'undefined') {
                console.error('Chart.js is not loaded');
                return;
            }

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
                    cutout: '70%', // Updated from cutoutPercentage for Chart.js v3+
                    rotation: Math.PI,
                    circumference: Math.PI,
                    plugins: {
                        title: {
                            display: true,
                            text: `${gaugeConfig[resource].label}: ${level}%`
                        }
                    }
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
                if (!gauge || !resourceData) return;
                
                const level = resourceData.level;
                gauge.data.datasets[0].data = [level, 100 - level];
                
                // Update title text with the new level
                if (gauge.options.plugins && gauge.options.plugins.title) {
                    gauge.options.plugins.title.text = `${level.toFixed(1)}%`;
                }
                
                gauge.update();
                
                // Also update the level display in the HTML
                // Add detailed logging for gauge/level updates
                console.log(`Updating ${resource} Gauge/Level:`, { resourceData, level: level.toFixed(1) });
                const levelElement = document.getElementById(`${resource}Level`);
                if (levelElement) {
                    levelElement.textContent = level.toFixed(1);
                } else {
                     console.warn(`Element with ID ${resource}Level not found.`);
                }
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
                const consumptionRate = fuelData.consumptionRate?.value; // L/h - Don't default here, check below
                const hoursRemaining = (consumptionRate && consumptionRate > 0) ? currentAmount / consumptionRate : 0;
                // Add detailed logging
                console.log("Updating Fuel Display:", { fuelData, consumptionRate, currentAmount, hoursRemaining: hoursRemaining.toFixed(1) });
                // Display fuel autonomy in hours as per requirements
                // Only update if hoursRemaining is a valid number
                 if (!isNaN(hoursRemaining) && isFinite(hoursRemaining)) {
                    fuelRange.textContent = `${hoursRemaining.toFixed(1)} hours`;
                } else {
                    fuelRange.textContent = '-- hours'; // Default if calculation fails
                    console.warn("Fuel hoursRemaining calculation resulted in NaN or Infinity");
                }
            } else {
                 console.warn(`Element with ID fuelRange or fuel resource data not found.`);
            }
            
            // Update fuel level
            const fuelLevel = document.getElementById('fuelLevel');
            if (fuelLevel && this.resources.fuel) {
                fuelLevel.textContent = `${this.resources.fuel.level.toFixed(1)}`;
            } else {
                 console.warn(`Element with ID fuelLevel or fuel resource data not found.`);
            }
            
            // Update oil duration in days
            const engineStatus = document.getElementById('engineStatus');
            if (engineStatus && this.resources.oil) {
                const oilData = this.resources.oil;
                const currentAmount = (oilData.level / 100) * oilData.capacity;
                const consumptionRate = oilData.consumptionRate?.value; // L/h - Don't default here, check below
                const hoursRemaining = (consumptionRate && consumptionRate > 0) ? currentAmount / consumptionRate : 0;
                const daysRemaining = hoursRemaining / 24;
                // Add detailed logging
                console.log("Updating Oil/Engine Display:", { oilData, consumptionRate, currentAmount, hoursRemaining, daysRemaining: daysRemaining.toFixed(1) });
                // Convert to days as per requirements
                 if (!isNaN(daysRemaining) && isFinite(daysRemaining)) {
                    engineStatus.textContent = `${daysRemaining.toFixed(1)} days`;
                } else {
                    engineStatus.textContent = '-- days'; // Default if calculation fails
                    console.warn("Oil daysRemaining calculation resulted in NaN or Infinity");
                }
            } else {
                 console.warn(`Element with ID engineStatus or oil resource data not found.`);
            }
            
            // Update oil level
            const oilLevel = document.getElementById('oilLevel');
            if (oilLevel && this.resources.oil) {
                oilLevel.textContent = `${this.resources.oil.level.toFixed(1)}`;
            } else {
                 console.warn(`Element with ID oilLevel or oil resource data not found.`);
            }
            
            // Update food duration in days
            const foodDuration = document.getElementById('foodDuration');
            if (foodDuration && this.resources.food) {
                const foodData = this.resources.food;
                const currentAmount = (foodData.level / 100) * foodData.capacity;
                const consumptionRate = foodData.consumptionRate?.value; // kg/day - Don't default here, check below
                const daysRemaining = (consumptionRate && consumptionRate > 0) ? currentAmount / consumptionRate : 0;
                 // Add detailed logging
                console.log("Updating Food Display:", { foodData, consumptionRate, currentAmount, daysRemaining: daysRemaining.toFixed(1) });
               // Display food autonomy in days as per requirements
                 if (!isNaN(daysRemaining) && isFinite(daysRemaining)) {
                    foodDuration.textContent = `${daysRemaining.toFixed(1)} days`;
                } else {
                    foodDuration.textContent = '-- days'; // Default if calculation fails
                    console.warn("Food daysRemaining calculation resulted in NaN or Infinity");
                }
            } else {
                 console.warn(`Element with ID foodDuration or food resource data not found.`);
            }
            
            // Update food level
            const foodLevel = document.getElementById('foodLevel');
            if (foodLevel && this.resources.food) {
                foodLevel.textContent = `${this.resources.food.level.toFixed(1)}`;
            } else {
                 console.warn(`Element with ID foodLevel or food resource data not found.`);
            }
            
            // Update water duration in days
            const waterDuration = document.getElementById('waterDuration');
            if (waterDuration && this.resources.water) {
                const waterData = this.resources.water;
                const currentAmount = (waterData.level / 100) * waterData.capacity;
                const consumptionRate = waterData.consumptionRate?.value; // L/day - Don't default here, check below
                const daysRemaining = (consumptionRate && consumptionRate > 0) ? currentAmount / consumptionRate : 0;
                // Add detailed logging
                console.log("Updating Water Display:", { waterData, consumptionRate, currentAmount, daysRemaining: daysRemaining.toFixed(1) });
                // Display water autonomy in days as per requirements
                 if (!isNaN(daysRemaining) && isFinite(daysRemaining)) {
                    waterDuration.textContent = `${daysRemaining.toFixed(1)} days`;
                } else {
                    waterDuration.textContent = '-- days'; // Default if calculation fails
                    console.warn("Water daysRemaining calculation resulted in NaN or Infinity");
                }
            } else {
                 console.warn(`Element with ID waterDuration or water resource data not found.`);
            }
            
            // Update water level
            const waterLevel = document.getElementById('waterLevel');
            if (waterLevel && this.resources.water) {
                waterLevel.textContent = `${this.resources.water.level.toFixed(1)}`;
            } else {
                 console.warn(`Element with ID waterLevel or water resource data not found.`);
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
            
            // Ensure we have a valid alert object with an ID
            if (!alert || !alert._id) {
                console.error('Invalid alert object returned from API:', alert);
                throw new Error('Invalid alert data received');
            }
            
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
            
            // Send notifications with the alert ID
            this.sendAlertNotifications(alert._id, severity);
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
            // Skip notification if alertId is undefined
            if (!alertId) {
                console.log('Skipping notifications - no alert ID provided');
                return;
            }
            
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
    
    setupEventListeners() {
        // Update location button
        const updateLocationBtn = document.getElementById('updateLocation');
        if (updateLocationBtn) {
            updateLocationBtn.addEventListener('click', () => this.showLocationUpdateModal());
        }
        
        // Commander verification button
        const verifyCommanderBtn = document.getElementById('verifyCommanderAccess');
        const commanderAccessBtn = document.getElementById('commander-access');
        
        if (verifyCommanderBtn) {
            verifyCommanderBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Verify Commander Access button clicked');
                authManager.verifyCommanderAccess(() => {
                    console.log('Commander access verified callback');
                    this.updateCommanderUI(true);
                });
            });
        }

        if (commanderAccessBtn) {
            this.isVerificationInProgress = false;
            
            commanderAccessBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                
                if (this.isVerificationInProgress) return;
                this.isVerificationInProgress = true;
                
                try {
                    // Get access code from input field
                    const accessCodeInput = document.getElementById('commander-access-code');
                    if (!accessCodeInput || !accessCodeInput.value.trim()) {
                        showToast('Please enter your access code', 'error');
                        this.isVerificationInProgress = false;
                        return;
                    }
                    
                    const accessCode = accessCodeInput.value.trim();
                    console.log('Access code entered:', accessCode);
                    console.log('Expected access code:', authManager.user.accessCode);
                    
                    // Use the new verifyAccessCode method from authManager
                    console.log('Calling verifyAccessCode with:', accessCode);
                    const isVerified = authManager.verifyAccessCode(accessCode);
                    console.log('Verification result:', isVerified);
                    
                    if (isVerified) {
                        // Clear input field
                        accessCodeInput.value = '';
                    }
                    
                    // Reset verification state
                    this.isVerificationInProgress = false;
                } catch (error) {
                    console.error('Commander access error:', error);
                    showToast('Failed to verify commander access', 'error');
                    
                    // Reset verification state
                    this.isVerificationInProgress = false;
                }
            });
        }
        
        // Configure alerts button
        const configureAlertsBtn = document.getElementById('configureAlerts');
        if (configureAlertsBtn) {
            configureAlertsBtn.addEventListener('click', () => this.showAlertConfigModal());
        }
        
        // Manage thresholds button
        const manageThresholdsBtn = document.getElementById('manageThresholds');
        if (manageThresholdsBtn) {
            manageThresholdsBtn.addEventListener('click', () => this.showThresholdsModal());
        }
        
        // Manage recipients button
        const manageRecipientsBtn = document.getElementById('manageRecipients');
        if (manageRecipientsBtn) {
            manageRecipientsBtn.addEventListener('click', () => {
                // Show recipients modal
                showToast('Email recipients management is coming soon', 'info');
            });
        }
    }
    
    // Helper method to show resource management section
    showResourceManagementSection() {
        // Get sections
        const dashboardSection = document.getElementById('dashboard');
        const resourceManagementSection = document.getElementById('resource-management');
        
        // Show sections with animation
        if (resourceManagementSection) {
            resourceManagementSection.style.display = 'block';
            setTimeout(() => {
                resourceManagementSection.classList.add('active');
                resourceManagementSection.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }, 300);
        }
    }
    
    updateCommanderUI(isVerified) {
        // Update commander status indicator
        const commanderStatus = document.getElementById('commanderStatus');
        if (commanderStatus) {
            commanderStatus.textContent = isVerified ? 'Verified' : 'Not Verified';
            if (isVerified) {
                commanderStatus.classList.add('verified');
            } else {
                commanderStatus.classList.remove('verified');
            }
        }
        
        // Enable/disable commander access button
        const commanderAccessBtn = document.getElementById('commander-access');
        if (commanderAccessBtn) {
            commanderAccessBtn.disabled = !isVerified;
        }
        
        // Update commander badge
        const commanderBadge = document.getElementById('commanderAccessStatus');
        if (commanderBadge) {
            commanderBadge.textContent = isVerified ? 'Commander Access Verified' : 'Commander Access Required';
            if (isVerified) {
                commanderBadge.classList.add('verified');
            } else {
                commanderBadge.classList.remove('verified');
            }
        }
        
        // Enable/disable commander tools
        const commanderTools = [
            document.getElementById('configureAlerts'),
            document.getElementById('manageThresholds'),
            document.getElementById('manageRecipients')
        ];
        
        commanderTools.forEach(tool => {
            if (tool) {
                tool.disabled = !isVerified;
            }
        });
    }
    
    showCommanderVerificationModal(onSuccess) {
        const modal = document.createElement('div');
        modal.className = 'modal commander-verification-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Commander Access Verification</h2>
                <form id="commanderVerificationForm">
                    <div class="form-group">
                        <label for="verificationCode">Verification Code:</label>
                        <input type="text" id="verificationCode" required>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="primary">Verify</button>
                        <button type="button" class="secondary" id="cancelVerification">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event listeners
        const form = document.getElementById('commanderVerificationForm');
        const cancelBtn = document.getElementById('cancelVerification');
        const closeBtn = modal.querySelector('.close-modal');
        
        form.addEventListener('submit', (e) => this.handleCommanderVerification(e, modal, onSuccess));
        cancelBtn.addEventListener('click', () => modal.remove());
        closeBtn.addEventListener('click', () => modal.remove());
    }

    async handleCommanderVerification(event, modal, onSuccess) {
        event.preventDefault();
        
        const code = document.getElementById('verificationCode').value;
        
        try {
            // Show loading state
            const submitBtn = event.target.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.innerHTML = 'Verifying...';
            
            // Call verification API
            const response = await fetch('/api/verify-commander', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });
            
            if (!response.ok) throw new Error('Verification failed');
            
            const data = await response.json();
            if (data.success) {
                authManager.isCommanderVerified = true;
                this.updateCommanderUI(true);
                modal.remove();
                onSuccess();
            } else {
                throw new Error(data.message || 'Verification failed');
            }
        } catch (error) {
            console.error('Verification error:', error);
            showToast(error.message || 'Verification failed', 'error');
            
            // Reset submit button
            const submitBtn = event.target.querySelector('button[type="submit"]');
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Verify';
        }
    }

    transitionToResourceManagement() {
        // Remove loading spinner
        const commanderAccessBtn = document.getElementById('commander-access');
        if (commanderAccessBtn) {
            commanderAccessBtn.disabled = false;
            const spinner = commanderAccessBtn.querySelector('.loading-spinner');
            if (spinner) spinner.remove();
        }
        
        // Smooth transition to Resource Management
        const resourceManagementSection = document.getElementById('resource-management');
        if (resourceManagementSection) {
            resourceManagementSection.scrollIntoView({ behavior: 'smooth' });
            resourceManagementSection.classList.add('active');
        }
    }

    showLocationUpdateModal() {
        // Check if commander is verified
        if (this.user.role === 'captain' && !authManager.isCommanderVerified) {
            authManager.verifyCommanderAccess(() => {
                this.createLocationUpdateModal();
            });
        } else {
            this.createLocationUpdateModal();
        }
    }
    
    createLocationUpdateModal() {
        const modal = document.createElement('div');
        modal.className = 'modal location-update-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Update Vessel Location</h2>
                <form id="locationUpdateForm">
                    <div class="form-group">
                        <label for="locationLat">Latitude:</label>
                        <input type="number" id="locationLat" step="0.0001" min="-90" max="90" required>
                    </div>
                    <div class="form-group">
                        <label for="locationLon">Longitude:</label>
                        <input type="number" id="locationLon" step="0.0001" min="-180" max="180" required>
                    </div>
                    <div class="form-group">
                        <label for="locationName">Location Name (optional):</label>
                        <input type="text" id="locationName">
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="primary">Update Location</button>
                        <button type="button" class="secondary" id="cancelLocation">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event listeners
        const form = document.getElementById('locationUpdateForm');
        const cancelBtn = document.getElementById('cancelLocation');
        const closeBtn = modal.querySelector('.close-modal');
        
        form.addEventListener('submit', (e) => this.handleLocationUpdate(e, modal));
        cancelBtn.addEventListener('click', () => modal.remove());
        closeBtn.addEventListener('click', () => modal.remove());
    }
    
    async handleLocationUpdate(event, modal) {
        event.preventDefault();
        
        const lat = parseFloat(document.getElementById('locationLat').value);
        const lon = parseFloat(document.getElementById('locationLon').value);
        const name = document.getElementById('locationName').value;
        
        try {
            const response = await fetch('/api/location', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ lat, lon, name })
            });
            
            if (!response.ok) throw new Error('Failed to update location');
            
            const data = await response.json();
            this.updateLocationDisplay(data.location);
            
            // Update weather if available
            if (data.weather) {
                this.updateWeatherDisplay(data.weather);
            } else {
                // Fetch new weather data
                this.fetchWeatherData();
            }
            
            showToast('Vessel location updated successfully', 'success');
            modal.remove();
        } catch (error) {
            console.error('Error updating location:', error);
            showToast('Failed to update location', 'error');
        }
    }
    
    showAlertConfigModal() {
        // Check if commander is verified for captains
        if (this.user.role === 'captain' && !authManager.isCommanderVerified) {
            authManager.verifyCommanderAccess(() => {
                this.createAlertConfigModal();
            });
            return;
        }
        
        this.createAlertConfigModal();
    }
    
    createAlertConfigModal() {
        const modal = document.createElement('div');
        modal.className = 'modal alert-config-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Configure Alert Settings</h2>
                <form id="alertConfigForm">
                    <h3>Alert Notifications</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="emailAlerts" 
                                ${this.user.alertPreferences.email ? 'checked' : ''}>
                            Email Notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="smsAlerts" 
                                ${this.user.alertPreferences.sms ? 'checked' : ''}>
                            SMS Notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="soundAlerts" 
                                ${this.user.alertPreferences.sound ? 'checked' : ''}>
                            Sound Alerts
                        </label>
                    </div>
                    <div class="modal-actions">
                        <button type="submit" class="primary">Save Settings</button>
                        <button type="button" class="secondary" id="cancelAlertConfig">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event listeners
        const form = document.getElementById('alertConfigForm');
        const cancelBtn = document.getElementById('cancelAlertConfig');
        const closeBtn = modal.querySelector('.close-modal');
        
        form.addEventListener('submit', (e) => this.handleAlertConfigUpdate(e, modal));
        cancelBtn.addEventListener('click', () => modal.remove());
        closeBtn.addEventListener('click', () => modal.remove());
    }
    
    async handleAlertConfigUpdate(event, modal) {
        event.preventDefault();
        
        const form = event.target;
        const alertPreferences = {
            email: form.emailAlerts.checked,
            sms: form.smsAlerts.checked,
            sound: form.soundAlerts.checked
        };
        
        try {
            // Update user preferences
            this.user.alertPreferences = alertPreferences;
            localStorage.setItem('user', JSON.stringify(this.user));
            
            showToast('Alert settings updated successfully', 'success');
            modal.remove();
        } catch (error) {
            console.error('Error updating alert settings:', error);
            showToast('Failed to update alert settings', 'error');
        }
    }
    
    showThresholdsModal() {
        // Check if commander is verified for captains
        if (this.user.role === 'captain' && !authManager.isCommanderVerified) {
            authManager.verifyCommanderAccess(() => {
                this.createThresholdsModal();
            });
            return;
        }
        
        this.createThresholdsModal();
    }
    
    createThresholdsModal() {
        const modal = document.createElement('div');
        modal.className = 'modal thresholds-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h2>Manage Resource Thresholds</h2>
                <form id="thresholdsForm">
                    ${Object.entries(this.user.thresholds).map(([resource, levels]) => `
                        <div class="threshold-group">
                            <h4>${resource.charAt(0).toUpperCase() + resource.slice(1)}</h4>
                            <div class="form-group">
                                <label>Warning Level (%):
                                    <input type="number" name="${resource}_warning" 
                                        value="${levels.warning}" min="0" max="100">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>Critical Level (%):
                                    <input type="number" name="${resource}_critical" 
                                        value="${levels.critical}" min="0" max="100">
                                </label>
                            </div>
                        </div>
                    `).join('')}
                    <div class="modal-actions">
                        <button type="submit" class="primary">Save Thresholds</button>
                        <button type="button" class="secondary" id="cancelThresholds">Cancel</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event listeners
        const form = document.getElementById('thresholdsForm');
        const cancelBtn = document.getElementById('cancelThresholds');
        const closeBtn = modal.querySelector('.close-modal');
        
        form.addEventListener('submit', (e) => this.handleThresholdsUpdate(e, modal));
        cancelBtn.addEventListener('click', () => modal.remove());
        closeBtn.addEventListener('click', () => modal.remove());
    }
    
    async handleThresholdsUpdate(event, modal) {
        event.preventDefault();
        
        const form = event.target;
        const thresholds = {};
        
        ['fuel', 'oil', 'food', 'water'].forEach(resource => {
            thresholds[resource] = {
                warning: parseInt(form[`${resource}_warning`].value),
                critical: parseInt(form[`${resource}_critical`].value)
            };
        });
        
        try {
            // Update user thresholds
            this.user.thresholds = thresholds;
            localStorage.setItem('user', JSON.stringify(this.user));
            
            // Update thresholds in resource monitor
            this.updateThresholds(thresholds);
            
            showToast('Resource thresholds updated successfully', 'success');
            modal.remove();
        } catch (error) {
            console.error('Error updating thresholds:', error);
            showToast('Failed to update thresholds', 'error');
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.resourceMonitor = new ResourceMonitor();
        
        // Check if commander is verified
        if (authManager.isCommanderVerified) {
            window.resourceMonitor.updateCommanderUI(true);
        }
    }
});

export default { ResourceMonitor };
