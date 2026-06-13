const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL;
const isPg = !!connectionString;

let db;
let pool;

if (isPg) {
  const ssl = connectionString.includes('localhost') || connectionString.includes('127.0.0.1')
    ? false
    : { rejectUnauthorized: false };
  pool = new Pool({
    connectionString,
    ssl
  });
  console.log('Connected to the PostgreSQL database.');
} else {
  const dbPath = path.join(__dirname, 'vitaldiary.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Database connection failed:', err.message);
    } else {
      console.log('Connected to the SQLite database.');
    }
  });
}

// Convert SQLite style parameterized queries (with '?') to PG style (with '$1, $2...')
function convertSql(sql) {
  if (!isPg) return sql;
  
  let index = 1;
  let converted = sql.replace(/\?/g, () => `$${index++}`);
  
  // Convert SQLite constraints to PostgreSQL equivalents
  converted = converted.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  converted = converted.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
  
  // Append RETURNING id to INSERTs to mimic SQLite lastID behavior
  if (/^\s*insert\s+/i.test(converted) && !/returning/i.test(converted)) {
    converted += ' RETURNING id';
  }
  
  return converted;
}

// Convert callbacks to Promises for cleaner async/await code
const dbQuery = {
  async run(sql, params = []) {
    if (isPg) {
      const convertedSql = convertSql(sql);
      const res = await pool.query(convertedSql, params);
      const lastID = res.rows[0] ? res.rows[0].id : null;
      return { lastID, changes: res.rowCount };
    } else {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  },
  async get(sql, params = []) {
    if (isPg) {
      const convertedSql = convertSql(sql);
      const res = await pool.query(convertedSql, params);
      return res.rows[0];
    } else {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    }
  },
  async all(sql, params = []) {
    if (isPg) {
      const convertedSql = convertSql(sql);
      const res = await pool.query(convertedSql, params);
      return res.rows;
    } else {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    }
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
  db: isPg ? pool : db,
  dbQuery,
  initDatabase
};
