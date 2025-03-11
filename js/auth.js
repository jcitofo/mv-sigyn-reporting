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
        
        // Check if verification form already exists
        if (document.getElementById('commander-verification-form')) {
            console.log('Commander verification form already exists');
            return;
        }
        
        // Get the commander tools section
        const commanderTools = document.querySelector('.commander-tools');
        if (!commanderTools) {
            console.error('Commander tools section not found');
            return;
        }
        
        // Create verification form
        const verificationForm = document.createElement('div');
        verificationForm.className = 'commander-verification-form';
        verificationForm.id = 'commander-verification-form';
        verificationForm.innerHTML = `
            <h3>Commander Verification</h3>
            <form id="access-code-form">
                <div class="form-group">
                    <label for="access-code">Access Code:</label>
                    <input type="password" id="access-code" required>
                </div>
                <div class="form-actions">
                    <button type="submit" class="primary">Verify</button>
                </div>
            </form>
        `;
        
        // Insert form after the status indicator
        const statusIndicator = commanderTools.querySelector('.status-indicator');
        if (statusIndicator) {
            statusIndicator.insertAdjacentElement('afterend', verificationForm);
        } else {
            commanderTools.appendChild(verificationForm);
        }
        
        // Focus on the input field
        setTimeout(() => {
            const accessCodeInput = document.getElementById('access-code');
            if (accessCodeInput) accessCodeInput.focus();
        }, 100);
        
        // Setup event listener
        const form = document.getElementById('access-code-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Commander access form submitted');
            const accessCode = document.getElementById('access-code').value;
            
            if (accessCode === this.user.accessCode) {
                this.isCommanderVerified = true;
                showToast('Access verified', 'success');
                
                // Update UI
                const commanderStatus = document.getElementById('commanderStatus');
                if (commanderStatus) {
                    commanderStatus.textContent = 'Verified';
                    commanderStatus.classList.add('verified');
                }
                
                // Remove the form
                verificationForm.remove();
                
                // Set a timeout to reset verification after 30 minutes
                setTimeout(() => {
                    this.isCommanderVerified = false;
                    
                    // Update UI when verification expires
                    const commanderStatus = document.getElementById('commanderStatus');
                    if (commanderStatus) {
                        commanderStatus.textContent = 'Not Verified';
                        commanderStatus.classList.remove('verified');
                    }
                }, 30 * 60 * 1000);
                
                if (callback) callback();
            } else {
                showToast('Invalid access code', 'error');
            }
        });
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
