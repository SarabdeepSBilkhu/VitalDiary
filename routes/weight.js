const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// 1. Get All Weight Logs for current user
router.get('/', async (req, res) => {
  try {
    const logs = await dbQuery.all(
      'SELECT * FROM weight WHERE user_id = ? ORDER BY timestamp DESC',
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    console.error('Error fetching weight:', err);
    res.status(500).json({ error: 'Server error retrieving weight records.' });
  }
});

// 2. Create Weight Log
router.post('/', async (req, res) => {
  const { id, timestamp, value, notes } = req.body;

  if (!timestamp || !value) {
    return res.status(400).json({ error: 'Missing mandatory fields (timestamp, value).' });
  }

  const recordId = id || `weight-${Date.now()}`;

  try {
    await dbQuery.run(
      `INSERT INTO weight (id, user_id, timestamp, value, notes) 
       VALUES (?, ?, ?, ?, ?)`,
      [recordId, req.user.id, timestamp, value, notes || '']
    );

    const newLog = await dbQuery.get('SELECT * FROM weight WHERE id = ?', [recordId]);
    res.status(201).json(newLog);
  } catch (err) {
    console.error('Error creating weight:', err);
    res.status(500).json({ error: 'Server error saving weight log.' });
  }
});

// 3. Update Weight Log
router.put('/:id', async (req, res) => {
  const { timestamp, value, notes } = req.body;
  const { id } = req.params;

  if (!timestamp || !value) {
    return res.status(400).json({ error: 'Missing mandatory fields.' });
  }

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM weight WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Weight record not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE weight 
       SET timestamp = ?, value = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [timestamp, value, notes || '', id, req.user.id]
    );

    const updatedLog = await dbQuery.get('SELECT * FROM weight WHERE id = ?', [id]);
    res.json(updatedLog);
  } catch (err) {
    console.error('Error updating weight:', err);
    res.status(500).json({ error: 'Server error updating weight log.' });
  }
});

// 4. Delete Weight Log
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM weight WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Weight record not found or access denied.' });
    }

    await dbQuery.run('DELETE FROM weight WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ message: 'Weight record deleted successfully.', id });
  } catch (err) {
    console.error('Error deleting weight:', err);
    res.status(500).json({ error: 'Server error deleting weight log.' });
  }
});

// 5. Restore Weight Backup (Bulk Insert)
router.post('/restore', async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Logs array is required.' });
  }

  try {
    // Clear existing weight logs for this user
    await dbQuery.run('DELETE FROM weight WHERE user_id = ?', [req.user.id]);

    // Bulk insert new logs
    for (const log of logs) {
      await dbQuery.run(
        `INSERT INTO weight (id, user_id, timestamp, value, notes) 
         VALUES (?, ?, ?, ?, ?)`,
        [
          log.id || `weight-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          req.user.id,
          log.timestamp,
          log.value,
          log.notes || ''
        ]
      );
    }

    res.json({ message: 'Weight restored successfully.', count: logs.length });
  } catch (err) {
    console.error('Error restoring weight:', err);
    res.status(500).json({ error: 'Server error restoring weight backup.' });
  }
});

module.exports = router;
