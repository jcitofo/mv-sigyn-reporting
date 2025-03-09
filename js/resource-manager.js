import authManager, { showToast } from './auth.js';

export class ResourceManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.user = JSON.parse(localStorage.getItem('user'));
        this.resources = {};
        this.historyPage = 1;
        this.historyPageSize = 10;
        this.totalHistoryPages = 1;
        this.selectedResourceType = 'all';
        this.selectedDateRange = 'week';
        this.resourceUnits = {
            fuel: 'L',
            oil: 'L',
            food: 'kg',
            water: 'L'
        };
        
        this.init();
    }
    
    async init() {
        try {
            // Fetch initial resource data
            await this.fetchResourceData();
            
            // Setup event listeners
            this.setupEventListeners();
            
            // Update UI with initial data
            this.updateResourceLevels();
            this.fetchResourceHistory();
        } catch (error) {
            console.error('Failed to initialize resource manager:', error);
            showToast('Failed to load resource data', 'error');
        }
    }
    
    async fetchResourceData() {
        try {
            const response = await fetch('/api/resources/status', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            
            if (!response.ok) throw new Error('Failed to fetch resource data');
            this.resources = await response.json();
            
            return this.resources;
        } catch (error) {
            console.error('Error fetching resource data:', error);
            showToast('Failed to fetch resource data', 'error');
            throw error;
        }
    }
    
    updateResourceLevels() {
        // Update the resource level cards
        Object.keys(this.resources).forEach(resourceType => {
            const resource = this.resources[resourceType];
            const card = document.getElementById(`${resourceType}LevelCard`);
            
            if (!card) return;
            
            // Update level bar
            const levelBar = card.querySelector('.level-bar-fill');
            if (levelBar) {
                levelBar.style.width = `${resource.level}%`;
                
                // Update color based on level
                if (resource.level <= 20) {
                    levelBar.style.backgroundColor = 'var(--critical-level)';
                } else if (resource.level <= 35) {
                    levelBar.style.backgroundColor = 'var(--warning-level)';
                }
            }
            
            // Update text values
            const levelValue = card.querySelector('.level-value');
            if (levelValue) levelValue.textContent = resource.level.toFixed(1);
            
            const quantityValue = card.querySelector('.quantity-value');
            if (quantityValue) {
                const quantity = (resource.level / 100) * resource.capacity;
                quantityValue.textContent = quantity.toFixed(0);
            }
            
            const lastUpdated = card.querySelector('.last-updated');
            if (lastUpdated) {
                lastUpdated.textContent = new Date(resource.lastUpdated).toLocaleString();
            }
        });
        
        // Update resource unit in the form based on selected resource
        this.updateResourceUnit();
    }
    
    updateResourceUnit() {
        const resourceType = document.getElementById('resourceType').value;
        const unitSpan = document.getElementById('resourceUnit');
        
        if (unitSpan) {
            unitSpan.textContent = this.resourceUnits[resourceType] || '';
        }
    }
    
    async fetchResourceHistory() {
        try {
            // Show loading state
            const tableBody = document.getElementById('resourceHistoryTableBody');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="7" class="empty-table-message">Loading resource history...</td></tr>';
            }
            
            // Prepare query parameters
            const params = new URLSearchParams();
            params.append('limit', this.historyPageSize);
            params.append('page', this.historyPage);
            
            // Add date range filter
            const now = new Date();
            let startDate;
            
            switch (this.selectedDateRange) {
                case 'day':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 1);
                    params.append('startDate', startDate.toISOString());
                    break;
                case 'week':
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() - 7);
                    params.append('startDate', startDate.toISOString());
                    break;
                case 'month':
                    startDate = new Date(now);
                    startDate.setMonth(now.getMonth() - 1);
                    params.append('startDate', startDate.toISOString());
                    break;
                case 'custom':
                    // Custom date range would be handled by a date picker in a more complete implementation
                    break;
            }
            
            // Add resource type filter
            const resourceType = this.selectedResourceType;
            if (resourceType !== 'all') {
                const url = `/api/resources/${resourceType}/history?${params.toString()}`;
                const response = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (!response.ok) throw new Error('Failed to fetch resource history');
                const data = await response.json();
                
                this.renderHistoryTable(data.history || []);
                this.totalHistoryPages = Math.ceil((data.totalCount || 0) / this.historyPageSize);
            } else {
                // Fetch history for all resource types
                const historyPromises = ['fuel', 'oil', 'food', 'water'].map(type => 
                    fetch(`/api/resources/${type}/history?${params.toString()}`, {
                        headers: { 'Authorization': `Bearer ${this.token}` }
                    }).then(res => res.json())
                );
                
                const results = await Promise.all(historyPromises);
                
                // Combine and sort history entries
                let combinedHistory = [];
                let totalCount = 0;
                
                results.forEach(result => {
                    if (result.history && Array.isArray(result.history)) {
                        combinedHistory = [...combinedHistory, ...result.history];
                        totalCount += (result.totalCount || 0);
                    }
                });
                
                // Sort by timestamp (newest first)
                combinedHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                // Take only the first historyPageSize entries
                combinedHistory = combinedHistory.slice(0, this.historyPageSize);
                
                this.renderHistoryTable(combinedHistory);
                this.totalHistoryPages = Math.ceil(totalCount / this.historyPageSize);
            }
            
            // Update pagination info
            this.updatePaginationInfo();
        } catch (error) {
            console.error('Error fetching resource history:', error);
            
            const tableBody = document.getElementById('resourceHistoryTableBody');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="7" class="empty-table-message">Failed to load resource history</td></tr>';
            }
            
            showToast('Failed to fetch resource history', 'error');
        }
    }
    
    renderHistoryTable(historyEntries) {
        const tableBody = document.getElementById('resourceHistoryTableBody');
        if (!tableBody) return;
        
        if (!historyEntries || historyEntries.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="empty-table-message">No history entries found</td></tr>';
            return;
        }
        
        const rows = historyEntries.map(entry => {
            // Format the timestamp
            const timestamp = new Date(entry.timestamp).toLocaleString();
            
            // Format the action
            let action = entry.action;
            if (action === 'manual_update') action = 'Manual Update';
            else if (action === 'consumption') action = 'Consumption';
            else if (action === 'refill') action = 'Refill';
            
            // Format the user
            let updatedBy = 'System';
            if (entry.updatedBy) {
                if (typeof entry.updatedBy === 'object') {
                    updatedBy = entry.updatedBy.username || 'Unknown';
                } else {
                    updatedBy = entry.updatedBy;
                }
            }
            
            // Calculate previous level
            const previousLevel = (entry.level - entry.amount).toFixed(1);
            
            return `
                <tr>
                    <td>${timestamp}</td>
                    <td>${entry.resource || this.selectedResourceType}</td>
                    <td>${action}</td>
                    <td>${previousLevel}%</td>
                    <td>${entry.level.toFixed(1)}%</td>
                    <td>${entry.amount.toFixed(1)}</td>
                    <td>${updatedBy}</td>
                </tr>
            `;
        }).join('');
        
        tableBody.innerHTML = rows;
    }
    
    updatePaginationInfo() {
        const pageInfo = document.getElementById('historyPageInfo');
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.historyPage} of ${this.totalHistoryPages}`;
        }
        
        const prevBtn = document.getElementById('prevHistoryPage');
        const nextBtn = document.getElementById('nextHistoryPage');
        
        if (prevBtn) {
            prevBtn.disabled = this.historyPage <= 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.historyPage >= this.totalHistoryPages;
        }
    }
    
    async handleResourceUpdate(event) {
        event.preventDefault();
        
        try {
            const resourceType = document.getElementById('resourceType').value;
            const updateType = document.getElementById('updateType').value;
            const amountInput = document.getElementById('resourceAmount');
            const amount = parseFloat(amountInput.value);
            
            if (isNaN(amount) || amount < 0) {
                showToast('Please enter a valid amount', 'error');
                return;
            }
            
            // Determine the API endpoint and request body based on update type
            let endpoint, requestBody;
            
            if (updateType === 'refill') {
                endpoint = `/api/resources/${resourceType}/delivery`;
                requestBody = {
                    amount,
                    document: document.getElementById('resourceNotes').value || 'Manual entry'
                };
            } else {
                endpoint = `/api/resources/${resourceType}/level`;
                requestBody = {
                    amount,
                    action: updateType
                };
            }
            
            const response = await fetch(endpoint, {
                method: updateType === 'refill' ? 'POST' : 'PATCH',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to update resource');
            }
            
            const result = await response.json();
            
            // Update the UI
            await this.fetchResourceData();
            this.updateResourceLevels();
            
            // Refresh history
            this.fetchResourceHistory();
            
            // Show success message
            showToast(`Resource ${resourceType} updated successfully`, 'success');
            
            // Reset form
            amountInput.value = '';
            document.getElementById('resourceNotes').value = '';
        } catch (error) {
            console.error('Error updating resource:', error);
            showToast(`Failed to update resource: ${error.message}`, 'error');
        }
    }
    
    setupEventListeners() {
        // Resource update form
        const updateForm = document.getElementById('resourceUpdateForm');
        if (updateForm) {
            updateForm.addEventListener('submit', this.handleResourceUpdate.bind(this));
        }
        
        // Resource type change
        const resourceTypeSelect = document.getElementById('resourceType');
        if (resourceTypeSelect) {
            resourceTypeSelect.addEventListener('change', () => this.updateResourceUnit());
        }
        
        // History filters
        const historyResourceType = document.getElementById('historyResourceType');
        if (historyResourceType) {
            historyResourceType.addEventListener('change', (e) => {
                this.selectedResourceType = e.target.value;
                this.historyPage = 1; // Reset to first page
                this.fetchResourceHistory();
            });
        }
        
        const historyDateRange = document.getElementById('historyDateRange');
        if (historyDateRange) {
            historyDateRange.addEventListener('change', (e) => {
                this.selectedDateRange = e.target.value;
                this.historyPage = 1; // Reset to first page
                this.fetchResourceHistory();
            });
        }
        
        // Pagination
        const prevBtn = document.getElementById('prevHistoryPage');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.historyPage > 1) {
                    this.historyPage--;
                    this.fetchResourceHistory();
                }
            });
        }
        
        const nextBtn = document.getElementById('nextHistoryPage');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (this.historyPage < this.totalHistoryPages) {
                    this.historyPage++;
                    this.fetchResourceHistory();
                }
            });
        }
        
        // Export history button
        const exportBtn = document.getElementById('exportHistory');
        if (exportBtn) {
            exportBtn.addEventListener('click', this.exportResourceHistory.bind(this));
        }
    }
    
    exportResourceHistory() {
        try {
            const tableBody = document.getElementById('resourceHistoryTableBody');
            if (!tableBody || !tableBody.rows || tableBody.rows.length === 0) {
                showToast('No data to export', 'warning');
                return;
            }
            
            // Create CSV content
            const headers = ['Date/Time', 'Resource', 'Action', 'Previous Level', 'New Level', 'Amount', 'Updated By'];
            let csvContent = headers.join(',') + '\\n';
            
            // Add rows
            for (let i = 0; i < tableBody.rows.length; i++) {
                const row = tableBody.rows[i];
                const rowData = [];
                
                // Skip empty message rows
                if (row.cells.length === 1 && row.cells[0].classList.contains('empty-table-message')) {
                    continue;
                }
                
                for (let j = 0; j < row.cells.length; j++) {
                    // Escape commas and quotes
                    let cellData = row.cells[j].textContent.trim();
                    if (cellData.includes(',') || cellData.includes('"')) {
                        cellData = '"' + cellData.replace(/"/g, '""') + '"';
                    }
                    rowData.push(cellData);
                }
                
                csvContent += rowData.join(',') + '\\n';
            }
            
            // Create download link
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `resource-history-${new Date().toISOString().slice(0, 10)}.csv`);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('Resource history exported successfully', 'success');
        } catch (error) {
            console.error('Error exporting resource history:', error);
            showToast('Failed to export resource history', 'error');
        }
    }
}

// Initialize resource manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (authManager.token && authManager.user) {
        window.resourceManager = new ResourceManager();
    }
});

export default { ResourceManager };
