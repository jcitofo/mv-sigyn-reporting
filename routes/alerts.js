const express = require('express');
const Alert = require('../models/Alert');
const { auth, checkRole } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const router = express.Router();

// Email configuration (with fallback for development)
let emailTransporter;
try {
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });
} catch (error) {
    console.log('Email service not configured, notifications will be logged only');
    emailTransporter = {
        sendMail: async (options) => {
            console.log('Email notification (mock):', options);
            return { accepted: [options.to], rejected: [] };
        }
    };
}

// Twilio configuration (with fallback for development)
let twilioClient;
try {
    twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
} catch (error) {
    console.log('SMS service not configured, notifications will be logged only');
    twilioClient = {
        messages: {
            create: async (options) => {
                console.log('SMS notification (mock):', options);
                return { sid: 'mock-sid' };
            }
        }
    };
}

// Create new alert
router.post('/', auth, async (req, res) => {
    try {
        const { resource, type, level, message, metadata } = req.body;
        
        const alert = await Alert.createAlert({
            resource,
            type,
            level,
            message,
            metadata
        });
        
        // Automatically send notifications for critical alerts
        if (type === 'critical') {
            try {
                // Get email recipients from environment variable
                const recipients = process.env.ALERT_EMAIL_RECIPIENTS ? 
                    process.env.ALERT_EMAIL_RECIPIENTS.split(',') : [];
                
                if (recipients.length > 0) {
                    await emailTransporter.sendMail({
                        from: process.env.EMAIL_USER,
                        to: recipients,
                        subject: `MV Sigyn CRITICAL Alert: ${resource} at ${level}%`,
                        html: `
                            <h2>CRITICAL Alert</h2>
                            <p><strong>Resource:</strong> ${resource}</p>
                            <p><strong>Level:</strong> ${level}%</p>
                            <p><strong>Message:</strong> ${message}</p>
                            <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                            ${metadata?.estimatedDepletion ? 
                                `<p><strong>Estimated Depletion:</strong> ${new Date(metadata.estimatedDepletion).toLocaleString()}</p>` 
                                : ''}
                            <p><strong>Consumption Rate:</strong> ${metadata?.consumptionRate?.value || 'N/A'} ${metadata?.consumptionRate?.unit || ''}</p>
                        `
                    });
                    
                    await alert.recordNotification('email', recipients);
                    console.log(`Critical alert email sent to ${recipients.join(', ')}`);
                }
            } catch (emailError) {
                console.error('Failed to send alert email:', emailError);
            }
        }
        
        res.status(201).json(alert);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to create alert: ' + error.message
        });
    }
});

// Get active alerts
router.get('/active', auth, async (req, res) => {
    try {
        // Add a timeout to prevent long-running queries
        const alerts = await Alert.getActiveAlerts().maxTimeMS(30000);
        res.json(alerts);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch active alerts: ' + error.message
        });
    }
});

// Get alerts history
router.get('/history', auth, async (req, res) => {
    try {
        const { resource, type, startDate, endDate, limit = 100 } = req.query;
        
        // Limit the number of results to prevent excessive data retrieval
        const maxLimit = Math.min(parseInt(limit) || 100, 500);
        
        const alerts = await Alert.getAlertsHistory({
            resource,
            type,
            startDate,
            endDate,
            limit: maxLimit
        }).maxTimeMS(30000); // Add a 30-second timeout
        
        res.json(alerts);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch alerts history: ' + error.message
        });
    }
});

// Acknowledge alert
router.post('/:alertId/acknowledge', auth, async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.alertId);
        if (!alert) {
            return res.status(404).json({
                error: 'Alert not found'
            });
        }

        await alert.acknowledgeAlert(req.user._id);
        res.json({
            message: 'Alert acknowledged successfully',
            alert
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to acknowledge alert: ' + error.message
        });
    }
});

// Resolve alert
router.post('/:alertId/resolve', auth, checkRole(['captain', 'engineer']), async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.alertId);
        if (!alert) {
            return res.status(404).json({
                error: 'Alert not found'
            });
        }

        await alert.resolveAlert();
        res.json({
            message: 'Alert resolved successfully',
            alert
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to resolve alert: ' + error.message
        });
    }
});

// Send alert notifications
router.post('/:alertId/notify', auth, async (req, res) => {
    try {
        // Check if alertId is valid
        if (!req.params.alertId || req.params.alertId === 'undefined') {
            return res.status(400).json({
                error: 'Invalid alert ID'
            });
        }
        
        // Try to find the alert
        let alert;
        try {
            alert = await Alert.findById(req.params.alertId)
                .populate('acknowledged.by', 'username role');
            
            if (!alert) {
                return res.status(404).json({
                    error: 'Alert not found'
                });
            }
        } catch (findError) {
            console.error('Error finding alert:', findError);
            return res.status(400).json({
                error: 'Invalid alert ID format',
                details: findError.message
            });
        }

        // Set a timeout for notification operations
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Notification operation timed out')), 60000);
        });

        const notificationPromises = [];

        // Send email notifications
        if (req.body.email) {
            // Get recipients from environment variable or use default
            let recipients = [];
            
            if (process.env.ALERT_EMAIL_RECIPIENTS) {
                recipients = process.env.ALERT_EMAIL_RECIPIENTS.split(',');
            }
            
            // Limit the number of recipients to prevent long-running operations
            recipients = recipients.slice(0, 20);
            
            if (recipients.length > 0) {
                const emailPromise = emailTransporter.sendMail({
                    from: process.env.EMAIL_USER,
                    to: recipients,
                    subject: `MV Sigyn ${alert.type.toUpperCase()} Alert: ${alert.resource} at ${alert.level}%`,
                    html: `
                        <h2>${alert.type.toUpperCase()} Alert</h2>
                        <p><strong>Resource:</strong> ${alert.resource}</p>
                        <p><strong>Level:</strong> ${alert.level}%</p>
                        <p><strong>Message:</strong> ${alert.message}</p>
                        <p><strong>Time:</strong> ${alert.timestamp.toLocaleString()}</p>
                        ${alert.metadata?.estimatedDepletion ? 
                            `<p><strong>Estimated Depletion:</strong> ${new Date(alert.metadata.estimatedDepletion).toLocaleString()}</p>` 
                            : ''}
                        <p><strong>Consumption Rate:</strong> ${alert.metadata?.consumptionRate?.value || 'N/A'} ${alert.metadata?.consumptionRate?.unit || ''}</p>
                    `
                }).then(() => alert.recordNotification('email', recipients));

                notificationPromises.push(emailPromise);
            }
        }

        // Send SMS notifications
        if (req.body.sms && process.env.ALERT_SMS_RECIPIENTS) {
            // Limit the number of SMS recipients to prevent long-running operations
            const recipients = process.env.ALERT_SMS_RECIPIENTS.split(',').slice(0, 10);
            
            if (recipients.length > 0) {
                const smsPromise = Promise.all(
                    recipients.map(recipient =>
                        twilioClient.messages.create({
                            body: `MV Sigyn ${alert.type.toUpperCase()} Alert: ${alert.resource} at ${alert.level}%. ${alert.message}`,
                            from: process.env.TWILIO_PHONE_NUMBER,
                            to: recipient
                        })
                    )
                ).then(() => alert.recordNotification('sms', recipients));

                notificationPromises.push(smsPromise);
            }
        }

        // Record sound notification if requested
        if (req.body.sound) {
            notificationPromises.push(alert.recordNotification('sound'));
        }

        // Use Promise.race to implement a timeout
        await Promise.race([
            Promise.all(notificationPromises),
            timeoutPromise
        ]);

        res.json({
            message: 'Alert notifications sent successfully',
            alert
        });
    } catch (error) {
        console.error('Notification error:', error);
        res.status(500).json({
            error: 'Failed to send alert notifications: ' + error.message
        });
    }
});

// Configure alert settings
router.post('/config', auth, checkRole(['captain']), async (req, res) => {
    try {
        const { emailRecipients, smsRecipients } = req.body;
        
        // Update email recipients
        if (emailRecipients && Array.isArray(emailRecipients)) {
            // Validate email format
            const validEmails = emailRecipients.filter(email => 
                /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
            );
            
            if (validEmails.length > 0) {
                process.env.ALERT_EMAIL_RECIPIENTS = validEmails.join(',');
            }
        }
        
        // Update SMS recipients
        if (smsRecipients && Array.isArray(smsRecipients)) {
            // Validate phone number format (basic validation)
            const validPhones = smsRecipients.filter(phone => 
                /^[0-9+\-\s()]+$/.test(phone)
            );
            
            if (validPhones.length > 0) {
                process.env.ALERT_SMS_RECIPIENTS = validPhones.join(',');
            }
        }
        
        res.json({
            message: 'Alert configuration updated successfully',
            config: {
                emailRecipients: process.env.ALERT_EMAIL_RECIPIENTS ? 
                    process.env.ALERT_EMAIL_RECIPIENTS.split(',') : [],
                smsRecipients: process.env.ALERT_SMS_RECIPIENTS ? 
                    process.env.ALERT_SMS_RECIPIENTS.split(',') : []
            }
        });
    } catch (error) {
        console.error('Error updating alert configuration:', error);
        res.status(500).json({
            error: 'Failed to update alert configuration: ' + error.message
        });
    }
});

// Get alerts statistics
router.get('/stats', auth, async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        
        const query = {};
        if (startDate) query.timestamp = { $gte: new Date(startDate) };
        if (endDate) query.timestamp = { ...query.timestamp, $lte: new Date(endDate) };

        // Add a time limit to the aggregation to prevent long-running queries
        const stats = await Alert.aggregate([
            { $match: query },
            // Add a limit to prevent processing too many documents
            { $limit: 10000 },
            {
                $group: {
                    _id: {
                        resource: '$resource',
                        type: '$type'
                    },
                    count: { $sum: 1 },
                    averageLevel: { $avg: '$level' },
                    minLevel: { $min: '$level' },
                    maxLevel: { $max: '$level' }
                }
            },
            {
                $group: {
                    _id: '$_id.resource',
                    types: {
                        $push: {
                            type: '$_id.type',
                            count: '$count',
                            averageLevel: '$averageLevel',
                            minLevel: '$minLevel',
                            maxLevel: '$maxLevel'
                        }
                    },
                    totalCount: { $sum: '$count' }
                }
            }
        ]).option({ maxTimeMS: 60000 }); // Set a 60-second timeout

        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch alert statistics: ' + error.message
        });
    }
});

module.exports = router;
