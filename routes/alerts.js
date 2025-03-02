const express = require('express');
const Alert = require('../models/Alert');
const { auth, checkRole } = require('../middleware/auth');
const nodemailer = require('nodemailer');
const twilio = require('twilio');

const router = express.Router();

// Email configuration
const emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Twilio configuration
const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

// Get active alerts
router.get('/active', auth, async (req, res) => {
    try {
        const alerts = await Alert.getActiveAlerts();
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
        const { resource, type, startDate, endDate, limit } = req.query;
        const alerts = await Alert.getAlertsHistory({
            resource,
            type,
            startDate,
            endDate,
            limit: parseInt(limit)
        });
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
        const alert = await Alert.findById(req.params.alertId)
            .populate('acknowledged.by', 'username role');
        
        if (!alert) {
            return res.status(404).json({
                error: 'Alert not found'
            });
        }

        const notificationPromises = [];

        // Send email notifications
        if (req.body.email && process.env.ALERT_EMAIL_RECIPIENTS) {
            const emailPromise = emailTransporter.sendMail({
                from: process.env.EMAIL_USER,
                to: process.env.ALERT_EMAIL_RECIPIENTS.split(','),
                subject: `MV Sigyn Alert: ${alert.resource} ${alert.type}`,
                html: `
                    <h2>${alert.type.toUpperCase()} Alert</h2>
                    <p><strong>Resource:</strong> ${alert.resource}</p>
                    <p><strong>Level:</strong> ${alert.level}%</p>
                    <p><strong>Message:</strong> ${alert.message}</p>
                    <p><strong>Time:</strong> ${alert.timestamp.toLocaleString()}</p>
                    ${alert.metadata.estimatedDepletion ? 
                        `<p><strong>Estimated Depletion:</strong> ${alert.metadata.estimatedDepletion.toLocaleString()}</p>` 
                        : ''}
                `
            }).then(() => alert.recordNotification('email', process.env.ALERT_EMAIL_RECIPIENTS.split(',')));

            notificationPromises.push(emailPromise);
        }

        // Send SMS notifications
        if (req.body.sms && process.env.ALERT_SMS_RECIPIENTS) {
            const smsPromise = Promise.all(
                process.env.ALERT_SMS_RECIPIENTS.split(',').map(recipient =>
                    twilioClient.messages.create({
                        body: `MV Sigyn ${alert.type.toUpperCase()} Alert: ${alert.resource} at ${alert.level}%. ${alert.message}`,
                        from: process.env.TWILIO_PHONE_NUMBER,
                        to: recipient
                    })
                )
            ).then(() => alert.recordNotification('sms', process.env.ALERT_SMS_RECIPIENTS.split(',')));

            notificationPromises.push(smsPromise);
        }

        // Record sound notification if requested
        if (req.body.sound) {
            notificationPromises.push(alert.recordNotification('sound'));
        }

        await Promise.all(notificationPromises);

        res.json({
            message: 'Alert notifications sent successfully',
            alert
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to send alert notifications: ' + error.message
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

        const stats = await Alert.aggregate([
            { $match: query },
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
        ]);

        res.json(stats);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch alert statistics: ' + error.message
        });
    }
});

module.exports = router;
