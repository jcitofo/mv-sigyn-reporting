const express = require('express');
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
        const { startDate, endDate, limit = 100 } = req.query;
        const resource = await Resource.findOne({ type: req.params.type });

        if (!resource) {
            return res.status(404).json({
                error: 'Resource not found'
            });
        }

        const query = {};
        if (startDate) query['history.timestamp'] = { $gte: new Date(startDate) };
        if (endDate) query['history.timestamp'] = { ...query['history.timestamp'], $lte: new Date(endDate) };

        const history = await Resource.findOne({ type: req.params.type })
            .select('history')
            .slice('history', -limit)
            .populate('history.updatedBy', 'username role');

        res.json(history);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch resource history: ' + error.message
        });
    }
});

// Get resource deliveries
router.get('/:type/deliveries', auth, async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        const resource = await Resource.findOne({ type: req.params.type })
            .select('deliveries')
            .slice('deliveries', -limit)
            .populate('deliveries.recordedBy', 'username role');

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
