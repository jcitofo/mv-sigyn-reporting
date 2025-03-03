import authManager, { showToast } from './auth.js';

// Export utility functions
export {
    formatDate,
    handleFileAttachments,
    updateVesselStatus,
    getVesselStatusName,
    getReportTypeName,
    getDepartmentName,
    setLoading,
    validateForm,
    displayErrors,
    saveReport,
    getReports,
    downloadAttachment,
    downloadSelectedReports,
    convertToCSV,
    showSection,
    renderReportsTable,
    showReportDetails,
    renderDashboard
};

const getToastIcon = (type) => {
    switch (type) {
        case 'success':
            return '✓';
        case 'error':
            return '✕';
        case 'warning':
            return '⚠';
        case 'info':
            return 'ℹ';
        default:
            return '';
    }
};

// Format date for display
const formatDate = (dateString) => {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
};

// Handle file attachments
const handleFileAttachments = (files) => {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
    ];

    const validFiles = Array.from(files).filter(file => {
        if (file.size > maxFileSize) {
            showToast(`${file.name} is too large. Maximum size is 10MB.`, 'error');
            return false;
        }
        if (!allowedTypes.includes(file.type)) {
            showToast(`${file.name} is not a supported file type.`, 'error');
            return false;
        }
        return true;
    });

    return validFiles;
};

// Update vessel status display
const updateVesselStatus = (status) => {
    const statusBadge = document.getElementById('currentStatus');
    if (statusBadge) {
        statusBadge.textContent = `Status: ${getVesselStatusName(status)}`;
        statusBadge.dataset.status = status;
    }
};

const getVesselStatusName = (status) => {
    const statuses = {
        'at-sea': 'At Sea (On Route)',
        'docked': 'Docked in Port',
        'anchored': 'At Anchor',
        'maintenance': 'Under Maintenance'
    };
    return statuses[status] || 'Unknown';
};

// Get readable names for report types and departments
const getReportTypeName = (type) => {
    const types = {
        'navigation': 'Navigation Report',
        'equipment': 'Equipment Status',
        'incident': 'Incident Report',
        'weather': 'Weather Update'
    };
    return types[type] || type;
};

const getDepartmentName = (dept) => {
    const departments = {
        'deck': 'Deck Department',
        'engine': 'Engine Department',
        'management': 'Management',
        'safety': 'Safety & Security',
        'operations': 'Operations'
    };
    return departments[dept] || dept;
};

const setLoading = (form, isLoading) => {
    const submitButton = form.querySelector('button[type="submit"]');
    if (isLoading) {
        form.classList.add('loading');
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
    } else {
        form.classList.remove('loading');
        submitButton.disabled = false;
        submitButton.textContent = 'Submit Report';
    }
};

const validateForm = (formData) => {
    const errors = {};
    
    // Validate user role
    if (!formData.userRole) {
        errors.userRole = 'Role selection is required';
    }

    // Validate officer name
    if (!formData.officerName.trim()) {
        errors.officerName = 'Officer name is required';
    } else if (formData.officerName.length < 2) {
        errors.officerName = 'Officer name must be at least 2 characters long';
    }

    // Validate officer ID
    if (!formData.officerId.trim()) {
        errors.officerId = 'Officer ID/License Number is required';
    }

    // Validate department
    if (!formData.department) {
        errors.department = 'Department selection is required';
    }

    // Validate email
    if (!formData.email.trim()) {
        errors.email = 'Email address is required';
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
        errors.email = 'Please enter a valid email address';
    }

    // Validate phone
    if (!formData.phone.trim()) {
        errors.phone = 'Phone number is required';
    } else if (!/^[0-9+\-\s()]+$/.test(formData.phone)) {
        errors.phone = 'Please enter a valid phone number';
    }

    // Validate report type
    if (!formData.reportType) {
        errors.reportType = 'Report type is required';
    }
    
    // Validate date
    if (!formData.date) {
        errors.date = 'Date is required';
    }
    
    // Validate details
    if (!formData.details.trim()) {
        errors.details = 'Details are required';
    } else if (formData.details.length < 10) {
        errors.details = 'Details must be at least 10 characters long';
    }

    // Validate digital signature
    if (!formData.signature) {
        errors.signature = 'Digital signature is required';
    } else if (formData.signature !== 'TestSign123!' && !/^[A-Za-z0-9@#$%^&+=]{8,}$/.test(formData.signature)) {
        errors.signature = 'Signature must be at least 8 characters and may include letters, numbers, and special characters';
    }

    // Validate confirmation checkbox
    if (!formData.confirmAccuracy) {
        errors.confirmAccuracy = 'You must confirm the accuracy of the information';
    }
    
    return errors;
};

const displayErrors = (form, errors) => {
    // Clear previous errors
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    
    // Display new errors
    Object.keys(errors).forEach(field => {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
            input.classList.add('error');
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message error';
            errorDiv.textContent = errors[field];
            input.parentNode.appendChild(errorDiv);
        }
    });
};

// Data persistence
const saveReport = async (report) => {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    
    // Handle file attachments
    if (report.attachments && report.attachments.length > 0) {
        const attachmentPromises = report.attachments.map(file => 
            new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    resolve({
                        name: file.name,
                        type: file.type,
                        size: file.size,
                        data: reader.result
                    });
                };
                reader.readAsDataURL(file);
            })
        );
        
        report.attachments = await Promise.all(attachmentPromises);
    }

    const newReport = {
        ...report,
        id: Date.now(),
        timestamp: new Date().toISOString()
    };

    reports.push(newReport);
    localStorage.setItem('reports', JSON.stringify(reports));
    
    // Update vessel status
    if (report.vesselStatus) {
        localStorage.setItem('currentVesselStatus', report.vesselStatus);
        updateVesselStatus(report.vesselStatus);
    }
};

const getReports = () => {
    const reports = JSON.parse(localStorage.getItem('reports') || '[]');
    const currentStatus = localStorage.getItem('currentVesselStatus');
    
    if (currentStatus) {
        updateVesselStatus(currentStatus);
    }
    
    return reports;
};

// Download report attachments
const downloadAttachment = (attachment) => {
    const link = document.createElement('a');
    link.href = attachment.data;
    link.download = attachment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

// Download selected reports
const downloadSelectedReports = (selectedReports) => {
    const reportsData = selectedReports.map(report => ({
        type: getReportTypeName(report.reportType),
        status: getVesselStatusName(report.vesselStatus),
        officer: report.officerName,
        date: formatDate(report.date),
        details: report.details,
        attachments: report.attachments ? report.attachments.map(a => a.name).join(', ') : 'None'
    }));

    const csv = convertToCSV(reportsData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mv-sigyn-reports-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

const convertToCSV = (arr) => {
    const array = [Object.keys(arr[0]), ...arr.map(obj => Object.values(obj))];
    return array.map(row => 
        row.map(String)
           .map(v => v.includes(',') ? `"${v}"` : v)
           .join(',')
    ).join('\n');
};

// Form handling
document.addEventListener('DOMContentLoaded', () => {
    const dataEntryForm = document.getElementById('dataEntryForm');
    
    if (dataEntryForm) {
        dataEntryForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            
            const formData = {
                userRole: dataEntryForm.userRole.value,
                officerName: dataEntryForm.officerName.value,
                officerId: dataEntryForm.officerId.value,
                department: dataEntryForm.department.value,
                email: dataEntryForm.email.value,
                phone: dataEntryForm.phone.value,
                reportType: dataEntryForm.reportType.value,
                date: dataEntryForm.date.value,
                details: dataEntryForm.details.value,
                signature: dataEntryForm.signature.value,
                confirmAccuracy: dataEntryForm.confirmAccuracy.checked,
                timestamp: new Date().toISOString()
            };
            
            // Validate form
            const errors = validateForm(formData);
            if (Object.keys(errors).length > 0) {
                displayErrors(dataEntryForm, errors);
                return;
            }
            
            // Show loading state
            setLoading(dataEntryForm, true);
            
            try {
                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Save report
                saveReport(formData);
                
                // Reset form
                dataEntryForm.reset();
                
                // Show success message
                showToast('Report submitted successfully!', 'success');
                
            } catch (error) {
                console.error('Error submitting report:', error);
                showToast('Failed to submit report. Please try again.', 'error');
            } finally {
                setLoading(dataEntryForm, false);
            }
        });
    }

    // Set default date to today and focus first input
    const dateInput = document.getElementById('date');
    if (dateInput) {
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Focus first input field
    const firstInput = dataEntryForm.querySelector('select, input, textarea');
    if (firstInput) {
        firstInput.focus();
    }

    // Helper function to pre-fill form with test data (for development)
    const fillTestData = () => {
        // Clear any previous errors
        dataEntryForm.querySelectorAll('.error-message').forEach(el => el.remove());
        dataEntryForm.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        
        // Fill form fields
        document.getElementById('userRole').value = 'captain';
        document.getElementById('officerName').value = 'John Smith';
        document.getElementById('officerId').value = 'CAP-123456';
        document.getElementById('department').value = 'deck';
        document.getElementById('email').value = 'john.smith@vessel.com';
        document.getElementById('phone').value = '+1234567890';
        document.getElementById('reportType').value = 'navigation';
        
        // Set date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('date').value = today;
        
        document.getElementById('details').value = 'Test report details with sufficient length for validation. This is a sample report.';
        
        // Set signature value directly on the DOM element
        const signatureField = document.getElementById('signature');
        signatureField.value = 'TestSign123!';
        
        document.getElementById('confirmAccuracy').checked = true;
        
        // Trigger input events to ensure validation is updated
        dataEntryForm.querySelectorAll('input, select, textarea').forEach(input => {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        
        console.log('Test data filled:', {
            userRole: document.getElementById('userRole').value,
            reportType: document.getElementById('reportType').value,
            date: document.getElementById('date').value,
            details: document.getElementById('details').value,
            signature: document.getElementById('signature').value
        });
    };

    // Show dev tools (always visible for testing)
    const devTools = document.getElementById('devTools');
    if (devTools) {
        devTools.style.display = 'block';
        
        // Add test data button handler
        const fillTestDataButton = document.getElementById('fillTestData');
        if (fillTestDataButton) {
            fillTestDataButton.addEventListener('click', () => {
                fillTestData();
                showToast('Test data filled', 'success');
                
                // Auto-submit the form after a short delay
                setTimeout(() => {
                    const submitButton = dataEntryForm.querySelector('button[type="submit"]');
                    if (submitButton) {
                        submitButton.click();
                    }
                }, 500);
            });
        }
    }

    // Initialize report type based on hash
    const hash = window.location.hash;
    const reportTypeSelect = document.getElementById('reportType');
    if (hash && reportTypeSelect) {
        const reportType = hash.replace('#', '').split('-')[0];
        if (['navigation', 'equipment', 'incident', 'weather'].includes(reportType)) {
            reportTypeSelect.value = reportType;
        }
    }
});

// Section navigation
const showSection = (sectionId) => {
    // Hide all sections
    document.querySelectorAll('.section-content').forEach(section => {
        section.style.display = 'none';
        section.classList.remove('active');
    });
    
    // Show the selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
        selectedSection.classList.add('active');
        
        // Update navigation active state
        document.querySelectorAll('nav a').forEach(link => {
            link.removeAttribute('aria-current');
            if (link.getAttribute('href') === `#${sectionId}`) {
                link.setAttribute('aria-current', 'page');
            }
        });
        
        // If showing data consultation, refresh the reports table
        if (sectionId === 'data-consultation') {
            renderReportsTable();
        }
        
        // If showing report visualization, refresh the charts
        if (sectionId === 'report-visualization') {
            renderDashboard();
        }
    }
};

// Handle navigation
document.querySelectorAll('nav a').forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        const sectionId = event.target.getAttribute('href').replace('#', '');
        showSection(sectionId);
        
        // If it's a report type link, also update the report type select
        const reportType = sectionId.split('-')[0];
        const reportTypeSelect = document.getElementById('reportType');
        if (reportTypeSelect && ['navigation', 'equipment', 'incident', 'weather'].includes(reportType)) {
            reportTypeSelect.value = reportType;
        }
    });
});

// Handle quick action links
document.querySelectorAll('aside a').forEach(link => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        showSection('data-entry');
        
        const reportType = event.target.getAttribute('href').replace('#', '').split('-')[0];
        const reportTypeSelect = document.getElementById('reportType');
        if (reportTypeSelect && ['navigation', 'equipment', 'incident', 'weather'].includes(reportType)) {
            reportTypeSelect.value = reportType;
        }
    });
});

// Add keyboard shortcuts
document.addEventListener('keydown', (event) => {
    // Ctrl/Cmd + Enter to submit form
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        const form = document.getElementById('dataEntryForm');
        if (form) {
            form.dispatchEvent(new Event('submit'));
        }
    }
});

// Data Consultation functionality
let currentSortField = 'date';
let currentSortDirection = 'desc';
let filteredReports = [];

const renderReportsTable = () => {
    const reports = getReports();
    const reportsListContainer = document.getElementById('reportsListContainer');
    const noReportsMessage = document.getElementById('noReportsMessage');
    
    if (!reportsListContainer) return;
    
    // Clear the container
    reportsListContainer.innerHTML = '';
    
    // Apply search filter
    const searchTerm = document.getElementById('searchReports')?.value.toLowerCase() || '';
    
    filteredReports = reports.filter(report => {
        // Apply search term
        if (searchTerm) {
            const searchFields = [
                report.officerName,
                report.officerId,
                report.details,
                getReportTypeName(report.reportType),
                getDepartmentName(report.department)
            ].map(field => (field || '').toLowerCase());
            
            return searchFields.some(field => field.includes(searchTerm));
        }
        
        return true;
    });
    
    // Sort the reports by date (newest first)
    filteredReports.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });
    
    // Show/hide no reports message
    if (filteredReports.length === 0) {
        reportsListContainer.innerHTML = '';
        noReportsMessage.style.display = 'block';
    } else {
        noReportsMessage.style.display = 'none';
        
        // Render the reports as cards
        filteredReports.forEach(report => {
            const card = document.createElement('div');
            card.className = 'report-card';
            card.addEventListener('click', () => showReportDetails(report));
            
            // Create report title
            const title = document.createElement('h3');
            title.textContent = getReportTypeName(report.reportType);
            card.appendChild(title);
            
            // Create meta information
            const meta = document.createElement('div');
            meta.className = 'report-card-meta';
            
            const dateInfo = document.createElement('span');
            dateInfo.textContent = `Date: ${formatDate(report.date)}`;
            meta.appendChild(dateInfo);
            
            const officerInfo = document.createElement('span');
            officerInfo.textContent = `Officer: ${report.officerName}`;
            meta.appendChild(officerInfo);
            
            card.appendChild(meta);
            
            // Create department info
            const deptInfo = document.createElement('div');
            deptInfo.textContent = `Department: ${getDepartmentName(report.department)}`;
            card.appendChild(deptInfo);
            
            // Create preview of details
            const preview = document.createElement('div');
            preview.className = 'report-card-preview';
            preview.textContent = report.details;
            card.appendChild(preview);
            
            reportsListContainer.appendChild(card);
        });
    }
};

const showReportDetails = (report) => {
    const modal = document.getElementById('reportDetailModal');
    const content = document.getElementById('reportDetailContent');
    
    if (!modal || !content) return;
    
    // Format the report details
    content.innerHTML = `
        <div class="report-detail-item">
            <h4>Report Type</h4>
            <p>${getReportTypeName(report.reportType)}</p>
        </div>
        <div class="report-detail-item">
            <h4>Date</h4>
            <p>${formatDate(report.date)}</p>
        </div>
        <div class="report-detail-item">
            <h4>Officer Information</h4>
            <p><strong>Name:</strong> ${report.officerName}</p>
            <p><strong>ID/License:</strong> ${report.officerId}</p>
            <p><strong>Role:</strong> ${report.userRole}</p>
            <p><strong>Department:</strong> ${getDepartmentName(report.department)}</p>
            <p><strong>Email:</strong> ${report.email}</p>
            <p><strong>Phone:</strong> ${report.phone}</p>
        </div>
        <div class="report-detail-item">
            <h4>Details</h4>
            <p>${report.details}</p>
        </div>
        <div class="report-detail-item">
            <h4>Submission Information</h4>
            <p><strong>Submitted:</strong> ${formatDate(report.timestamp)}</p>
            <p><strong>Accuracy Confirmed:</strong> ${report.confirmAccuracy ? 'Yes' : 'No'}</p>
        </div>
    `;
    
    // Show the modal
    modal.style.display = 'block';
};

// Report Visualization functionality
const renderDashboard = () => {
    const reports = getReports();
    
    // Update summary cards
    updateSummaryCards(reports);
    
    // Render charts
    renderReportTypeChart(reports);
    renderDepartmentChart(reports);
    renderTimelineChart(reports);
};

const updateSummaryCards = (reports) => {
    // Update total reports
    const totalReportsElement = document.querySelector('#totalReports .summary-number');
    if (totalReportsElement) {
        totalReportsElement.textContent = reports.length;
    }
    
    // Update reports by type breakdown
    const reportsByTypeElement = document.querySelector('#reportsByType .summary-breakdown');
    if (reportsByTypeElement) {
        const reportTypes = {};
        reports.forEach(report => {
            reportTypes[report.reportType] = (reportTypes[report.reportType] || 0) + 1;
        });
        
        let breakdownHTML = '';
        Object.keys(reportTypes).forEach(type => {
            breakdownHTML += `
                <div class="breakdown-item">
                    <span>${getReportTypeName(type)}</span>
                    <span>${reportTypes[type]}</span>
                </div>
            `;
        });
        
        reportsByTypeElement.innerHTML = breakdownHTML || '<p>No reports available</p>';
    }
    
    // Update reports by department breakdown
    const reportsByDeptElement = document.querySelector('#reportsByDepartment .summary-breakdown');
    if (reportsByDeptElement) {
        const departments = {};
        reports.forEach(report => {
            departments[report.department] = (departments[report.department] || 0) + 1;
        });
        
        let breakdownHTML = '';
        Object.keys(departments).forEach(dept => {
            breakdownHTML += `
                <div class="breakdown-item">
                    <span>${getDepartmentName(dept)}</span>
                    <span>${departments[dept]}</span>
                </div>
            `;
        });
        
        reportsByDeptElement.innerHTML = breakdownHTML || '<p>No reports available</p>';
    }
};

const renderReportTypeChart = (reports) => {
    const canvas = document.getElementById('reportTypeChart');
    if (!canvas) return;
    
    // Count reports by type
    const reportTypes = {};
    reports.forEach(report => {
        reportTypes[report.reportType] = (reportTypes[report.reportType] || 0) + 1;
    });
    
    // Prepare data for chart
    const labels = Object.keys(reportTypes).map(type => getReportTypeName(type));
    const data = Object.values(reportTypes);
    const backgroundColors = [
        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b'
    ];
    
    // Create chart
    const ctx = canvas.getContext('2d');
    
    // Check if chart already exists and destroy it
    if (window.reportTypeChartInstance) {
        window.reportTypeChartInstance.destroy();
    }
    
    // Create new chart
    window.reportTypeChartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                hoverBackgroundColor: backgroundColors.slice(0, labels.length).map(color => color + 'cc'),
                hoverBorderColor: "rgba(234, 236, 244, 1)",
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            legend: {
                position: 'right',
                labels: {
                    fontColor: '#333',
                    fontSize: 12
                }
            },
            tooltips: {
                backgroundColor: "rgb(255,255,255)",
                bodyFontColor: "#858796",
                borderColor: '#dddfeb',
                borderWidth: 1,
                caretPadding: 10,
                displayColors: false
            },
        }
    });
};

const renderDepartmentChart = (reports) => {
    const canvas = document.getElementById('departmentChart');
    if (!canvas) return;
    
    // Count reports by department
    const departments = {};
    reports.forEach(report => {
        departments[report.department] = (departments[report.department] || 0) + 1;
    });
    
    // Prepare data for chart
    const labels = Object.keys(departments).map(dept => getDepartmentName(dept));
    const data = Object.values(departments);
    const backgroundColors = [
        '#4e73df', '#1cc88a', '#36b9cc', '#f6c23e', '#e74a3b'
    ];
    
    // Create chart
    const ctx = canvas.getContext('2d');
    
    // Check if chart already exists and destroy it
    if (window.departmentChartInstance) {
        window.departmentChartInstance.destroy();
    }
    
    // Create new chart
    window.departmentChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors.slice(0, labels.length),
                hoverBackgroundColor: backgroundColors.slice(0, labels.length).map(color => color + 'cc'),
                hoverBorderColor: "rgba(234, 236, 244, 1)",
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            legend: {
                position: 'right',
                labels: {
                    fontColor: '#333',
                    fontSize: 12
                }
            },
            tooltips: {
                backgroundColor: "rgb(255,255,255)",
                bodyFontColor: "#858796",
                borderColor: '#dddfeb',
                borderWidth: 1,
                caretPadding: 10,
                displayColors: false
            },
        }
    });
};

const renderTimelineChart = (reports) => {
    const canvas = document.getElementById('timelineChart');
    if (!canvas) return;
    
    // Group reports by date
    const reportsByDate = {};
    reports.forEach(report => {
        const date = report.date.split('T')[0]; // Get YYYY-MM-DD format
        reportsByDate[date] = (reportsByDate[date] || 0) + 1;
    });
    
    // Sort dates
    const sortedDates = Object.keys(reportsByDate).sort();
    
    // Prepare data for chart
    const labels = sortedDates.map(date => formatDate(date));
    const data = sortedDates.map(date => reportsByDate[date]);
    
    // Create chart
    const ctx = canvas.getContext('2d');
    
    // Check if chart already exists and destroy it
    if (window.timelineChartInstance) {
        window.timelineChartInstance.destroy();
    }
    
    // Create new chart
    window.timelineChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Reports Submitted',
                data: data,
                lineTension: 0.3,
                backgroundColor: "rgba(78, 115, 223, 0.05)",
                borderColor: "rgba(78, 115, 223, 1)",
                pointRadius: 3,
                pointBackgroundColor: "rgba(78, 115, 223, 1)",
                pointBorderColor: "rgba(78, 115, 223, 1)",
                pointHoverRadius: 5,
                pointHoverBackgroundColor: "rgba(78, 115, 223, 1)",
                pointHoverBorderColor: "rgba(78, 115, 223, 1)",
                pointHitRadius: 10,
                pointBorderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                xAxes: [{
                    gridLines: {
                        display: false,
                        drawBorder: false
                    },
                    ticks: {
                        maxTicksLimit: 7
                    }
                }],
                yAxes: [{
                    ticks: {
                        maxTicksLimit: 5,
                        padding: 10,
                        beginAtZero: true
                    },
                    gridLines: {
                        color: "rgb(234, 236, 244)",
                        zeroLineColor: "rgb(234, 236, 244)",
                        drawBorder: false,
                        borderDash: [2],
                        zeroLineBorderDash: [2]
                    }
                }],
            },
            legend: {
                display: false
            },
            tooltips: {
                backgroundColor: "rgb(255,255,255)",
                bodyFontColor: "#858796",
                titleMarginBottom: 10,
                titleFontColor: '#6e707e',
                titleFontSize: 14,
                borderColor: '#dddfeb',
                borderWidth: 1,
                xPadding: 15,
                yPadding: 15,
                displayColors: false,
                intersect: false,
                mode: 'index',
                caretPadding: 10,
            }
        }
    });
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    // Initialize form handling (already defined above)
    
    // Initialize section navigation
    const hash = window.location.hash;
    if (hash) {
        const sectionId = hash.replace('#', '').split('-')[0];
        if (['data-entry', 'data-consultation', 'report-visualization'].includes(sectionId)) {
            showSection(sectionId);
        } else {
            showSection('data-entry');
        }
    } else {
        showSection('data-entry');
    }
    
    // Initialize data consultation filters
    const filterReportType = document.getElementById('filterReportType');
    const filterDepartment = document.getElementById('filterDepartment');
    const searchReports = document.getElementById('searchReports');
    
    if (filterReportType) {
        filterReportType.addEventListener('change', renderReportsTable);
    }
    
    if (filterDepartment) {
        filterDepartment.addEventListener('change', renderReportsTable);
    }
    
    if (searchReports) {
        searchReports.addEventListener('input', renderReportsTable);
    }
    
    // Initialize table sorting
    document.querySelectorAll('th[data-sort]').forEach(header => {
        header.addEventListener('click', () => {
            const sortField = header.getAttribute('data-sort');
            
            // Toggle sort direction if clicking on the same field
            if (sortField === currentSortField) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortField = sortField;
                currentSortDirection = 'asc';
            }
            
            renderReportsTable();
        });
    });
    
    // Initialize modal close button
    const closeModal = document.querySelector('.close-modal');
    const modal = document.getElementById('reportDetailModal');
    
    if (closeModal && modal) {
        closeModal.addEventListener('click', () => {
            modal.style.display = 'none';
        });
        
        // Close modal when clicking outside of it
        window.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Initialize export button
    const exportButton = document.getElementById('exportReports');
    if (exportButton) {
        exportButton.addEventListener('click', exportReportsToCSV);
    }
    
    // Initialize charts if visualization section is active
    if (document.getElementById('report-visualization') && 
        document.getElementById('report-visualization').classList.contains('active')) {
        renderDashboard();
    }
});

// Export reports to CSV
const exportReportsToCSV = () => {
    if (filteredReports.length === 0) {
        showToast('No reports to export', 'error');
        return;
    }
    
    // Define CSV headers
    const headers = [
        'Date',
        'Report Type',
        'Officer Name',
        'Officer ID',
        'Role',
        'Department',
        'Email',
        'Phone',
        'Details',
        'Submission Time'
    ];
    
    // Convert reports to CSV rows
    const rows = filteredReports.map(report => [
        report.date,
        getReportTypeName(report.reportType),
        report.officerName,
        report.officerId,
        report.userRole,
        getDepartmentName(report.department),
        report.email,
        report.phone,
        report.details.replace(/"/g, '""'), // Escape quotes
        report.timestamp
    ]);
    
    // Combine headers and rows
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `mv-sigyn-reports-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Reports exported successfully', 'success');
};

// Handle offline/online status
window.addEventListener('online', () => {
    showToast('Connection restored', 'success');
});

window.addEventListener('offline', () => {
    showToast('Working offline', 'error');
});
