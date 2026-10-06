const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createVitalsSchema, updateVitalsSchema } = require('../schemas/vitals.schema');
const { upsertLogEmbedding, deleteLogEmbedding } = require('../services/vectorStore');
const { getCache, setCache, invalidateCache } = require('../services/cache');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// Multer — memory storage for CSV import (no disk writes)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// 1. Get All Vitals Logs for current user
router.get('/', async (req, res) => {
  try {
    const cacheKey = `vitals:list:${req.user.id}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const logs = await dbQuery.all(
      'SELECT * FROM vitals WHERE user_id = ? ORDER BY timestamp DESC',
      [req.user.id]
    );
    
    await setCache(cacheKey, logs, 300); // 5 minutes
    res.json(logs);
  } catch (err) {
    console.error('Error fetching vitals:', err);
    res.status(500).json({ error: 'Server error retrieving vitals records.' });
  }
});

// 2. Create Vitals Log
router.post('/', validate(createVitalsSchema), async (req, res) => {
  const { id, timestamp, systolic, diastolic, hr, spo2, temperature, temperature_unit, notes } = req.body;
  const recordId = id || `vital-${Date.now()}`;

  try {
    await dbQuery.run(
      `INSERT INTO vitals (id, user_id, timestamp, systolic, diastolic, hr, spo2, temperature, temperature_unit, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recordId, req.user.id, timestamp, systolic, diastolic, hr, spo2 || null, temperature || null, temperature_unit || null, notes || '']
    );

    const newLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ?', [recordId]);

    // Embed for RAG (fire-and-forget)
    upsertLogEmbedding(recordId, req.user.id, 'vitals', newLog);
    
    await invalidateCache(`vitals:*:${req.user.id}`);

    res.status(201).json(newLog);
  } catch (err) {
    console.error('Error creating vitals:', err);
    res.status(500).json({ error: 'Server error saving vitals log.' });
  }
});

// 3. Update Vitals Log
router.put('/:id', validate(updateVitalsSchema), async (req, res) => {
  const { timestamp, systolic, diastolic, hr, spo2, temperature, temperature_unit, notes } = req.body;
  const { id } = req.params;

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Vitals record not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE vitals 
       SET timestamp = ?, systolic = ?, diastolic = ?, hr = ?, spo2 = ?, temperature = ?, temperature_unit = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [timestamp, systolic, diastolic, hr, spo2 || null, temperature || null, temperature_unit || null, notes || '', id, req.user.id]
    );

    const updatedLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ?', [id]);

    // Re-embed for RAG
    upsertLogEmbedding(id, req.user.id, 'vitals', updatedLog);

    await invalidateCache(`vitals:*:${req.user.id}`);

    res.json(updatedLog);
  } catch (err) {
    console.error('Error updating vitals:', err);
    res.status(500).json({ error: 'Server error updating vitals log.' });
  }
});

// 4. Delete Vitals Log
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Vitals record not found or access denied.' });
    }

    await dbQuery.run('DELETE FROM vitals WHERE id = ? AND user_id = ?', [id, req.user.id]);
    deleteLogEmbedding(id);
    
    await invalidateCache(`vitals:*:${req.user.id}`);

    res.json({ message: 'Vitals record deleted successfully.', id });
  } catch (err) {
    console.error('Error deleting vitals:', err);
    res.status(500).json({ error: 'Server error deleting vitals log.' });
  }
});

// 5. Restore Vitals Backup (Bulk Insert)
router.post('/restore', async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Logs array is required.' });
  }

  try {
    // Clear existing vitals logs for this user
    await dbQuery.run('DELETE FROM vitals WHERE user_id = ?', [req.user.id]);

    // Bulk insert new logs
    for (const log of logs) {
      await dbQuery.run(
        `INSERT INTO vitals (id, user_id, timestamp, systolic, diastolic, hr, spo2, temperature, temperature_unit, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id || `vital-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          req.user.id,
          log.timestamp,
          log.systolic,
          log.diastolic,
          log.hr,
          log.spo2 !== undefined ? log.spo2 : null,
          log.temperature !== undefined ? log.temperature : null,
          log.temperature_unit || null,
          log.notes || ''
        ]
      );
    }

    await invalidateCache(`vitals:*:${req.user.id}`);

    res.json({ message: 'Vitals restored successfully.', count: logs.length });
  } catch (err) {
    console.error('Error restoring vitals:', err);
    res.status(500).json({ error: 'Server error restoring vitals backup.' });
  }
});

// 6. Get Vitals Trends
router.get('/trends', async (req, res) => {
  try {
    const cacheKey = `vitals:trends:${req.user.id}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const logs = await dbQuery.all(
      'SELECT timestamp, systolic, diastolic, hr FROM vitals WHERE user_id = ? ORDER BY timestamp DESC LIMIT 30',
      [req.user.id]
    );

    const alerts = [];
    if (logs.length > 0) {
      // Calculate averages for recent (up to 7) logs
      const recentLogs = logs.slice(0, 7);
      const avgSys = recentLogs.reduce((acc, log) => acc + log.systolic, 0) / recentLogs.length;
      const avgDia = recentLogs.reduce((acc, log) => acc + log.diastolic, 0) / recentLogs.length;
      const avgHr = recentLogs.reduce((acc, log) => acc + log.hr, 0) / recentLogs.length;

      // Basic threshold checks based on averages
      if (avgSys >= 140 || avgDia >= 90) {
        alerts.push({ type: 'warning', message: 'Recent blood pressure averages are high (Stage 2 Hypertension).' });
      } else if (avgSys >= 130 || avgDia >= 80) {
        alerts.push({ type: 'info', message: 'Recent blood pressure averages are slightly elevated (Stage 1 Hypertension).' });
      } else if (avgSys < 90 || avgDia < 60) {
        alerts.push({ type: 'warning', message: 'Recent blood pressure averages are low (Hypotension).' });
      }

      if (avgHr > 100) {
        alerts.push({ type: 'warning', message: 'Recent resting heart rate averages are high (Tachycardia).' });
      } else if (avgHr < 60) {
        alerts.push({ type: 'warning', message: 'Recent resting heart rate averages are low (Bradycardia).' });
      }

      // Check for extreme recent single values (last 2 logs)
      const latestLogs = logs.slice(0, 2);
      for (const log of latestLogs) {
        if (log.systolic >= 180 || log.diastolic >= 120) {
          alerts.push({ type: 'danger', message: 'CRITICAL: Very high blood pressure detected in a recent reading. Consult a doctor immediately.' });
          break;
        }
      }
    }

    await setCache(cacheKey, { alerts }, 300);
    res.json({ alerts });
  } catch (err) {
    console.error('Error fetching vitals trends:', err);
    res.status(500).json({ error: 'Server error retrieving vitals trends.' });
  }
});

// 7. CSV Wearable Import
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file uploaded. Send a multipart/form-data request with field name "file".' });
  }

  try {
    const csvText = req.file.buffer.toString('utf-8');
    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return res.status(400).json({ error: 'CSV file is empty or has no data rows.' });
    }

    const inserted = [];
    const errors = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2; // +2 for 1-indexed + header row

      // Map flexible column names
      const timestamp = row.timestamp || row.date || row.datetime || row.time;
      const systolic = parseInt(row.systolic || row.sys || row.sbp, 10);
      const diastolic = parseInt(row.diastolic || row.dia || row.dbp, 10);
      const hr = parseInt(row.hr || row.heart_rate || row.pulse, 10);
      const spo2 = row.spo2 || row.oxygen || row.sp_o2 ? parseInt(row.spo2 || row.oxygen || row.sp_o2, 10) : null;
      const notes = row.notes || row.note || row.comment || '';

      if (!timestamp || isNaN(systolic) || isNaN(diastolic) || isNaN(hr)) {
        errors.push({ row: rowNum, error: 'Missing or invalid required columns (timestamp, systolic, diastolic, hr).' });
        continue;
      }

      const recordId = `vital-csv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      try {
        await dbQuery.run(
          `INSERT INTO vitals (id, user_id, timestamp, systolic, diastolic, hr, spo2, notes) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [recordId, req.user.id, new Date(timestamp).toISOString(), systolic, diastolic, hr, spo2, notes]
        );
        const newLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ?', [recordId]);
        upsertLogEmbedding(recordId, req.user.id, 'vitals', newLog);
        inserted.push(recordId);
      } catch (rowErr) {
        errors.push({ row: rowNum, error: rowErr.message });
      }
    }

    if (inserted.length > 0) {
      await invalidateCache(`vitals:*:${req.user.id}`);
    }

    res.json({
      message: `CSV import complete. ${inserted.length} records imported, ${errors.length} skipped.`,
      imported: inserted.length,
      skipped: errors.length,
      errors: errors.slice(0, 10) // Return first 10 errors max
    });
  } catch (err) {
    console.error('Error processing CSV import:', err);
    res.status(400).json({ error: `Failed to parse CSV: ${err.message}` });
  }
});

module.exports = router;
