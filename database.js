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

let isDbReady = false;

function getDbReady() {
  return isDbReady;
}

// Initialize Tables with a retry mechanism
async function initDatabase(retries = 15, delay = 4000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (isPg) {
        // Test query to ensure connection is live
        await pool.query('SELECT 1');
        console.log('Connected to the PostgreSQL database.');
      } else {
        // SQLite: check connection is live
        await dbQuery.get('SELECT 1');
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

      // 4. Weight Table
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS weight (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          timestamp DATETIME NOT NULL,
          value REAL NOT NULL,
          notes TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // 5. Medical Reports Table
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          timestamp DATETIME NOT NULL,
          report_type TEXT NOT NULL, -- blood, urine, etc.
          title TEXT NOT NULL,
          data TEXT, -- manual typed findings
          notes TEXT,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // 6. Profile Table
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS profiles (
          user_id INTEGER PRIMARY KEY,
          name TEXT,
          age TEXT,
          gender TEXT,
          blood_group TEXT,
          height TEXT,
          allergies TEXT,
          emergency_contact TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // 7. Medications Table
      await dbQuery.run(`
        CREATE TABLE IF NOT EXISTS medications (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          time_of_day TEXT NOT NULL,
          instructions TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
      `);

      // Create indexes for efficient retrieval scoped by user and ordered by time
      await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_vitals_user_time ON vitals(user_id, timestamp DESC)`);
      await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_glucose_user_time ON glucose(user_id, timestamp DESC)`);
      await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_weight_user_time ON weight(user_id, timestamp DESC)`);
      await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_reports_user_time ON reports(user_id, timestamp DESC)`);
      await dbQuery.run(`CREATE INDEX IF NOT EXISTS idx_medications_user_name ON medications(user_id, name)`);

      console.log('Database schemas successfully verified/created.');
      isDbReady = true;
      return; // Database successfully initialized
    } catch (error) {
      console.error(`Database connection attempt ${attempt}/${retries} failed:`, error.message);
      if (attempt === retries) {
        console.error('All initial database connection attempts failed. Switching to infinite background retries...');
        startBackgroundRetries(10000);
        return;
      }
      console.log(`Retrying connection in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Keep retrying in the background so the server doesn't crash on cold start but remains alive
function startBackgroundRetries(delay = 10000) {
  const timer = setInterval(async () => {
    try {
      if (isPg) {
        await pool.query('SELECT 1');
      } else {
        await dbQuery.get('SELECT 1');
      }
      clearInterval(timer);
      console.log('Database connected on background retry. Re-running initialization...');
      // Re-run initialization (which sets isDbReady = true upon success)
      await initDatabase(1, 0);
    } catch (err) {
      console.error('Background database connection retry failed:', err.message);
    }
  }, delay);
}

module.exports = {
  db: isPg ? pool : db,
  dbQuery,
  initDatabase,
  getDbReady
};
