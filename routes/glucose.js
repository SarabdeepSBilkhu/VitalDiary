const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// 1. Get All Glucose Logs for current user
router.get('/', async (req, res) => {
  try {
    const logs = await dbQuery.all(
      'SELECT * FROM glucose WHERE user_id = ? ORDER BY timestamp DESC',
      [req.user.id]
    );
    res.json(logs);
  } catch (err) {
    console.error('Error fetching glucose:', err);
    res.status(500).json({ error: 'Server error retrieving glucose records.' });
  }
});

// 2. Create Glucose Log
router.post('/', async (req, res) => {
  const { id, timestamp, value, context, notes } = req.body;

  if (!timestamp || !value || !context) {
    return res.status(400).json({ error: 'Missing mandatory fields (timestamp, value, context).' });
  }

  const recordId = id || `glucose-${Date.now()}`;

  try {
    await dbQuery.run(
      `INSERT INTO glucose (id, user_id, timestamp, value, context, notes) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [recordId, req.user.id, timestamp, value, context, notes || '']
    );

    const newLog = await dbQuery.get('SELECT * FROM glucose WHERE id = ?', [recordId]);
    res.status(201).json(newLog);
  } catch (err) {
    console.error('Error creating glucose:', err);
    res.status(500).json({ error: 'Server error saving glucose log.' });
  }
});

// 3. Update Glucose Log
router.put('/:id', async (req, res) => {
  const { timestamp, value, context, notes } = req.body;
  const { id } = req.params;

  if (!timestamp || !value || !context) {
    return res.status(400).json({ error: 'Missing mandatory fields.' });
  }

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM glucose WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Glucose record not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE glucose 
       SET timestamp = ?, value = ?, context = ?, notes = ? 
       WHERE id = ? AND user_id = ?`,
      [timestamp, value, context, notes || '', id, req.user.id]
    );

    const updatedLog = await dbQuery.get('SELECT * FROM glucose WHERE id = ?', [id]);
    res.json(updatedLog);
  } catch (err) {
    console.error('Error updating glucose:', err);
    res.status(500).json({ error: 'Server error updating glucose log.' });
  }
});

// 4. Delete Glucose Log
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Verify ownership
    const existingLog = await dbQuery.get('SELECT * FROM glucose WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingLog) {
      return res.status(404).json({ error: 'Glucose record not found or access denied.' });
    }

    await dbQuery.run('DELETE FROM glucose WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ message: 'Glucose record deleted successfully.', id });
  } catch (err) {
    console.error('Error deleting glucose:', err);
    res.status(500).json({ error: 'Server error deleting glucose log.' });
  }
});

// 5. Restore Glucose Backup (Bulk Insert)
router.post('/restore', async (req, res) => {
  const { logs } = req.body;

  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Logs array is required.' });
  }

  try {
    // Clear existing glucose logs for this user
    await dbQuery.run('DELETE FROM glucose WHERE user_id = ?', [req.user.id]);

    // Bulk insert new logs
    for (const log of logs) {
      await dbQuery.run(
        `INSERT INTO glucose (id, user_id, timestamp, value, context, notes) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          log.id || `glucose-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          req.user.id,
          log.timestamp,
          log.value,
          log.context,
          log.notes || ''
        ]
      );
    }

    res.json({ message: 'Glucose restored successfully.', count: logs.length });
  } catch (err) {
    console.error('Error restoring glucose:', err);
    res.status(500).json({ error: 'Server error restoring glucose backup.' });
  }
});

module.exports = router;
