const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['captain', 'engineer', 'crew'],
        default: 'crew'
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    phone: {
        type: String,
        trim: true
    },
    alertPreferences: {
        email: {
            type: Boolean,
            default: true
        },
        sms: {
            type: Boolean,
            default: false
        },
        sound: {
            type: Boolean,
            default: true
        }
    },
    thresholds: {
        fuel: {
            warning: {
                type: Number,
                default: 35
            },
            critical: {
                type: Number,
                default: 20
            }
        },
        oil: {
            warning: {
                type: Number,
                default: 35
            },
            critical: {
                type: Number,
                default: 20
            }
        },
        food: {
            warning: {
                type: Number,
                default: 35
            },
            critical: {
                type: Number,
                default: 20
            }
        },
        water: {
            warning: {
                type: Number,
                default: 35
            },
            critical: {
                type: Number,
                default: 20
            }
        }
    },
    lastLogin: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to check if user can modify settings
userSchema.methods.canModifySettings = function() {
    return ['captain', 'engineer'].includes(this.role);
};

module.exports = mongoose.model('User', userSchema);
