export class AuthManager {
    constructor() {
        // Auto-login with demo captain account
        const demoUser = {
            _id: 'demo_captain',
            username: 'captain',
            role: 'captain',
            email: 'captain@mvsigyn.com',
            alertPreferences: {
                email: true,
                sms: true,
                sound: true
            },
            thresholds: {
                fuel: { warning: 35, critical: 20 },
                oil: { warning: 35, critical: 20 },
                food: { warning: 35, critical: 20 },
                water: { warning: 35, critical: 20 }
            }
        };
        
        this.token = 'demo_token';
        this.user = demoUser;
        localStorage.setItem('token', this.token);
        localStorage.setItem('user', JSON.stringify(this.user));
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupAuthUI());
        } else {
            this.setupAuthUI();
        }
    }

    setupAuthUI() {
        // Add auth container to header
        const header = document.querySelector('header');
        const authContainer = document.createElement('div');
        authContainer.className = 'auth-container';
        authContainer.innerHTML = this.getLoggedInUI();
        header.appendChild(authContainer);

        // Setup preferences button
        const prefsBtn = document.getElementById('preferencesBtn');
        if (prefsBtn) {
            prefsBtn.addEventListener('click', () => this.showPreferencesModal());
        }
    }

    getLoggedInUI() {
        return `
            <div class="user-info">
                <span class="username">${this.user.username}</span>
                <span class="role">${this.user.role}</span>
                <button id="preferencesBtn" class="preferences-btn">Preferences</button>
            </div>
        `;
    }

    showPreferencesModal() {
        const modal = document.createElement('div');
        modal.className = 'modal preferences-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>User Preferences</h2>
                <form id="preferencesForm">
                    <h3>Alert Preferences</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="email" 
                                ${this.user.alertPreferences.email ? 'checked' : ''}>
                            Email Notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="sms" 
                                ${this.user.alertPreferences.sms ? 'checked' : ''}>
                            SMS Notifications
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="sound" 
                                ${this.user.alertPreferences.sound ? 'checked' : ''}>
                            Sound Alerts
                        </label>
                    </div>

                    <h3>Resource Thresholds</h3>
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
                        <button type="submit" class="primary">Save Changes</button>
                        <button type="button" class="secondary" id="cancelPrefs">Cancel</button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners
        const form = document.getElementById('preferencesForm');
        const cancelBtn = document.getElementById('cancelPrefs');

        form.addEventListener('submit', (e) => this.handlePreferencesUpdate(e));
        cancelBtn.addEventListener('click', () => modal.remove());
    }

    async handlePreferencesUpdate(event) {
        event.preventDefault();
        const form = event.target;

        try {
            const alertPreferences = {
                email: form.email.checked,
                sms: form.sms.checked,
                sound: form.sound.checked
            };

            const thresholds = {};
            ['fuel', 'oil', 'food', 'water'].forEach(resource => {
                thresholds[resource] = {
                    warning: parseInt(form[`${resource}_warning`].value),
                    critical: parseInt(form[`${resource}_critical`].value)
                };
            });

            // Update local user data
            this.user = {
                ...this.user,
                alertPreferences,
                thresholds
            };
            localStorage.setItem('user', JSON.stringify(this.user));

            showToast('Your preferences have been saved successfully', 'success');
            document.querySelector('.preferences-modal').remove();

            // Trigger resource monitor update if it exists
            if (window.resourceMonitor) {
                window.resourceMonitor.updateThresholds(thresholds);
            }
        } catch (error) {
            showToast(error.message || 'Failed to update preferences. Please try again.', 'error');
        }
    }

    getAuthHeaders() {
        return this.token ? {
            'Authorization': `Bearer ${this.token}`
        } : {};
    }
}

export const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
        <span class="toast-message">${message}</span>
    `;
    
    const container = document.querySelector('.toast-container') || (() => {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
        return container;
    })();
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, 5000);
};

// Initialize authentication when DOM is loaded
const authManager = new AuthManager();
export default authManager;
