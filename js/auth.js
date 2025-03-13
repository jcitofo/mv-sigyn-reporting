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

        // Setup language selector
        this.setupLanguageSelector();
        
        // Setup commander access functionality - direct event listener
        const commanderAccessBtn = document.getElementById('commander-access');
        if (commanderAccessBtn) {
            commanderAccessBtn.addEventListener('click', () => {
                const accessCodeInput = document.getElementById('commander-access-code');
                if (!accessCodeInput) {
                    console.error('Commander access code input not found');
                    return;
                }
                const accessCode = accessCodeInput.value;
                console.log('Commander access code entered:', accessCode);
                this.verifyAccessCode(accessCode);
            });
        } else {
            console.error('Commander access button not found');
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
            showToast('Please enter your commander access code in the sidebar form', 'info');
            
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
        console.log('Verifying access code:', accessCode, 'Expected:', this.user.accessCode);
        
        if (accessCode === this.user.accessCode) {
            this.isCommanderVerified = true;
            showToast('Access verified', 'success');
            console.log('Commander access verified!');
            
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
            } else {
                console.warn('Commander badge element not found');
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
            console.log('Invalid commander access code');
            showToast('Invalid access code', 'error');
            return false;
        }
    }
    
    // Method to handle logout
    logout() {
        this.isCommanderVerified = false;
        console.log('Commander access logged out');
        
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
            <div class="language-selector">
                <button id="langEn" class="lang-btn active" title="English">
                    <span class="flag-emoji">🇬🇧</span> EN
                </button>
                <button id="langFr" class="lang-btn" title="Français">
                    <span class="flag-emoji">🇫🇷</span> FR
                </button>
            </div>
        `;
    }

    // Language switching functionality
    setupLanguageSelector() {
        const langEn = document.getElementById('langEn');
        const langFr = document.getElementById('langFr');
        
        if (langEn && langFr) {
            // Set initial language from localStorage or default to English
            const currentLang = localStorage.getItem('appLanguage') || 'en';
            this.setActiveLanguage(currentLang);
            
            // Add event listeners
            langEn.addEventListener('click', () => this.switchLanguage('en'));
            langFr.addEventListener('click', () => this.switchLanguage('fr'));
        }
    }
    
    switchLanguage(lang) {
        // Save language preference
        localStorage.setItem('appLanguage', lang);
        
        // Update UI
        this.setActiveLanguage(lang);
        
        // Apply translations
        this.applyTranslations(lang);
        
        // Show confirmation toast
        showToast(lang === 'en' ? 'Language switched to English' : 'Langue changée en Français', 'success');
    }
    
    setActiveLanguage(lang) {
        const langEn = document.getElementById('langEn');
        const langFr = document.getElementById('langFr');
        
        if (langEn && langFr) {
            if (lang === 'en') {
                langEn.classList.add('active');
                langFr.classList.remove('active');
            } else {
                langEn.classList.remove('active');
                langFr.classList.add('active');
            }
        }
    }
    
    applyTranslations(lang) {
        // Basic translations for demonstration
        const translations = {
            en: {
                'dashboard': 'Dashboard',
                'resource-management': 'Resource Management',
                'data-entry': 'Data Entry',
                'data-consultation': 'Data Consultation',
                'report-visualization': 'Report Visualization',
                'quick-actions': 'Quick Actions',
                'commander-tools': 'Commander Tools'
            },
            fr: {
                'dashboard': 'Tableau de Bord',
                'resource-management': 'Gestion des Ressources',
                'data-entry': 'Saisie de Données',
                'data-consultation': 'Consultation des Données',
                'report-visualization': 'Visualisation des Rapports',
                'quick-actions': 'Actions Rapides',
                'commander-tools': 'Outils du Commandant'
            }
        };
        
        // Apply translations to navigation
        const navLinks = document.querySelectorAll('nav a');
        navLinks.forEach(link => {
            const key = link.getAttribute('href').substring(1); // Remove # from href
            if (translations[lang][key]) {
                link.textContent = translations[lang][key];
            }
        });
        
        // Apply translations to headings
        const headings = document.querySelectorAll('h2');
        headings.forEach(heading => {
            const key = heading.textContent.toLowerCase().replace(/\s+/g, '-');
            if (translations[lang][key]) {
                heading.textContent = translations[lang][key];
            }
        });
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
