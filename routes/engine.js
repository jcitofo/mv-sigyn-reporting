const express = require('express');
const Resource = require('../models/Resource');
const { auth, validateResourceAccess, checkRole } = require('../middleware/auth');

const router = express.Router();

// Engine state (in-memory for demo)
const engineState = {
    running: false,
    startTime: null,
    engineHours: 0,
    fuelTank: {
        current: 8000,  // 80% of capacity
        capacity: 10000
    },
    oilTank: {
        current: 800,   // 80% of capacity
        capacity: 1000
    },
    deliveries: []
};

// Get engine status
router.get('/status', auth, async (req, res) => {
    try {
        // Calculate engine hours if running
        if (engineState.running && engineState.startTime) {
            const now = new Date();
            const elapsedHours = (now - engineState.startTime) / (1000 * 60 * 60);
            engineState.engineHours += elapsedHours;
            engineState.startTime = now;
        }

        res.json({
            runningStatus: engineState.running,
            engineHours: engineState.engineHours,
            fuelTank: engineState.fuelTank,
            oilTank: engineState.oilTank,
            deliveries: engineState.deliveries
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch engine status: ' + error.message
        });
    }
});

// Toggle engine state
router.post('/toggle', auth, checkRole(['captain', 'engineer']), async (req, res) => {
    try {
        // Toggle engine state
        engineState.running = !engineState.running;
        
        // Update start time if engine is turned on
        if (engineState.running) {
            engineState.startTime = new Date();
            
            // Start consuming resources
            startResourceConsumption();
        } else {
            // Stop consuming resources
            stopResourceConsumption();
        }
        
        res.json({
            status: engineState.running,
            message: engineState.running ? 'Engine started' : 'Engine stopped'
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to toggle engine: ' + error.message
        });
    }
});

// Update consumption rates
router.post('/consumption', auth, checkRole(['captain', 'engineer']), async (req, res) => {
    try {
        const { fuelRate, oilRate } = req.body;
        
        // Update resource consumption rates
        await Resource.findOneAndUpdate(
            { type: 'fuel' },
            { 'consumptionRate.value': fuelRate }
        );
        
        await Resource.findOneAndUpdate(
            { type: 'oil' },
            { 'consumptionRate.value': oilRate }
        );
        
        res.json({
            message: 'Consumption rates updated successfully',
            fuelRate,
            oilRate
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to update consumption rates: ' + error.message
        });
    }
});

// Record delivery
router.post('/delivery', auth, validateResourceAccess, async (req, res) => {
    try {
        const { type, amount, document } = req.body;
        
        if (!['fuel', 'oil'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid resource type'
            });
        }
        
        if (!amount || amount <= 0) {
            return res.status(400).json({
                error: 'Amount must be greater than 0'
            });
        }
        
        // Record delivery
        const delivery = {
            type,
            amount,
            document,
            timestamp: new Date()
        };
        
        engineState.deliveries.push(delivery);
        
        // Update resource level
        const resource = await Resource.findOne({ type });
        if (resource) {
            await resource.recordDelivery(amount, document, req.user._id);
        }
        
        // Update engine state
        if (type === 'fuel') {
            engineState.fuelTank.current = Math.min(
                engineState.fuelTank.current + amount,
                engineState.fuelTank.capacity
            );
        } else if (type === 'oil') {
            engineState.oilTank.current = Math.min(
                engineState.oilTank.current + amount,
                engineState.oilTank.capacity
            );
        }
        
        res.json({
            message: 'Delivery recorded successfully',
            delivery
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to record delivery: ' + error.message
        });
    }
});

// Resource consumption simulation
let consumptionInterval;

function startResourceConsumption() {
    // Clear any existing interval
    if (consumptionInterval) {
        clearInterval(consumptionInterval);
    }
    
    // Start consuming resources every 5 seconds
    consumptionInterval = setInterval(async () => {
        try {
            // Get current consumption rates
            const fuelResource = await Resource.findOne({ type: 'fuel' });
            const oilResource = await Resource.findOne({ type: 'oil' });
            
            if (!fuelResource || !oilResource) return;
            
            const fuelRate = fuelResource.consumptionRate.value;
            const oilRate = oilResource.consumptionRate.value;
            
            // Calculate consumption for 5 seconds
            const fuelConsumption = (fuelRate / 3600) * 5; // L/h to L/5s
            const oilConsumption = (oilRate / 3600) * 5;   // L/h to L/5s
            
            // Update engine state
            engineState.fuelTank.current = Math.max(0, engineState.fuelTank.current - fuelConsumption);
            engineState.oilTank.current = Math.max(0, engineState.oilTank.current - oilConsumption);
            
            // Update resource levels
            await fuelResource.updateLevel(fuelConsumption, 'consumption', 'system');
            await oilResource.updateLevel(oilConsumption, 'consumption', 'system');
            
            // Stop engine if resources are depleted
            if (engineState.fuelTank.current <= 0 || engineState.oilTank.current <= 0) {
                engineState.running = false;
                stopResourceConsumption();
            }
        } catch (error) {
            console.error('Error in resource consumption:', error);
        }
    }, 5000);
}

function stopResourceConsumption() {
    if (consumptionInterval) {
        clearInterval(consumptionInterval);
        consumptionInterval = null;
    }
}

module.exports = router;
