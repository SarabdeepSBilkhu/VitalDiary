const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'vitaldiary.db');
const dbExists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Convert callbacks to Promises for cleaner async/await code
const dbQuery = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

// Initialize Tables
async function initDatabase() {
  try {
    // 1. Users Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. Vitals Table (Blood pressure, heart rate, spo2)
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS vitals (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        systolic INTEGER NOT NULL,
        diastolic INTEGER NOT NULL,
        hr INTEGER NOT NULL,
        spo2 INTEGER,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 3. Blood Glucose Table
    await dbQuery.run(`
      CREATE TABLE IF NOT EXISTS glucose (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        timestamp DATETIME NOT NULL,
        value INTEGER NOT NULL,
        context TEXT NOT NULL, -- fasting, pre-meal, post-meal
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // Create indexes for efficient retrieval scoped by user and ordered by time
    await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_vitals_user_time ON vitals(user_id, timestamp DESC)`);
    await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_glucose_user_time ON glucose(user_id, timestamp DESC)`);

    console.log('Database schemas successfully verified/created.');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
  }
}

module.exports = {
  db,
  dbQuery,
  initDatabase
};
