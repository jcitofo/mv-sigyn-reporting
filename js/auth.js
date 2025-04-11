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
        this.isCommanderVerified = false; // Default state
        this._pendingCallback = null;
        this._checkPersistedVerification(); // Check sessionStorage on init
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
    
    _checkPersistedVerification() {
        const verificationTimestamp = sessionStorage.getItem('commanderVerificationTimestamp');
        const isVerified = sessionStorage.getItem('isCommanderVerified') === 'true';

        if (isVerified && verificationTimestamp) {
            // Optional: Could add a maximum session duration check here if needed
            // const maxDuration = 60 * 60 * 1000; // e.g., 1 hour
            // if (Date.now() - parseInt(verificationTimestamp) < maxDuration) {
                this.isCommanderVerified = true;
                console.log('Restored commander verification from session storage.');
                this._updateVerificationUI(true); // Update UI based on restored state
            // } else {
            //     this.logout(); // Expired
            // }
        }
    }

    // Renamed from checkCommanderVerification for clarity, though functionality is similar
    isCurrentlyVerified() {
        return this.isCommanderVerified;
    }

    verifyCommanderAccess(callback) {
        console.log('verifyCommanderAccess called');
        
        // Check if already verified
        if (this.isCurrentlyVerified()) {
            if (callback) callback();
            return;
        }
        
        // Store the callback to be executed after verification
        this._pendingCallback = callback;
        
        // Create a persistent overlay for verification
        this.createVerificationOverlay();
    }
    
    createVerificationOverlay() {
        // Create a modal overlay for verification to prevent interaction with background
        const overlay = document.createElement('div');
        overlay.className = 'verification-overlay';
        overlay.id = 'verificationOverlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.zIndex = '1000';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        
        // Create verification form
        const verificationForm = document.createElement('div');
        verificationForm.className = 'verification-form';
        verificationForm.style.backgroundColor = '#fff';
        verificationForm.style.padding = '20px';
        verificationForm.style.borderRadius = '5px';
        verificationForm.style.maxWidth = '350px';
        verificationForm.style.width = '100%';
        
        verificationForm.innerHTML = `
            <h3 style="margin-top: 0;">Commander Access Required</h3>
            <p>Please enter your commander access code to proceed with this operation.</p>
            <div style="margin-bottom: 15px;">
                <label for="overlay-access-code">Commander Access Code:</label>
                <input type="password" id="overlay-access-code" style="width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box;" required>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <button id="cancel-verification" style="padding: 8px 15px; background-color: #6c757d; color: white; border: none; border-radius: 3px; cursor: pointer;">Cancel</button>
                <button id="submit-verification" style="padding: 8px 15px; background-color: #0d6efd; color: white; border: none; border-radius: 3px; cursor: pointer;">Verify Access</button>
            </div>
        `;
        
        overlay.appendChild(verificationForm);
        document.body.appendChild(overlay);
        
        // Focus on the input
        setTimeout(() => {
            const accessCodeInput = document.getElementById('overlay-access-code');
            if (accessCodeInput) accessCodeInput.focus();
        }, 100);
        
        // Add event listeners
        document.getElementById('submit-verification').addEventListener('click', () => {
            const code = document.getElementById('overlay-access-code').value;
            console.log('Submit verification clicked with code:', code);
            
            // Verify the access code
            const result = this.verifyAccessCode(code);
            console.log('Verification result:', result);
            
            if (result) {
                // Remove the overlay on success
                document.body.removeChild(overlay);
                
                // Show success toast
                showToast('Commander access verified', 'success');
                
                // Execute the callback
                if (this._pendingCallback) {
                    console.log('Executing pending callback');
                    setTimeout(() => {
                        if (this._pendingCallback) this._pendingCallback();
                        this._pendingCallback = null;
                    }, 100);
                }
            } else {
                // On failure, shake the input field
                const input = document.getElementById('overlay-access-code');
                input.classList.add('shake-animation');
                setTimeout(() => input.classList.remove('shake-animation'), 500);
                
                // Show error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'verification-error';
                errorMsg.textContent = 'Invalid access code. Try again.';
                errorMsg.style.color = 'red';
                errorMsg.style.marginTop = '5px';
                errorMsg.style.fontSize = '0.9em';
                errorMsg.style.textAlign = 'center';
                
                // Remove any existing error message
                const existingError = document.querySelector('.verification-error');
                if (existingError) existingError.remove();
                
                // Insert error message before the buttons
                const buttonsDiv = document.querySelector('.verification-form > div:last-child');
                buttonsDiv.parentNode.insertBefore(errorMsg, buttonsDiv);
            }
        });
        
        document.getElementById('cancel-verification').addEventListener('click', () => {
            // Cancel operation
            this._pendingCallback = null;
            document.body.removeChild(overlay);
            showToast('Operation cancelled', 'info');
        });
        
        // Handle pressing Enter key
        document.getElementById('overlay-access-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('submit-verification').click();
            }
        });
    }
    
    // Method to be called from the commander-access button click handler
    verifyAccessCode(accessCode) {
        console.log('Verifying access code:', accessCode, 'Expected:', this.user.accessCode);
        
        if (accessCode === this.user.accessCode) {
            this.isCommanderVerified = true;
            sessionStorage.setItem('isCommanderVerified', 'true');
            sessionStorage.setItem('commanderVerificationTimestamp', Date.now().toString());
            showToast('Access verified', 'success');
            console.log('Commander access verified!');
            
            this._updateVerificationUI(true);

            // Show logout button (ensure listener is attached)
            const logoutBtn = document.getElementById('commander-logout');
            if (logoutBtn) {
                logoutBtn.style.display = 'block';
                if (!logoutBtn.hasAttribute('data-listener-added')) {
                    logoutBtn.addEventListener('click', () => this.logout());
                    logoutBtn.setAttribute('data-listener-added', 'true');
                }
            }
            
            // Removed automatic 30-minute timeout
            // Verification now persists for the session or until manual logout
            
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
        sessionStorage.removeItem('isCommanderVerified');
        sessionStorage.removeItem('commanderVerificationTimestamp');
        console.log('Commander access logged out');
        
        this._updateVerificationUI(false);

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
        
        // Removed automatic timeout timer clearing
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

    // Helper function to update UI elements related to verification status
    _updateVerificationUI(isVerified) {
        const commanderStatus = document.getElementById('commanderStatus');
        const commanderBadge = document.getElementById('commanderAccessStatus');
        const commanderTools = [
            document.getElementById('configureAlerts'),
            document.getElementById('manageThresholds'),
            document.getElementById('manageRecipients')
        ];

        if (isVerified) {
            if (commanderStatus) {
                commanderStatus.textContent = 'Verified';
                commanderStatus.classList.add('verified');
            }
            if (commanderBadge) {
                commanderBadge.textContent = 'Commander Access Verified';
                commanderBadge.classList.add('verified');
            }
            commanderTools.forEach(tool => { if (tool) tool.disabled = false; });
        } else {
            if (commanderStatus) {
                commanderStatus.textContent = 'Not Verified';
                commanderStatus.classList.remove('verified');
            }
            if (commanderBadge) {
                commanderBadge.textContent = 'Commander Access Required';
                commanderBadge.classList.remove('verified');
            }
            commanderTools.forEach(tool => { if (tool) tool.disabled = true; });

            // Clear access code input on logout/expiry
             const accessCodeInput = document.getElementById('commander-access-code');
             if (accessCodeInput) accessCodeInput.value = '';
        }
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
