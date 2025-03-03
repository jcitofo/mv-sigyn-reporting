const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');

// Import routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const alertRoutes = require('./routes/alerts');
const engineRoutes = require('./routes/engine');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Initialize resources if they don't exist
const Resource = require('./models/Resource');
async function initializeResources() {
    const resources = ['fuel', 'oil', 'food', 'water'];
    const initialData = {
        fuel: {
            capacity: 10000,
            unit: 'L',
            consumptionRate: { value: 100, unit: 'L/h' }
        },
        oil: {
            capacity: 1000,
            unit: 'L',
            consumptionRate: { value: 10, unit: 'L/h' }
        },
        food: {
            capacity: 5000,
            unit: 'kg',
            consumptionRate: { value: 50, unit: 'kg/day' }
        },
        water: {
            capacity: 8000,
            unit: 'L',
            consumptionRate: { value: 200, unit: 'L/day' }
        }
    };

    for (const type of resources) {
        const exists = await Resource.findOne({ type });
        if (!exists) {
            const resource = new Resource({
                type,
                currentLevel: 80, // Start at 80%
                ...initialData[type]
            });
            await resource.save();
            console.log(`Initialized ${type} resource`);
        }
    }
}

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');

    // Send initial resource data
    Resource.find().then(resources => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'resource_update',
                resources: resources.reduce((acc, r) => ({
                    ...acc,
                    [r.type]: {
                        level: r.currentLevel,
                        capacity: r.capacity,
                        unit: r.unit,
                        consumptionRate: r.consumptionRate
                    }
                }), {})
            }));
        }
    }).catch(err => {
        console.error('Error sending initial resource data:', err);
    });

    // Handle client messages
    ws.on('message', (message) => {
        try {
            console.log('Received:', message.toString());
            const data = JSON.parse(message.toString());
            
            // Handle client messages if needed
            if (data.type === 'ping') {
                ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Broadcast resource updates to all connected clients
function broadcastResourceUpdate(resources) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
                type: 'resource_update',
                resources
            }));
        }
    });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/engine', engineRoutes);

// Weather data endpoint with OpenWeatherMap integration
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        
        // For demo purposes, return mock weather data instead of making an API call
        const mockWeatherData = {
            coord: { lon: parseFloat(lon), lat: parseFloat(lat) },
            weather: [{ id: 800, main: 'Clear', description: 'clear sky', icon: '01d' }],
            base: 'stations',
            main: {
                temp: 28.5,
                feels_like: 30.2,
                temp_min: 26.8,
                temp_max: 30.1,
                pressure: 1012,
                humidity: 65
            },
            visibility: 10000,
            wind: { speed: 5.2, deg: 120 },
            clouds: { all: 5 },
            dt: Date.now() / 1000,
            sys: {
                type: 2,
                id: 2000,
                country: 'MG',
                sunrise: Date.now() / 1000 - 21600,
                sunset: Date.now() / 1000 + 21600
            },
            timezone: 10800,
            id: 1070940,
            name: 'Antananarivo',
            cod: 200
        };
        
        res.json(mockWeatherData);
    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch weather data',
            message: error.message 
        });
    }
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await initializeResources();
        console.log('Resources initialized');
        
        // Simulate resource updates
        setInterval(async () => {
            const resources = await Resource.find();
            const updates = {};
            
            for (const resource of resources) {
                // Simulate consumption
                const rate = resource.consumptionRate.value;
                const timeUnit = resource.consumptionRate.unit.includes('day') ? 24 * 60 * 60 : 60 * 60;
                const consumption = (rate / timeUnit) * 5; // 5-second interval
                
                resource.currentLevel = Math.max(0, resource.currentLevel - consumption);
                await resource.save();
                
                updates[resource.type] = {
                    level: resource.currentLevel,
                    capacity: resource.capacity,
                    unit: resource.unit,
                    consumptionRate: resource.consumptionRate
                };
            }
            
            broadcastResourceUpdate(updates);
        }, 5000);
    } catch (error) {
        console.error('Error initializing resources:', error);
    }
});
