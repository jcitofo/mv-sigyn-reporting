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
            deliveries: engineState.deliveries.slice(-20) // Limit to last 20 deliveries
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
        
        // Limit the number of deliveries stored in memory
        if (engineState.deliveries.length >= 100) {
            engineState.deliveries.shift(); // Remove oldest delivery
        }
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
let lastConsumptionTime = Date.now();
const CONSUMPTION_INTERVAL = 5000; // 5 seconds
const MAX_CONSUMPTION_OPERATIONS = 12; // Maximum number of operations per minute

// Track consumption operations to prevent excessive database operations
let consumptionOperationsCount = 0;
let consumptionRateLimitReset = Date.now() + 60000; // Reset counter every minute

function startResourceConsumption() {
    // Clear any existing interval
    if (consumptionInterval) {
        clearInterval(consumptionInterval);
    }
    
    lastConsumptionTime = Date.now();
    
    // Start consuming resources every 5 seconds
    consumptionInterval = setInterval(async () => {
        try {
            const now = Date.now();
            
            // Check if we've exceeded the rate limit
            if (now > consumptionRateLimitReset) {
                consumptionOperationsCount = 0;
                consumptionRateLimitReset = now + 60000;
            }
            
            if (consumptionOperationsCount >= MAX_CONSUMPTION_OPERATIONS) {
                console.log('Consumption rate limit reached, skipping update');
                return;
            }
            
            // Calculate actual time elapsed since last consumption
            const elapsedSeconds = (now - lastConsumptionTime) / 1000;
            lastConsumptionTime = now;
            
            // Get current consumption rates
            const fuelResource = await Resource.findOne({ type: 'fuel' });
            const oilResource = await Resource.findOne({ type: 'oil' });
            
            if (!fuelResource || !oilResource) return;
            
            const fuelRate = fuelResource.consumptionRate.value;
            const oilRate = oilResource.consumptionRate.value;
            
            // Calculate consumption for actual elapsed time
            const fuelConsumption = (fuelRate / 3600) * elapsedSeconds; // L/h to L/elapsed seconds
            const oilConsumption = (oilRate / 3600) * elapsedSeconds;   // L/h to L/elapsed seconds
            
            // Update engine state
            engineState.fuelTank.current = Math.max(0, engineState.fuelTank.current - fuelConsumption);
            engineState.oilTank.current = Math.max(0, engineState.oilTank.current - oilConsumption);
            
            // Update resource levels with a timeout to prevent long-running operations
            const updatePromise = Promise.all([
                fuelResource.updateLevel(fuelConsumption, 'consumption', 'demo_captain'),
                oilResource.updateLevel(oilConsumption, 'consumption', 'demo_captain')
            ]);
            
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Resource update timed out')), 10000);
            });
            
            await Promise.race([updatePromise, timeoutPromise]);
            consumptionOperationsCount += 2; // Count both resource updates
            
            // Stop engine if resources are depleted
            if (engineState.fuelTank.current <= 0 || engineState.oilTank.current <= 0) {
                engineState.running = false;
                stopResourceConsumption();
            }
        } catch (error) {
            console.error('Error in resource consumption:', error);
            
            // If we encounter an error, slow down the consumption rate temporarily
            if (consumptionInterval) {
                clearInterval(consumptionInterval);
                setTimeout(() => {
                    if (engineState.running) {
                        startResourceConsumption();
                    }
                }, 30000); // Wait 30 seconds before trying again
            }
        }
    }, CONSUMPTION_INTERVAL);
}

function stopResourceConsumption() {
    if (consumptionInterval) {
        clearInterval(consumptionInterval);
        consumptionInterval = null;
    }
}

module.exports = router;
