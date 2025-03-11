const express = require('express');
const mongoose = require('mongoose');
const Resource = require('../models/Resource');
const Alert = require('../models/Alert');
const { auth, validateResourceAccess, checkRole } = require('../middleware/auth');

const router = express.Router();

// Get all resources status
router.get('/status', auth, async (req, res) => {
    try {
        const resources = await Resource.getResourcesStatus();
        res.json(resources);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch resources status: ' + error.message
        });
    }
});

// Get specific resource details
router.get('/:type', auth, async (req, res) => {
    try {
        const resource = await Resource.findOne({ type: req.params.type });
        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }
        res.json(resource);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch resource: ' + error.message
        });
    }
});

// Update resource level
router.patch('/:type/level', auth, validateResourceAccess, async (req, res) => {
    try {
        const { amount, action } = req.body;
        const resource = await Resource.findOne({ type: req.params.type });

        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }

        const newLevel = await resource.updateLevel(amount, action, req.user._id);

        // Check if we need to create alerts
        const userThresholds = req.user.thresholds[req.params.type];
        if (newLevel <= userThresholds.critical) {
            await Alert.createAlert({
                resource: req.params.type,
                type: 'critical',
                level: newLevel,
                message: `${req.params.type} level critically low at ${newLevel}%`,
                consumptionRate: resource.consumptionRate,
                estimatedDepletion: new Date(Date.now() + (newLevel / resource.consumptionRate.value) * 3600000)
            });
        } else if (newLevel <= userThresholds.warning) {
            await Alert.createAlert({
                resource: req.params.type,
                type: 'warning',
                level: newLevel,
                message: `${req.params.type} level low at ${newLevel}%`,
                consumptionRate: resource.consumptionRate,
                estimatedDepletion: new Date(Date.now() + (newLevel / resource.consumptionRate.value) * 3600000)
            });
        }

        res.json({
            message: 'Resource level updated successfully',
            currentLevel: newLevel
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to update resource level: ' + error.message
        });
    }
});

// Record resource delivery
router.post('/:type/delivery', auth, validateResourceAccess, async (req, res) => {
    try {
        const { amount, document } = req.body;
        const resource = await Resource.findOne({ type: req.params.type });

        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }

        const newLevel = await resource.recordDelivery(amount, document, req.user._id);

        res.json({
            message: 'Delivery recorded successfully',
            currentLevel: newLevel
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to record delivery: ' + error.message
        });
    }
});

// Update consumption rate
router.patch('/:type/consumption-rate', auth, checkRole(['captain', 'engineer']), async (req, res) => {
    try {
        const { value, unit } = req.body;
        const resource = await Resource.findOne({ type: req.params.type });

        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }

        resource.consumptionRate = { value, unit };
        await resource.save();

        res.json({
            message: 'Consumption rate updated successfully',
            consumptionRate: resource.consumptionRate
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to update consumption rate: ' + error.message
        });
    }
});

// Get resource history
router.get('/:type/history', auth, async (req, res) => {
    try {
        const { startDate, endDate, limit = 100, page = 1 } = req.query;
        
        // Limit the maximum number of records to prevent excessive data retrieval
        const maxLimit = Math.min(parseInt(limit) || 100, 500);
        const currentPage = parseInt(page) || 1;
        const skip = (currentPage - 1) * maxLimit;
        
        const query = { type: req.params.type };
        
        // Simplified approach using a single query pattern for all cases
        const resource = await Resource.findOne(query)
            .select('type history')
            .lean();
            
        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }
        
        // Filter history entries by date if needed
        let filteredHistory = resource.history || [];
        
        if (startDate || endDate) {
            filteredHistory = filteredHistory.filter(entry => {
                const entryDate = new Date(entry.timestamp);
                let matchesFilter = true;
                
                if (startDate) {
                    matchesFilter = matchesFilter && entryDate >= new Date(startDate);
                }
                
                if (endDate) {
                    matchesFilter = matchesFilter && entryDate <= new Date(endDate);
                }
                
                return matchesFilter;
            });
        }
        
        // Sort by timestamp (newest first)
        filteredHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Get total count for pagination
        const totalCount = filteredHistory.length;
        
        // Apply pagination
        const paginatedHistory = filteredHistory.slice(skip, skip + maxLimit);
        
        // Populate user references
        const userIds = paginatedHistory
            .filter(h => h.updatedBy)
            .map(h => h.updatedBy.toString());
            
        if (userIds.length > 0) {
            const User = mongoose.model('User');
            const users = await User.find({ _id: { $in: userIds } })
                .select('username role')
                .lean();
            
            const userMap = users.reduce((map, user) => {
                map[user._id.toString()] = { username: user.username, role: user.role };
                return map;
            }, {});
            
            paginatedHistory.forEach(h => {
                if (h.updatedBy && userMap[h.updatedBy.toString()]) {
                    h.updatedBy = userMap[h.updatedBy.toString()];
                }
            });
        }
        
        res.json({
            type: resource.type,
            history: paginatedHistory,
            totalCount,
            page: currentPage,
            totalPages: Math.ceil(totalCount / maxLimit)
        });
    } catch (error) {
        console.error('Resource history error:', error);
        res.status(500).json({
            error: 'Failed to fetch resource history: ' + error.message
        });
    }
});

// Get resource deliveries
router.get('/:type/deliveries', auth, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        // Limit the maximum number of records to prevent excessive data retrieval
        const maxLimit = Math.min(parseInt(limit) || 10, 100);
        
        const resource = await Resource.findOne({ type: req.params.type })
            .select('deliveries')
            .slice('deliveries', -maxLimit)
            .populate('deliveries.recordedBy', 'username role')
            .maxTimeMS(30000); // Add a 30-second timeout

        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }

        res.json(resource.deliveries);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch deliveries: ' + error.message
        });
    }
});

module.exports = router;
