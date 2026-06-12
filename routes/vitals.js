const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// 1. Get All Vitals Logs for current user
router.get('/', async (req, res) => {
  try {
    const logs = await dbQuery.all(
      'SELECT * FROM vitals WHERE user_id = ? ORDER BY timestamp DESC',
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    console.error('Error fetching vitals:', err);
    res.status(500).json({ error: 'Server error retrieving vitals records.' });
  }
});

// 2. Create Vitals Log
router.post('/', async (req, res) => {
  const { id, timestamp, systolic, diastolic, hr, spo2, notes } = req.body;

  if (!timestamp || !systolic || !diastolic || !hr) {
    return res.status(400).json({ error: 'Missing mandatory fields (timestamp, systolic, diastolic, hr).' });
  }

  const recordId = id || `vital-${Date.now()}`;

  try {
    await dbQuery.run(
      `INSERT INTO vitals (id, user_id, timestamp, systolic, diastolic, hr, spo2, notes) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recordId, req.user.id, timestamp, systolic, diastolic, hr, spo2 || null, notes || '']
    );

    const newLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ?', [recordId]);
    res.status(201).json(newLog);
  } catch (err) {
    console.error('Error creating vitals:', err);
    res.status(500).json({ error: 'Server error saving vitals log.' });
  }
});

// 3. Update Vitals Log
router.put('/:id', async (req, res) => {
  const { timestamp, systolic, diastolic, hr, spo2, notes } = req.body;
  const { id } = req.params;

  if (!timestamp || !systolic || !diastolic || !hr) {
    return res.status(400).json({ error: 'Missing mandatory fields.' });
  }

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Vitals record not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE vitals 
       SET timestamp = ?, systolic = ?, diastolic = ?, hr = ?, spo2 = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [timestamp, systolic, diastolic, hr, spo2 || null, notes || '', id, req.user.id]
    );

    const updatedLog = await dbQuery.get('SELECT * FROM vitals WHERE id = ?', [id]);
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
        `INSERT INTO vitals (id, user_id, timestamp, systolic, diastolic, hr, spo2, notes) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.id || `vital-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          req.user.id,
          log.timestamp,
          log.systolic,
          log.diastolic,
          log.hr,
          log.spo2 !== undefined ? log.spo2 : null,
          log.notes || ''
        ]
      );
    }

    res.json({ message: 'Vitals restored successfully.', count: logs.length });
  } catch (err) {
    console.error('Error restoring vitals:', err);
    res.status(500).json({ error: 'Server error restoring vitals backup.' });
  }
});

module.exports = router;
