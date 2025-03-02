const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verify JWT token middleware
const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            throw new Error('No authentication token provided');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
            throw new Error('User not found');
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed: ' + error.message });
    }
};

// Check role middleware
const checkRole = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: 'Access denied: Insufficient permissions' 
            });
        }
        next();
    };
};

// Validate resource access
const validateResourceAccess = (req, res, next) => {
    const { action } = req.body;
    
    // Allow read access to all authenticated users
    if (req.method === 'GET') {
        return next();
    }

    // Check if user has permission to modify settings
    if (['update', 'refill', 'delivery'].includes(action) && !req.user.canModifySettings()) {
        return res.status(403).json({
            error: 'Access denied: Only Captain and Engineer can modify resource settings'
        });
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
