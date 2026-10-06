const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const { encrypt, decrypt } = require('../services/encryption');
const { upsertLogEmbedding, deleteLogEmbedding } = require('../services/vectorStore');
const { getCache, setCache, invalidateCache } = require('../services/cache');

// Apply auth middleware to all routes here
router.use(authenticateToken);

/**
 * Decrypt the data field of a report row for API responses.
 */
function decryptReport(row) {
  if (!row) return row;
  return { ...row, data: decrypt(row.data) };
}

// 1. Get All Reports for current user
router.get('/', async (req, res) => {
  try {
    const cacheKey = `reports:list:${req.user.id}`;
    const cachedData = await getCache(cacheKey);
    if (cachedData) return res.json(cachedData);

    const logs = await dbQuery.all(
      'SELECT * FROM reports WHERE user_id = ? ORDER BY timestamp DESC',
      [req.user.id]
    );
    const decryptedLogs = logs.map(decryptReport);
    await setCache(cacheKey, decryptedLogs, 300);
    res.json(decryptedLogs);
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.status(500).json({ error: 'Server error retrieving medical reports.' });
  }
});

// 2. Create Report Log
router.post('/', async (req, res) => {
  const { id, timestamp, report_type, title, data, notes } = req.body;

  if (!timestamp || !report_type) {
    return res.status(400).json({ error: 'Missing mandatory fields (timestamp, report_type).' });
  }

  const recordId = id || `report-${Date.now()}`;
  const reportTitle = title || report_type;
  const encryptedData = encrypt(data || '');

  try {
    await dbQuery.run(
      `INSERT INTO reports (id, user_id, timestamp, report_type, title, data, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [recordId, req.user.id, timestamp, report_type, reportTitle, encryptedData, notes || '']
    );

    const newLog = await dbQuery.get('SELECT * FROM reports WHERE id = ?', [recordId]);

    // Embed for RAG (fire-and-forget)
    upsertLogEmbedding(recordId, req.user.id, 'reports', { ...newLog, data: data || '' });

    await invalidateCache(`reports:*:${req.user.id}`);

    res.status(201).json(decryptReport(newLog));
  } catch (err) {
    console.error('Error creating report:', err);
    res.status(500).json({ error: 'Server error saving medical report.' });
  }
});

// 3. Update Report Log
router.put('/:id', async (req, res) => {
  const { timestamp, report_type, title, data, notes } = req.body;
  const { id } = req.params;

  if (!timestamp || !report_type) {
    return res.status(400).json({ error: 'Missing mandatory fields.' });
  }

  const reportTitle = title || report_type;
  const encryptedData = encrypt(data || '');

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM reports WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE reports 
       SET timestamp = ?, report_type = ?, title = ?, data = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [timestamp, report_type, reportTitle, encryptedData, notes || '', id, req.user.id]
    );

    const updatedLog = await dbQuery.get('SELECT * FROM reports WHERE id = ?', [id]);

    // Re-embed for RAG (fire-and-forget)
    upsertLogEmbedding(id, req.user.id, 'reports', { ...updatedLog, data: data || '' });

    await invalidateCache(`reports:*:${req.user.id}`);

    res.json(decryptReport(updatedLog));
  } catch (err) {
    console.error('Error updating report:', err);
    res.status(500).json({ error: 'Server error updating medical report.' });
  }
});

// 4. Delete Report Log
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM reports WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Report not found or access denied.' });
    }

    await dbQuery.run('DELETE FROM reports WHERE id = ? AND user_id = ?', [id, req.user.id]);
    deleteLogEmbedding(id);

    await invalidateCache(`reports:*:${req.user.id}`);

    res.json({ message: 'Medical report deleted successfully.', id });
  } catch (err) {
    console.error('Error deleting report:', err);
    res.status(500).json({ error: 'Server error deleting medical report.' });
  }
});

// 5. Restore Reports Backup (Bulk Insert)
router.post('/restore', async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Logs array is required.' });
  }

  try {
    // Clear existing reports for this user
    await dbQuery.run('DELETE FROM reports WHERE user_id = ?', [req.user.id]);

    // Bulk insert new logs
    for (const log of logs) {
      const recordId = log.id || `report-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await dbQuery.run(
        `INSERT INTO reports (id, user_id, timestamp, report_type, title, data, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          recordId,
          req.user.id,
          log.timestamp,
          log.report_type,
          log.title || log.report_type,
          encrypt(log.data || ''),
          log.notes || ''
        ]
      );
    }

    await invalidateCache(`reports:*:${req.user.id}`);

    res.json({ message: 'Medical reports restored successfully.', count: logs.length });
  } catch (err) {
    console.error('Error restoring reports:', err);
    res.status(500).json({ error: 'Server error restoring medical reports backup.' });
  }
});

module.exports = router;
