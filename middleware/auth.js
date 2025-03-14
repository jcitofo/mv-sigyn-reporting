const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            // For demo purposes, create a demo captain user if no token is provided
            req.user = {
                _id: 'demo_captain',
                username: 'captain',
                role: 'captain',
                email: 'demo@mvsigyn.com',
                alertPreferences: {
                    email: false,
                    sms: false,
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
            return next();
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        // For demo purposes, create a demo captain user if token verification fails
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
    }
};

// Check role middleware
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Access denied' });
        }
        next();
    };
};

// Validate resource access
const validateResourceAccess = (req, res, next) => {
    // Check if user has permission to modify resources
    if (!req.user.canModifySettings()) {
        return res.status(403).json({ message: 'Access denied' });
    }
    next();
};

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
