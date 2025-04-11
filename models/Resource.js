const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['fuel', 'oil', 'food', 'water'],
        required: true
    },
    currentLevel: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    capacity: {
        type: Number,
        required: true,
        min: 0
    },
    unit: {
        type: String,
        required: true
    },
    consumptionRate: {
        value: {
            type: Number,
            required: true,
            min: 0
        },
        unit: {
            type: String,
            required: true
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    history: [{
        level: Number,
        timestamp: {
            type: Date,
            default: Date.now
        },
        action: {
            type: String,
            enum: ['consumption', 'refill', 'manual_update']
        },
        amount: Number,
        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    deliveries: [{
        amount: Number,
        timestamp: {
            type: Date,
            default: Date.now
        },
        document: String,
        recordedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    }],
    settings: {
        autoUpdate: {
            type: Boolean,
            default: true
        },
        updateInterval: {
            type: Number,
            default: 5,  // minutes
            min: 1,
            max: 60
        }
    }
});

// Method to calculate remaining duration based on current level and consumption rate
resourceSchema.methods.calculateRemainingDuration = function() {
    if (this.consumptionRate.value === 0) return Infinity;
    
    const currentAmount = (this.currentLevel / 100) * this.capacity;
    const hoursRemaining = currentAmount / this.consumptionRate.value;
    
    return {
        hours: hoursRemaining,
        days: hoursRemaining / 24
    };
};

// Method to update resource level
resourceSchema.methods.updateLevel = async function(amount, action, userId) {
    const oldLevel = this.currentLevel;
    
    if (action === 'refill') {
        const newAmount = (this.currentLevel / 100 * this.capacity) + amount;
        this.currentLevel = Math.min((newAmount / this.capacity) * 100, 100);
    } else if (action === 'consumption') {
        const newAmount = (this.currentLevel / 100 * this.capacity) - amount;
        this.currentLevel = Math.max((newAmount / this.capacity) * 100, 0);
    } else if (action === 'manual_update') {
        // Treat amount as the new absolute quantity
        const newAmount = amount;
        // Convert absolute amount to percentage level, clamping between 0 and 100%
        this.currentLevel = Math.max(0, Math.min((newAmount / this.capacity) * 100, 100));
    } else {
        // Handle unknown actions if necessary, maybe log a warning
        console.warn(`Unknown resource update action received: ${action}`);
        // Avoid changing the level for unknown actions
        return this.currentLevel;
    }

    // Ensure amount is a valid number before pushing to history
    const validAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;

    this.history.push({
        level: this.currentLevel, // The new level after update
        action,
        amount: validAmount, // Store the actual amount value involved in the action
        updatedBy: userId
    });

    this.lastUpdated = new Date();
    await this.save();
    
    return this.currentLevel;
};

// Method to record a delivery
resourceSchema.methods.recordDelivery = async function(amount, document, userId) {
    this.deliveries.push({
        amount,
        document,
        recordedBy: userId
    });
    
    await this.updateLevel(amount, 'refill', userId);
    return this.currentLevel;
};

// Static method to get all resources with their current status
resourceSchema.statics.getResourcesStatus = async function() {
    const resources = await this.find()
        .select('-history -deliveries')
        .lean();
    
    return resources.reduce((acc, resource) => {
        acc[resource.type] = {
            level: resource.currentLevel,
            capacity: resource.capacity,
            unit: resource.unit,
            consumptionRate: resource.consumptionRate,
            lastUpdated: resource.lastUpdated
        };
        return acc;
    }, {});
};

module.exports = mongoose.model('Resource', resourceSchema);
