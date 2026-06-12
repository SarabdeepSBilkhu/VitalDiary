require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS (helpful for development on multiple ports)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Initialize Database Table Structures
initDatabase();

// API Routers
app.use('/api/auth', require('./routes/auth'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/glucose', require('./routes/glucose'));

// Serve Frontend Static Build Assets in Production
const clientBuildPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientBuildPath));

// Fallback Route: Serve index.html for Single Page App client-side routing
app.get('*', (req, res) => {
  // If the file exists, it will serve, otherwise serve root index.html
  res.sendFile(path.join(clientBuildPath, 'index.html'), (err) => {
    if (err) {
      // In development when client build doesn't exist yet, return a simple welcome message
      res.status(200).send('VitalDiary API Server is active. React Client build not found in client/dist yet.');
    }
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
