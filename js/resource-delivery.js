import authManager, { showToast } from './auth.js';

export class ResourceDeliveryManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.deliveries = JSON.parse(localStorage.getItem('deliveries') || '[]');
        
        this.initEventListeners();
        this.renderDeliveries();
    }
    
    initEventListeners() {
        // Record delivery button
        const recordDeliveryBtn = document.getElementById('recordDelivery');
        if (recordDeliveryBtn) {
            recordDeliveryBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleDeliveryRecord();
            });
        }
        
        // Resource type change to update unit labels
        const deliveryType = document.getElementById('deliveryType');
        if (deliveryType) {
            deliveryType.addEventListener('change', () => {
                this.updateAmountLabel();
            });
        }
        
        // Initialize amount label
        this.updateAmountLabel();
    }
    
    updateAmountLabel() {
        const deliveryType = document.getElementById('deliveryType');
        if (!deliveryType) return;
        
        const resourceType = deliveryType.value;
        const unitLabel = resourceType === 'food' ? 'kg' : 'L';
        
        // Update placeholder with unit
        const deliveryAmount = document.getElementById('deliveryAmount');
        if (deliveryAmount) {
            deliveryAmount.placeholder = `Enter amount (${unitLabel})`;
        }
    }
    
    async handleDeliveryRecord() {
        // Check if commander is verified for captains
        if (authManager.user.role === 'captain' && !authManager.isCommanderVerified) {
            authManager.verifyCommanderAccess(() => {
                this.recordDelivery();
            });
            return;
        }
        
        this.recordDelivery();
    }
    
    recordDelivery() {
        try {
            // Get values from form
            const deliveryType = document.getElementById('deliveryType').value;
            const deliveryAmount = parseFloat(document.getElementById('deliveryAmount').value);
            const deliveryDoc = document.getElementById('deliveryDoc').value;
            
            // Validate
            if (!deliveryType) {
                showToast('Please select a resource type', 'error');
                return;
            }
            
            if (isNaN(deliveryAmount) || deliveryAmount <= 0) {
                showToast('Please enter a valid amount greater than zero', 'error');
                return;
            }
            
            if (!deliveryDoc.trim()) {
                showToast('Please enter a document reference', 'error');
                return;
            }
            
            // Create delivery record
            const delivery = {
                id: Date.now(),
                type: deliveryType,
                amount: deliveryAmount,
                documentRef: deliveryDoc,
                timestamp: new Date().toISOString(),
                userId: this.user._id,
                userName: this.user.username
            };
            
            // Add to deliveries list
            this.deliveries.unshift(delivery);
            
            // Save to localStorage
            localStorage.setItem('deliveries', JSON.stringify(this.deliveries));
            
            // Update resource level
            this.updateResourceLevel(deliveryType, deliveryAmount);
            
            // Clear form
            document.getElementById('deliveryAmount').value = '';
            document.getElementById('deliveryDoc').value = '';
            
            // Show success message
            showToast(`${this.getResourceName(deliveryType)} delivery recorded successfully`, 'success');
            
            // Update deliveries list
            this.renderDeliveries();
        } catch (error) {
            console.error('Error recording delivery:', error);
            showToast('Failed to record delivery', 'error');
        }
    }
    
    updateResourceLevel(resourceType, amount) {
        // Update resource level in engineManager (for fuel and oil)
        if (window.engineManager && (resourceType === 'fuel' || resourceType === 'oil')) {
            window.engineManager.updateResourceLevel(resourceType, amount);
        }
        
        // Update resource level in resourceMonitor (for all resources)
        if (window.resourceMonitor) {
            const resources = window.resourceMonitor.resources;
            
            if (resources[resourceType]) {
                const capacity = resources[resourceType].capacity || 10000;
                const currentLevel = resources[resourceType].level || 0;
                const currentAmount = (currentLevel / 100) * capacity;
                const newAmount = Math.min(capacity, currentAmount + amount);
                const newLevel = (newAmount / capacity) * 100;
                
                // Update resource monitor
                resources[resourceType].level = newLevel;
                
                // Update gauges
                window.resourceMonitor.updateGauges();
                
                // Update resource level bars in resource management
                this.updateResourceLevelBar(resourceType, newLevel, newAmount);
            }
        }
    }
    
    updateResourceLevelBar(resourceType, level, amount) {
        const levelCard = document.getElementById(`${resourceType}LevelCard`);
        if (!levelCard) return;
        
        const levelBar = levelCard.querySelector('.level-bar-fill');
        const levelValue = levelCard.querySelector('.level-value');
        const quantityValue = levelCard.querySelector('.quantity-value');
        const lastUpdated = levelCard.querySelector('.last-updated');
        
        if (levelBar) levelBar.style.width = `${level}%`;
        if (levelValue) levelValue.textContent = level.toFixed(1);
        if (quantityValue) quantityValue.textContent = amount.toFixed(0);
        if (lastUpdated) lastUpdated.textContent = new Date().toLocaleTimeString();
        
        // Update color based on level
        if (levelBar) {
            levelBar.classList.remove('critical', 'warning');
            if (level <= 20) {
                levelBar.classList.add('critical');
            } else if (level <= 35) {
                levelBar.classList.add('warning');
            }
        }
    }
    
    renderDeliveries() {
        const deliveriesList = document.getElementById('deliveriesList');
        if (!deliveriesList) return;
        
        if (this.deliveries.length === 0) {
            deliveriesList.innerHTML = '<div class="no-deliveries">No recent deliveries</div>';
            return;
        }
        
        // Get the last 5 deliveries
        const recentDeliveries = this.deliveries.slice(0, 5);
        
        deliveriesList.innerHTML = recentDeliveries.map(delivery => `
            <div class="delivery-item">
                <div class="delivery-info">
                    <span class="delivery-type">${this.getResourceName(delivery.type)}</span>
                    <span class="delivery-amount">+${delivery.amount} ${delivery.type === 'food' ? 'kg' : 'L'}</span>
                </div>
                <div class="delivery-meta">
                    <span class="delivery-doc">Ref: ${delivery.documentRef}</span>
                    <span class="delivery-time">${this.formatDate(delivery.timestamp)}</span>
                </div>
            </div>
        `).join('');
    }
    
    getResourceName(type) {
        const names = {
            'fuel': 'Fuel',
            'oil': 'Engine Oil',
            'food': 'Food Supplies',
            'water': 'Fresh Water'
        };
        return names[type] || type;
    }
    
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}

// Initialize delivery manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.resourceDelivery = new ResourceDeliveryManager();
    }
});

export default { ResourceDeliveryManager };
