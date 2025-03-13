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
            },
            accessCode: 'MV-SIGYN-2025' // Commander access code
        };
        
        this.token = 'demo_token';
        this.user = demoUser;
        this.isCommanderVerified = false;
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
            prefsBtn.addEventListener('click', () => {
                if (this.user.role === 'captain' && !this.isCommanderVerified) {
                    this.verifyCommanderAccess(() => this.showPreferencesModal());
                } else {
                    this.showPreferencesModal();
                }
            });
        }
        
        // Setup event listeners for resource modification buttons
        document.addEventListener('click', (event) => {
            // Check for resource update buttons
            if (event.target.matches('#updateRates, #recordDelivery')) {
                if (this.user.role === 'captain' && !this.isCommanderVerified) {
                    event.preventDefault();
                    this.verifyCommanderAccess(() => {
                        // Simulate click on the original button after verification
                        event.target.click();
                    });
                }
            }
        });
    }
    
    async checkCommanderVerification() {
        // Check if verification is still valid (within 30 minute window)
        return this.isCommanderVerified;
    }

    verifyCommanderAccess(callback) {
        console.log('verifyCommanderAccess called');
        
        // Check if already verified
        if (this.isCommanderVerified) {
            if (callback) callback();
            return;
        }
        
        // Use the existing form in the sidebar
        const accessCodeInput = document.getElementById('commander-access-code');
        const commanderAccessBtn = document.getElementById('commander-access');
        const commanderStatus = document.getElementById('commanderStatus');
        
        // Focus on the input field to draw user's attention
        if (accessCodeInput) {
            accessCodeInput.focus();
            
            // Show a toast message to guide the user
            showToast('Please enter your commander access code in the top-right form', 'info');
            
            // Scroll to make sure the form is visible
            const commanderForm = document.getElementById('commander-access-form');
            if (commanderForm) {
                commanderForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            
            // Store the callback to be executed after verification
            this._pendingCallback = callback;
        } else {
            console.error('Commander access form not found');
            showToast('Commander access form not found', 'error');
        }
    }
    
    // Method to be called from the commander-access button click handler
    verifyAccessCode(accessCode) {
        if (accessCode === this.user.accessCode) {
            this.isCommanderVerified = true;
            showToast('Access verified', 'success');
            
            // Update UI elements
            const commanderStatus = document.getElementById('commanderStatus');
            if (commanderStatus) {
                commanderStatus.textContent = 'Verified';
                commanderStatus.classList.add('verified');
            }
            
            // Update commander badge
            const commanderBadge = document.getElementById('commanderAccessStatus');
            if (commanderBadge) {
                commanderBadge.textContent = 'Commander Access Verified';
                commanderBadge.classList.add('verified');
            }
            
            // Enable commander tools
            const commanderTools = [
                document.getElementById('configureAlerts'),
                document.getElementById('manageThresholds'),
                document.getElementById('manageRecipients')
            ];
            
            commanderTools.forEach(tool => {
                if (tool) {
                    tool.disabled = false;
                }
            });
            
            // Show logout button
            const logoutBtn = document.getElementById('commander-logout');
            if (logoutBtn) {
                logoutBtn.style.display = 'block';
                
                // Add event listener if not already added
                if (!logoutBtn.hasAttribute('data-listener-added')) {
                    logoutBtn.addEventListener('click', () => this.logout());
                    logoutBtn.setAttribute('data-listener-added', 'true');
                }
            }
            
            // Set a timeout to reset verification after 30 minutes
            if (this._logoutTimer) {
                clearTimeout(this._logoutTimer);
            }
            
            this._logoutTimer = setTimeout(() => {
                this.logout();
                showToast('Commander access has expired', 'info');
            }, 30 * 60 * 1000);
            
            // Execute any pending callback
            if (this._pendingCallback) {
                this._pendingCallback();
                this._pendingCallback = null;
            }
            
            return true;
        } else {
            showToast('Invalid access code', 'error');
            return false;
        }
    }
    
    // Method to handle logout
    logout() {
        this.isCommanderVerified = false;
        
        // Update UI elements
        const commanderStatus = document.getElementById('commanderStatus');
        if (commanderStatus) {
            commanderStatus.textContent = 'Not Verified';
            commanderStatus.classList.remove('verified');
        }
        
        // Update commander badge
        const commanderBadge = document.getElementById('commanderAccessStatus');
        if (commanderBadge) {
            commanderBadge.textContent = 'Commander Access Required';
            commanderBadge.classList.remove('verified');
        }
        
        // Disable commander tools
        const commanderTools = [
            document.getElementById('configureAlerts'),
            document.getElementById('manageThresholds'),
            document.getElementById('manageRecipients')
        ];
        
        commanderTools.forEach(tool => {
            if (tool) {
                tool.disabled = true;
            }
        });
        
        // Hide logout button
        const logoutBtn = document.getElementById('commander-logout');
        if (logoutBtn) {
            logoutBtn.style.display = 'none';
        }
        
        // Clear the access code input
        const accessCodeInput = document.getElementById('commander-access-code');
        if (accessCodeInput) {
            accessCodeInput.value = '';
        }
        
        // Clear the logout timer
        if (this._logoutTimer) {
            clearTimeout(this._logoutTimer);
            this._logoutTimer = null;
        }
    }

    getLoggedInUI() {
        return `
            <div class="user-info">
                <span class="username">${this.user.username}</span>
                <span class="role">${this.user.role}</span>
                <button id="preferencesBtn" class="preferences-btn">Preferences</button>
                ${this.user.role === 'captain' ? 
                    `<span class="commander-status ${this.isCommanderVerified ? 'verified' : ''}">
                        ${this.isCommanderVerified ? '✓ Verified' : ''}
                    </span>` : ''}
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
                    
                    ${this.user.role === 'captain' ? `
                    <h3>Email Notification Recipients</h3>
                    <div class="form-group">
                        <label for="emailRecipients">Email Recipients (comma-separated):</label>
                        <input type="text" id="emailRecipients" name="emailRecipients" 
                            value="${localStorage.getItem('alertEmailRecipients') || ''}" 
                            placeholder="email1@example.com, email2@example.com">
                    </div>
                    ` : ''}

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

            // Save email recipients if captain
            if (this.user.role === 'captain' && form.emailRecipients) {
                localStorage.setItem('alertEmailRecipients', form.emailRecipients.value);
                
                // Update server-side email recipients
                try {
                    await fetch('/api/alerts/config', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            emailRecipients: form.emailRecipients.value.split(',').map(email => email.trim())
                        })
                    });
                } catch (error) {
                    console.error('Failed to update email recipients:', error);
                }
            }

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
