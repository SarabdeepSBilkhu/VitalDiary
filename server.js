require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, getDbReady } = require('./database');
const { authLimiter, aiLimiter } = require('./middleware/rateLimiter');
const auditLog = require('./middleware/auditLog');
const { initVectorStore } = require('./services/vectorStore');
const cron = require('node-cron');
const { runAllWeeklySummaries } = require('./services/weeklySummary');
const { initReminders } = require('./services/reminders');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS (helpful for development on multiple ports)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Global Audit Log for write operations
app.use(auditLog);

// Database readiness check middleware to handle cold starts cleanly
app.use((req, res, next) => {
  if (req.path === '/api/db-status') {
    return res.json({ ready: getDbReady() });
  }
  
  if (req.path.startsWith('/api/') && !getDbReady()) {
    return res.status(503).json({
      status: 'waking_up',
      error: 'Database is warming up. This usually takes 10-25 seconds on a cold start. Please wait...'
    });
  }
  next();
});

// Initialize Database Table Structures
initDatabase();

// Initialize Vector Store (RAG)
initVectorStore();

// Initialize Medication Reminders Cron Jobs
initReminders();

// Schedule Weekly Summaries (Every Monday at 9:00 AM server time)
if (process.env.NODE_ENV !== 'test') {
  cron.schedule('0 9 * * 1', () => {
    runAllWeeklySummaries();
  });
}

// API Routers
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/profile', require('./routes/profile'));
app.use('/api/medications', require('./routes/medications'));
app.use('/api/vitals', require('./routes/vitals'));
app.use('/api/glucose', require('./routes/glucose'));
app.use('/api/weight', require('./routes/weight'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/ai', aiLimiter, require('./routes/ai'));
app.use('/api/admin', require('./routes/admin'));

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

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = app;
