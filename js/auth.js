class AuthManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.setupAuthUI();
    }

    setupAuthUI() {
        // Add auth container to header
        const header = document.querySelector('header');
        const authContainer = document.createElement('div');
        authContainer.className = 'auth-container';
        authContainer.innerHTML = this.token ? this.getLoggedInUI() : this.getLoginUI();
        header.appendChild(authContainer);

        // Setup event listeners
        if (!this.token) {
            const loginForm = document.getElementById('loginForm');
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        } else {
            const logoutBtn = document.getElementById('logoutBtn');
            logoutBtn.addEventListener('click', () => this.handleLogout());
            
            // Setup preferences if user can modify settings
            if (this.user && ['captain', 'engineer'].includes(this.user.role)) {
                const prefsBtn = document.getElementById('preferencesBtn');
                prefsBtn.addEventListener('click', () => this.showPreferencesModal());
            }
        }
    }

    getLoginUI() {
        return `
            <form id="loginForm" class="login-form">
                <input type="text" name="username" placeholder="Username" required>
                <input type="password" name="password" placeholder="Password" required>
                <button type="submit">Login</button>
            </form>
        `;
    }

    getLoggedInUI() {
        const canModifySettings = this.user && ['captain', 'engineer'].includes(this.user.role);
        return `
            <div class="user-info">
                <span class="username">${this.user.username}</span>
                <span class="role">${this.user.role}</span>
                ${canModifySettings ? 
                    '<button id="preferencesBtn" class="preferences-btn">Preferences</button>' 
                    : ''}
                <button id="logoutBtn" class="logout-btn">Logout</button>
            </div>
        `;
    }

    async handleLogin(event) {
        event.preventDefault();
        const form = event.target;
        const username = form.username.value;
        const password = form.password.value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Login failed');
            }

            const data = await response.json();
            this.token = data.token;
            this.user = data.user;

            // Store auth data
            localStorage.setItem('token', this.token);
            localStorage.setItem('user', JSON.stringify(this.user));

            // Update UI
            const authContainer = document.querySelector('.auth-container');
            authContainer.innerHTML = this.getLoggedInUI();

            // Setup logged-in event listeners
            const logoutBtn = document.getElementById('logoutBtn');
            logoutBtn.addEventListener('click', () => this.handleLogout());

            if (['captain', 'engineer'].includes(this.user.role)) {
                const prefsBtn = document.getElementById('preferencesBtn');
                prefsBtn.addEventListener('click', () => this.showPreferencesModal());
            }

            // Trigger page reload to refresh data with authenticated requests
            window.location.reload();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async handleLogout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: this.getAuthHeaders()
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear auth data regardless of server response
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            this.token = null;
            this.user = null;

            // Update UI
            const authContainer = document.querySelector('.auth-container');
            authContainer.innerHTML = this.getLoginUI();

            // Setup login form listener
            const loginForm = document.getElementById('loginForm');
            loginForm.addEventListener('submit', (e) => this.handleLogin(e));

            // Reload page to reset state
            window.location.reload();
        }
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

            const response = await fetch('/api/auth/preferences', {
                method: 'PATCH',
                headers: {
                    ...this.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    alertPreferences,
                    thresholds
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to update preferences');
            }

            const data = await response.json();
            this.user = {
                ...this.user,
                alertPreferences: data.alertPreferences,
                thresholds: data.thresholds
            };
            localStorage.setItem('user', JSON.stringify(this.user));

            this.showToast('Preferences updated successfully', 'success');
            document.querySelector('.preferences-modal').remove();

            // Trigger resource monitor update if it exists
            if (window.resourceMonitor) {
                window.resourceMonitor.updateThresholds(data.thresholds);
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    getAuthHeaders() {
        return this.token ? {
            'Authorization': `Bearer ${this.token}`
        } : {};
    }

    showToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${type === 'success' ? '✓' : '✕'}</span>
            <span class="toast-message">${message}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// Initialize authentication when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});
