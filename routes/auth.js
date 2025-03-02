const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, password, email, role, phone } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ username }, { email }] 
        });
        
        if (existingUser) {
            return res.status(400).json({
                error: 'Username or email already exists'
            });
        }

        // Create new user
        const user = new User({
            username,
            password,
            email,
            role,
            phone
        });

        await user.save();

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Registration failed: ' + error.message
        });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // Find user
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({
                error: 'Invalid username or password'
            });
        }

        // Check password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Invalid username or password'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                alertPreferences: user.alertPreferences,
                thresholds: user.thresholds
            }
        });
    } catch (error) {
        res.status(500).json({
            error: 'Login failed: ' + error.message
        });
    }
});

// Get current user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json(user);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch profile: ' + error.message
        });
    }
});

// Update user preferences
router.patch('/preferences', auth, async (req, res) => {
    try {
        const { alertPreferences, thresholds } = req.body;
        const user = req.user;

        if (alertPreferences) {
            user.alertPreferences = {
                ...user.alertPreferences,
                ...alertPreferences
            };
        }

        if (thresholds && user.canModifySettings()) {
            user.thresholds = {
                ...user.thresholds,
                ...thresholds
            };
        }

        await user.save();
        res.json({
            message: 'Preferences updated successfully',
            alertPreferences: user.alertPreferences,
            thresholds: user.thresholds
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to update preferences: ' + error.message
        });
    }
});

// Logout (invalidate token)
router.post('/logout', auth, async (req, res) => {
    try {
        // In a production environment, you would also add the token
        // to a blacklist or use Redis to track invalidated tokens
        res.json({ message: 'Logged out successfully' });
    } catch (error) {
        res.status(500).json({
            error: 'Logout failed: ' + error.message
        });
    }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = req.user;

        // Verify current password
        const isValidPassword = await user.comparePassword(currentPassword);
        if (!isValidPassword) {
            return res.status(401).json({
                error: 'Current password is incorrect'
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to change password: ' + error.message
        });
    }
});

module.exports = router;
