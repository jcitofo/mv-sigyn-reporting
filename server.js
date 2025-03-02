const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const alertRoutes = require('./routes/alerts');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

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

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/resources', resourceRoutes);
app.use('/api/alerts', alertRoutes);

// Weather data endpoint with OpenWeatherMap integration
app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = req.query;
        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`
        );
        
        if (!response.ok) {
            throw new Error('Weather API request failed');
        }
        
        const data = await response.json();
        res.json(data);
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
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    try {
        await initializeResources();
        console.log('Resources initialized');
    } catch (error) {
        console.error('Error initializing resources:', error);
    }
});
