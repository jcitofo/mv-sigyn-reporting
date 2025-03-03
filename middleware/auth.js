const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Bypass authentication for demo purposes
const auth = async (req, res, next) => {
    // Create a demo captain user
    req.user = {
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
        canModifySettings: () => true
    };
    next();
};

// Check role middleware (bypassed for demo)
const checkRole = (roles) => {
    return (req, res, next) => next();
};

// Validate resource access (bypassed for demo)
const validateResourceAccess = (req, res, next) => next();

// Rate limiting middleware
const rateLimit = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
};

module.exports = {
    auth,
    checkRole,
    validateResourceAccess,
    rateLimit
};
