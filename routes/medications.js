const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

router.use(authenticateToken);

const normalizeTimeOfDay = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return [value];
    }
  }

  return [];
};

const mapMedicationRow = (row) => ({
  id: row.id,
  name: row.name,
  timeOfDay: normalizeTimeOfDay(row.time_of_day),
  instructions: row.instructions || '',
});

router.get('/', async (req, res) => {
  try {
    const medications = await dbQuery.all(
      'SELECT * FROM medications WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(medications.map(mapMedicationRow));
  } catch (err) {
    console.error('Error fetching medications:', err);
    res.status(500).json({ error: 'Server error retrieving medications.' });
  }
});

router.post('/', async (req, res) => {
  const { id, name, timeOfDay, instructions } = req.body;

  if (!name || !Array.isArray(timeOfDay) || timeOfDay.length === 0) {
    return res.status(400).json({ error: 'Medication name and at least one time of day are required.' });
  }

  const recordId = id || `med-${Date.now()}`;

  try {
    await dbQuery.run(
      `INSERT INTO medications (id, user_id, name, time_of_day, instructions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [recordId, req.user.id, name.trim(), JSON.stringify(timeOfDay), instructions || '']
    );

    const savedMedication = await dbQuery.get('SELECT * FROM medications WHERE id = ?', [recordId]);
    res.status(201).json(mapMedicationRow(savedMedication));
  } catch (err) {
    console.error('Error creating medication:', err);
    res.status(500).json({ error: 'Server error saving medication.' });
  }
});

router.put('/:id', async (req, res) => {
  const { name, timeOfDay, instructions } = req.body;
  const { id } = req.params;

  if (!name || !Array.isArray(timeOfDay) || timeOfDay.length === 0) {
    return res.status(400).json({ error: 'Medication name and at least one time of day are required.' });
  }

  try {
    const existingMedication = await dbQuery.get('SELECT * FROM medications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingMedication) {
      return res.status(404).json({ error: 'Medication not found or access denied.' });
    }

    await dbQuery.run(
      `UPDATE medications
       SET name = ?, time_of_day = ?, instructions = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`,
      [name.trim(), JSON.stringify(timeOfDay), instructions || '', id, req.user.id]
    );

    const updatedMedication = await dbQuery.get('SELECT * FROM medications WHERE id = ?', [id]);
    res.json(mapMedicationRow(updatedMedication));
  } catch (err) {
    console.error('Error updating medication:', err);
    res.status(500).json({ error: 'Server error updating medication.' });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const existingMedication = await dbQuery.get('SELECT * FROM medications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!existingMedication) {
      return res.status(404).json({ error: 'Medication not found or access denied.' });
    }

    await dbQuery.run('DELETE FROM medications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ message: 'Medication deleted successfully.', id });
  } catch (err) {
    console.error('Error deleting medication:', err);
    res.status(500).json({ error: 'Server error deleting medication.' });
  }
});

module.exports = router;