const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    resource: {
        type: String,
        enum: ['fuel', 'oil', 'food', 'water'],
        required: true
    },
    type: {
        type: String,
        enum: ['warning', 'critical'],
        required: true
    },
    level: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    acknowledged: {
        status: {
            type: Boolean,
            default: false
        },
        by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        at: Date
    },
    notifications: {
        email: {
            sent: {
                type: Boolean,
                default: false
            },
            recipients: [{
                type: String
            }],
            sentAt: Date
        },
        sms: {
            sent: {
                type: Boolean,
                default: false
            },
            recipients: [{
                type: String
            }],
            sentAt: Date
        },
        sound: {
            played: {
                type: Boolean,
                default: false
            },
            playedAt: Date
        }
    },
    resolvedAt: Date,
    metadata: {
        consumptionRate: {
            value: Number,
            unit: String
        },
        estimatedDepletion: Date,
        weatherConditions: {
            description: String,
            temperature: Number,
            windSpeed: Number
        }
    }
});

// Index for efficient querying
alertSchema.index({ resource: 1, timestamp: -1 });
alertSchema.index({ type: 1, acknowledged: 1 });

// Method to acknowledge alert
alertSchema.methods.acknowledgeAlert = async function(userId) {
    this.acknowledged = {
        status: true,
        by: userId,
        at: new Date()
    };
    await this.save();
};

// Method to mark alert as resolved
alertSchema.methods.resolveAlert = async function() {
    this.resolvedAt = new Date();
    await this.save();
};

// Method to record notification status
alertSchema.methods.recordNotification = async function(type, recipients = []) {
    const now = new Date();
    
    // Find the latest version of this alert to avoid parallel save errors
    const freshAlert = await mongoose.model('Alert').findById(this._id);
    if (!freshAlert) {
        console.error('Alert not found when trying to record notification');
        return;
    }
    
    switch(type) {
        case 'email':
            freshAlert.notifications.email = {
                sent: true,
                recipients,
                sentAt: now
            };
            break;
        case 'sms':
            freshAlert.notifications.sms = {
                sent: true,
                recipients,
                sentAt: now
            };
            break;
        case 'sound':
            freshAlert.notifications.sound = {
                played: true,
                playedAt: now
            };
            break;
    }
    
    try {
        await freshAlert.save();
        
        // Update this instance to match the saved one
        this.notifications = freshAlert.notifications;
    } catch (error) {
        console.error('Error saving notification status:', error);
    }
};

// Static method to get active alerts
alertSchema.statics.getActiveAlerts = function() {
    return this.find({
        resolvedAt: null,
        'acknowledged.status': false
    })
    .sort('-timestamp')
    .populate('acknowledged.by', 'username role');
};

// Static method to get alerts history
alertSchema.statics.getAlertsHistory = function(filters = {}) {
    const query = {};
    
    if (filters.resource) query.resource = filters.resource;
    if (filters.type) query.type = filters.type;
    if (filters.startDate) query.timestamp = { $gte: filters.startDate };
    if (filters.endDate) query.timestamp = { ...query.timestamp, $lte: filters.endDate };
    
    return this.find(query)
        .sort('-timestamp')
        .populate('acknowledged.by', 'username role')
        .limit(filters.limit || 100);
};

// Static method to create new alert
alertSchema.statics.createAlert = async function(data) {
    const alert = new this({
        resource: data.resource,
        type: data.type,
        level: data.level,
        message: data.message,
        metadata: {
            consumptionRate: data.consumptionRate,
            estimatedDepletion: data.estimatedDepletion,
            weatherConditions: data.weatherConditions
        }
    });
    
    await alert.save();
    return alert;
};

module.exports = mongoose.model('Alert', alertSchema);
