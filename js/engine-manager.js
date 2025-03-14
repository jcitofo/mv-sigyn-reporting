import authManager, { showToast } from './auth.js';

export class EngineManager {
    constructor() {
        this.isRunning = false;
        this.totalHours = 0;
        this.sessionStartTime = null;
        this.fuelRate = 100; // L/h
        this.oilRate = 5; // L/h
        this.timerInterval = null;
        this.resources = {
            fuel: { level: 80, capacity: 10000 }, // in liters
            oil: { level: 65, capacity: 1000 } // in liters
        };
        
        this.loadState();
        this.initEventListeners();
        this.updateUI();
    }
    
    loadState() {
        // Load engine state from localStorage if available
        const savedState = localStorage.getItem('engineState');
        if (savedState) {
            try {
                const state = JSON.parse(savedState);
                this.isRunning = state.isRunning || false;
                this.totalHours = state.totalHours || 0;
                this.sessionStartTime = state.isRunning ? Date.now() : null;
                this.fuelRate = state.fuelRate || 100;
                this.oilRate = state.oilRate || 5;
                
                // Load resource levels
                if (state.resources) {
                    this.resources = state.resources;
                }
                
                // If engine was running when browser was closed, calculate hours since then
                if (state.isRunning && state.lastRunTime) {
                    const elapsedHours = (Date.now() - state.lastRunTime) / (1000 * 60 * 60);
                    this.totalHours += elapsedHours;
                    this.consumeResources(elapsedHours);
                }
                
                console.log('Engine state loaded:', {
                    isRunning: this.isRunning,
                    totalHours: this.totalHours,
                    fuelRate: this.fuelRate,
                    oilRate: this.oilRate
                });
            } catch (error) {
                console.error('Error loading engine state:', error);
                showToast('Failed to load engine state', 'error');
            }
        }
    }
    
    saveState() {
        try {
            const state = {
                isRunning: this.isRunning,
                totalHours: this.totalHours,
                lastRunTime: this.isRunning ? Date.now() : null,
                fuelRate: this.fuelRate,
                oilRate: this.oilRate,
                resources: this.resources
            };
            localStorage.setItem('engineState', JSON.stringify(state));
        } catch (error) {
            console.error('Error saving engine state:', error);
        }
    }
    
    initEventListeners() {
        // Engine toggle button
        const engineToggle = document.getElementById('engineToggle');
        if (engineToggle) {
            engineToggle.addEventListener('click', () => this.toggleEngine());
        }
        
        // Update rates button
        const updateRatesBtn = document.getElementById('updateRates');
        if (updateRatesBtn) {
            updateRatesBtn.addEventListener('click', () => this.updateConsumptionRates());
        }
        
        // Set up autosave and auto-update
        setInterval(() => {
            this.saveState();
            if (this.isRunning) {
                this.updateUI();
            }
        }, 5000); // Save every 5 seconds
    }
    
    toggleEngine() {
        if (!this.isRunning) {
            // Before starting, check if commander is verified for captains
            if (authManager.user.role === 'captain' && !authManager.isCommanderVerified) {
                authManager.verifyCommanderAccess(() => {
                    this.startEngine();
                });
                return;
            }
            
            // Check if there's enough fuel to start
            if (this.resources.fuel.level <= 5) {
                showToast('Insufficient fuel to start engine', 'error');
                return;
            }
            
            // Check if there's enough oil to start
            if (this.resources.oil.level <= 5) {
                showToast('Insufficient oil to start engine', 'error');
                return;
            }
            
            this.startEngine();
        } else {
            this.stopEngine();
        }
    }
    
    startEngine() {
        console.log('Starting engine...');
        this.isRunning = true;
        this.sessionStartTime = Date.now();
        
        // Start the timer to update hours
        this.timerInterval = setInterval(() => {
            this.updateEngineHours();
        }, 1000);
        
        // Update UI
        this.updateEngineToggleButton();
        this.updateEngineStatus();
        
        // Display notification
        showToast('Engine started successfully', 'success');
        
        // Save state
        this.saveState();
    }
    
    stopEngine() {
        console.log('Stopping engine...');
        this.isRunning = false;
        
        // Update total hours
        if (this.sessionStartTime) {
            const sessionHours = (Date.now() - this.sessionStartTime) / (1000 * 60 * 60);
            this.totalHours += sessionHours;
            
            // Consume resources for the session
            this.consumeResources(sessionHours);
            
            this.sessionStartTime = null;
        }
        
        // Clear timer
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        // Update UI
        this.updateEngineToggleButton();
        this.updateEngineStatus();
        this.updateEngineHours();
        
        // Display notification
        showToast('Engine stopped', 'info');
        
        // Save state
        this.saveState();
    }
    
    updateEngineHours() {
        // Calculate current total hours
        let currentHours = this.totalHours;
        
        if (this.isRunning && this.sessionStartTime) {
            const sessionHours = (Date.now() - this.sessionStartTime) / (1000 * 60 * 60);
            currentHours += sessionHours;
            
            // Consume resources in real-time
            this.consumeResources(sessionHours / 3600); // Convert to hours then divide by 3600 for per-second rate
        }
        
        // Update UI
        const engineHoursElement = document.getElementById('engineHours');
        if (engineHoursElement) {
            engineHoursElement.textContent = currentHours.toFixed(2);
        }
    }
    
    updateEngineToggleButton() {
        const engineToggle = document.getElementById('engineToggle');
        if (engineToggle) {
            engineToggle.textContent = this.isRunning ? 'Stop Engine' : 'Start Engine';
            engineToggle.classList.toggle('running', this.isRunning);
        }
    }
    
    updateEngineStatus() {
        const engineStatus = document.getElementById('engineRunningStatus');
        if (engineStatus) {
            engineStatus.textContent = this.isRunning ? 'Running' : 'Stopped';
            engineStatus.className = this.isRunning ? 'running' : 'stopped';
        }
    }
    
    updateConsumptionRates() {
        // Check if commander is verified for captains
        if (authManager.user.role === 'captain' && !authManager.isCommanderVerified) {
            authManager.verifyCommanderAccess(() => {
                this.performRateUpdate();
            });
            return;
        }
        
        this.performRateUpdate();
    }
    
    performRateUpdate() {
        // Get new rates from input fields
        const fuelRateInput = document.getElementById('fuelRate');
        const oilRateInput = document.getElementById('oilRate');
        
        if (!fuelRateInput || !oilRateInput) return;
        
        // Validate inputs
        const newFuelRate = parseFloat(fuelRateInput.value);
        const newOilRate = parseFloat(oilRateInput.value);
        
        if (isNaN(newFuelRate) || isNaN(newOilRate)) {
            showToast('Please enter valid consumption rates', 'error');
            return;
        }
        
        if (newFuelRate <= 0 || newOilRate <= 0) {
            showToast('Consumption rates must be greater than zero', 'error');
            return;
        }
        
        // Update rates
        this.fuelRate = newFuelRate;
        this.oilRate = newOilRate;
        
        // Save state
        this.saveState();
        
        // Show confirmation
        showToast('Consumption rates updated successfully', 'success');
        
        // Update resource monitor gauges if available
        if (window.resourceMonitor) {
            window.resourceMonitor.updateGauges();
        }
    }
    
    consumeResources(hours) {
        if (!hours || hours <= 0) return;
        
        // Calculate consumption
        const fuelConsumed = this.fuelRate * hours;
        const oilConsumed = this.oilRate * hours;
        
        // Update resource levels
        this.updateResourceLevel('fuel', -fuelConsumed);
        this.updateResourceLevel('oil', -oilConsumed);
        
        // Check for critical levels
        this.checkResourceLevels();
    }
    
    updateResourceLevel(resource, amount) {
        if (!this.resources[resource]) return;
        
        const resourceData = this.resources[resource];
        const currentAmount = (resourceData.level / 100) * resourceData.capacity;
        const newAmount = Math.max(0, Math.min(resourceData.capacity, currentAmount + amount));
        const newLevel = (newAmount / resourceData.capacity) * 100;
        
        // Update resource level
        this.resources[resource].level = newLevel;
        
        // Stop engine if fuel or oil runs out
        if (resource === 'fuel' && this.resources.fuel.level <= 1 && this.isRunning) {
            showToast('Engine stopped: Fuel depleted', 'error');
            this.stopEngine();
        } else if (resource === 'oil' && this.resources.oil.level <= 1 && this.isRunning) {
            showToast('Engine stopped: Oil depleted', 'error');
            this.stopEngine();
        }
        
        // Update resource monitor if available
        if (window.resourceMonitor) {
            window.resourceMonitor.resources[resource] = {
                ...window.resourceMonitor.resources[resource],
                level: newLevel
            };
            window.resourceMonitor.updateGauges();
        }
    }
    
    checkResourceLevels() {
        // Check fuel level
        if (this.resources.fuel.level <= 10 && this.isRunning) {
            showToast('Warning: Fuel level critical', 'warning');
        }
        
        // Check oil level
        if (this.resources.oil.level <= 10 && this.isRunning) {
            showToast('Warning: Oil level critical', 'warning');
        }
    }
    
    updateUI() {
        this.updateEngineToggleButton();
        this.updateEngineStatus();
        this.updateEngineHours();
    }
}

// Initialize engine manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.engineManager = new EngineManager();
    }
});

export default { EngineManager };
