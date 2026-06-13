const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Prioritize private URL for internal communication (faster and doesn't require SSL)
const connectionString = process.env.DATABASE_PRIVATE_URL || process.env.DATABASE_URL;
const isPg = !!connectionString;

let db;
let pool;

if (isPg) {
  // Only use SSL for external public connections (not localhost or internal private domains)
  const useSSL = !connectionString.includes('railway.internal') && 
                 !connectionString.includes('localhost') && 
                 !connectionString.includes('127.0.0.1');
  
  pool = new Pool({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false
  });
  console.log('PostgreSQL pool initialized.');
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

// Initialize Tables with a retry mechanism
async function initDatabase(retries = 6, delay = 4000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (isPg) {
        // Test query to ensure connection is live
        await pool.query('SELECT 1');
        console.log('Connected to the PostgreSQL database.');
      }

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
      return; // Database successfully initialized
    } catch (error) {
      console.error(`Database connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt === retries) {
        console.error('All database connection attempts failed. Exiting process.');
        process.exit(1);
      }
      console.log(`Retrying connection in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

module.exports = {
  db: isPg ? pool : db,
  dbQuery,
  initDatabase
};
