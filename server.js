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

// Default vessel location (Antananarivo, Madagascar)
const defaultVesselLocation = {
    lat: -18.8792,
    lon: 47.5079,
    name: 'Antananarivo',
    country: 'MG'
};

// Current vessel location (can be updated via API)
let currentVesselLocation = { ...defaultVesselLocation };

// Weather data endpoint with OpenWeatherMap integration
app.get('/api/weather', async (req, res) => {
    try {
        // Use provided coordinates or default to current vessel location
        const lat = req.query.lat || currentVesselLocation.lat;
        const lon = req.query.lon || currentVesselLocation.lon;
        
        let weatherData;
        
        // Try to fetch real weather data if API key is available
        if (process.env.OPENWEATHER_API_KEY) {
            try {
                const response = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
                );
                
                if (response.ok) {
                    weatherData = await response.json();
                    
                    // Update vessel location name if available
                    if (weatherData.name) {
                        currentVesselLocation.name = weatherData.name;
                    }
                    if (weatherData.sys && weatherData.sys.country) {
                        currentVesselLocation.country = weatherData.sys.country;
                    }
                    
                    // Cache weather data for alerts
                    latestWeatherData = {
                        description: weatherData.weather[0]?.description || 'Unknown',
                        temperature: weatherData.main?.temp || 0,
                        windSpeed: weatherData.wind?.speed || 0
                    };
                }
            } catch (apiError) {
                console.error('OpenWeatherMap API error:', apiError);
                // Fall back to mock data if API call fails
            }
        }
        
        // If we couldn't get real data, use mock data
        if (!weatherData) {
            weatherData = {
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
                    country: currentVesselLocation.country,
                    sunrise: Date.now() / 1000 - 21600,
                    sunset: Date.now() / 1000 + 21600
                },
                timezone: 10800,
                id: 1070940,
                name: currentVesselLocation.name,
                cod: 200
            };
            
            // Cache weather data for alerts
            latestWeatherData = {
                description: weatherData.weather[0]?.description || 'Unknown',
                temperature: weatherData.main?.temp || 0,
                windSpeed: weatherData.wind?.speed || 0
            };
        }
        
        res.json(weatherData);
    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.status(500).json({ 
            error: 'Failed to fetch weather data',
            message: error.message 
        });
    }
});

// Update vessel location
app.post('/api/location', auth, checkRole(['captain']), async (req, res) => {
    try {
        const { lat, lon, name, country } = req.body;
        
        // Validate coordinates
        if (typeof lat !== 'number' || typeof lon !== 'number' ||
            lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return res.status(400).json({
                error: 'Invalid coordinates'
            });
        }
        
        // Update vessel location
        currentVesselLocation = {
            lat,
            lon,
            name: name || currentVesselLocation.name,
            country: country || currentVesselLocation.country
        };
        
        // Fetch weather data for new location
        let weatherData;
        
        if (process.env.OPENWEATHER_API_KEY) {
            try {
                const response = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
                );
                
                if (response.ok) {
                    weatherData = await response.json();
                    
                    // Update location name if not provided
                    if (!name && weatherData.name) {
                        currentVesselLocation.name = weatherData.name;
                    }
                    if (!country && weatherData.sys && weatherData.sys.country) {
                        currentVesselLocation.country = weatherData.sys.country;
                    }
                    
                    // Cache weather data for alerts
                    latestWeatherData = {
                        description: weatherData.weather[0]?.description || 'Unknown',
                        temperature: weatherData.main?.temp || 0,
                        windSpeed: weatherData.wind?.speed || 0
                    };
                }
            } catch (apiError) {
                console.error('OpenWeatherMap API error:', apiError);
            }
        }
        
        res.json({
            message: 'Vessel location updated successfully',
            location: currentVesselLocation,
            weather: weatherData
        });
    } catch (error) {
        console.error('Error updating vessel location:', error);
        res.status(500).json({
            error: 'Failed to update vessel location',
            message: error.message
        });
    }
});

// Get current vessel location
app.get('/api/location', auth, async (req, res) => {
    res.json(currentVesselLocation);
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

// Track latest weather data for alerts
let latestWeatherData = {
    description: 'clear sky',
    temperature: 28.5,
    windSpeed: 5.2
};

// Resource update tracking
let lastUpdateTime = Date.now();
let updateOperationsCount = 0;
const MAX_UPDATE_OPERATIONS = 20; // Maximum number of operations per minute
let updateRateLimitReset = Date.now() + 60000; // Reset counter every minute

// Request length limits
const MAX_REQUEST_SIZE = 1024 * 1024; // 1MB

// Middleware to limit request size
app.use((req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    
    if (contentLength > MAX_REQUEST_SIZE) {
        return res.status(413).json({
            error: 'Request entity too large',
            message: `Request size exceeds the maximum allowed size of ${MAX_REQUEST_SIZE / 1024}KB`
        });
    }
    
    next();
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await initializeResources();
        console.log('Resources initialized');
        
        // Initialize weather data
        if (process.env.OPENWEATHER_API_KEY) {
            try {
                const response = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${currentVesselLocation.lat}&lon=${currentVesselLocation.lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
                );
                
                if (response.ok) {
                    const weatherData = await response.json();
                    
                    // Update location name
                    if (weatherData.name) {
                        currentVesselLocation.name = weatherData.name;
                    }
                    if (weatherData.sys && weatherData.sys.country) {
                        currentVesselLocation.country = weatherData.sys.country;
                    }
                    
                    // Cache weather data for alerts
                    latestWeatherData = {
                        description: weatherData.weather[0]?.description || 'Unknown',
                        temperature: weatherData.main?.temp || 0,
                        windSpeed: weatherData.wind?.speed || 0
                    };
                    
                    console.log('Weather data initialized');
                }
            } catch (apiError) {
                console.error('OpenWeatherMap API error:', apiError);
            }
        }
        
        // Set up periodic tasks
        
        // 1. Simulate resource updates with rate limiting and error handling
        setInterval(async () => {
            try {
                const now = Date.now();
                
                // Check if we've exceeded the rate limit
                if (now > updateRateLimitReset) {
                    updateOperationsCount = 0;
                    updateRateLimitReset = now + 60000;
                }
                
                if (updateOperationsCount >= MAX_UPDATE_OPERATIONS) {
                    console.log('Update rate limit reached, skipping resource update');
                    return;
                }
                
                // Calculate actual time elapsed since last update
                const elapsedSeconds = (now - lastUpdateTime) / 1000;
                lastUpdateTime = now;
                
                const resources = await Resource.find();
                const updates = {};
                
                // Use Promise.all to process all resources in parallel with a timeout
                const updatePromises = resources.map(async (resource) => {
                    try {
                        // Simulate consumption based on actual elapsed time
                        const rate = resource.consumptionRate.value;
                        const timeUnit = resource.consumptionRate.unit.includes('day') ? 24 * 60 * 60 : 60 * 60;
                        const consumption = (rate / timeUnit) * elapsedSeconds;
                        
                        resource.currentLevel = Math.max(0, resource.currentLevel - consumption);
                        await resource.save();
                        
                        updates[resource.type] = {
                            level: resource.currentLevel,
                            capacity: resource.capacity,
                            unit: resource.unit,
                            consumptionRate: resource.consumptionRate
                        };
                        
                        updateOperationsCount++;
                    } catch (error) {
                        console.error(`Error updating resource ${resource.type}:`, error);
                    }
                });
                
                // Add a timeout to prevent long-running operations
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Resource update timed out')), 10000);
                });
                
                await Promise.race([
                    Promise.all(updatePromises),
                    timeoutPromise
                ]);
                
                // Only broadcast if we have updates
                if (Object.keys(updates).length > 0) {
                    broadcastResourceUpdate(updates);
                }
            } catch (error) {
                console.error('Error in resource update simulation:', error);
            }
        }, 5000);
        
        // 2. Update weather data every 30 minutes
        setInterval(async () => {
            if (process.env.OPENWEATHER_API_KEY) {
                try {
                    const response = await fetch(
                        `https://api.openweathermap.org/data/2.5/weather?lat=${currentVesselLocation.lat}&lon=${currentVesselLocation.lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
                    );
                    
                    if (response.ok) {
                        const weatherData = await response.json();
                        
                        // Cache weather data for alerts
                        latestWeatherData = {
                            description: weatherData.weather[0]?.description || 'Unknown',
                            temperature: weatherData.main?.temp || 0,
                            windSpeed: weatherData.wind?.speed || 0
                        };
                        
                        // Broadcast weather update to connected clients
                        wss.clients.forEach((client) => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify({
                                    type: 'weather_update',
                                    weather: weatherData
                                }));
                            }
                        });
                        
                        console.log('Weather data updated');
                    }
                } catch (apiError) {
                    console.error('OpenWeatherMap API error:', apiError);
                }
            }
        }, 30 * 60 * 1000); // 30 minutes
    } catch (error) {
        console.error('Error initializing resources:', error);
    }
});
