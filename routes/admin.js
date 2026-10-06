const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// Middleware to ensure user is an admin
const requireAdmin = authorize('admin');

// ─────────────────────────────────────────────────────────
//  ADMIN ROUTES
// ─────────────────────────────────────────────────────────

// 1. Get All Patients (admin sees everyone, no linking required)
router.get('/patients', requireAdmin, async (req, res) => {
  try {
    const patients = await dbQuery.all(`
      SELECT u.id, u.email, u.created_at, p.name, p.age, p.gender, p.blood_group, p.height, p.allergies, p.emergency_contact
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.role = 'patient'
      ORDER BY u.created_at DESC
    `);

    res.json(patients);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Server error retrieving patients.' });
  }
});

// 2. Get All Users (admin can see all accounts)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await dbQuery.all(`
      SELECT u.id, u.email, u.role, u.created_at, p.name
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      ORDER BY u.created_at DESC
    `);

    res.json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: 'Server error retrieving users.' });
  }
});

// 3. Get a specific patient's vitals
router.get('/patients/:patientId/vitals', requireAdmin, async (req, res) => {
  const { patientId } = req.params;
  try {
    const patient = await dbQuery.get('SELECT id FROM users WHERE id = ? AND role = ?', [patientId, 'patient']);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const vitals = await dbQuery.all(
      'SELECT * FROM vitals WHERE user_id = ? ORDER BY timestamp DESC',
      [patientId]
    );
    res.json(vitals);
  } catch (err) {
    console.error('Error fetching patient vitals:', err);
    res.status(500).json({ error: 'Server error retrieving patient vitals.' });
  }
});

// 4. Get a specific patient's glucose
router.get('/patients/:patientId/glucose', requireAdmin, async (req, res) => {
  const { patientId } = req.params;
  try {
    const patient = await dbQuery.get('SELECT id FROM users WHERE id = ? AND role = ?', [patientId, 'patient']);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const glucose = await dbQuery.all(
      'SELECT * FROM glucose WHERE user_id = ? ORDER BY timestamp DESC',
      [patientId]
    );
    res.json(glucose);
  } catch (err) {
    console.error('Error fetching patient glucose:', err);
    res.status(500).json({ error: 'Server error retrieving patient glucose.' });
  }
});

// 5. Get a specific patient's weight
router.get('/patients/:patientId/weight', requireAdmin, async (req, res) => {
  const { patientId } = req.params;
  try {
    const patient = await dbQuery.get('SELECT id FROM users WHERE id = ? AND role = ?', [patientId, 'patient']);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const weight = await dbQuery.all(
      'SELECT * FROM weight WHERE user_id = ? ORDER BY timestamp DESC',
      [patientId]
    );
    res.json(weight);
  } catch (err) {
    console.error('Error fetching patient weight:', err);
    res.status(500).json({ error: 'Server error retrieving patient weight.' });
  }
});

// 6. Get a specific patient's reports
router.get('/patients/:patientId/reports', requireAdmin, async (req, res) => {
  const { patientId } = req.params;
  try {
    const patient = await dbQuery.get('SELECT id FROM users WHERE id = ? AND role = ?', [patientId, 'patient']);
    if (!patient) return res.status(404).json({ error: 'Patient not found.' });

    const reports = await dbQuery.all(
      'SELECT * FROM reports WHERE user_id = ? ORDER BY timestamp DESC',
      [patientId]
    );
    res.json(reports);
  } catch (err) {
    console.error('Error fetching patient reports:', err);
    res.status(500).json({ error: 'Server error retrieving patient reports.' });
  }
});

// 7. Delete a user account (admin only)
router.delete('/users/:userId', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const adminId = req.user.id;

  // Prevent admin from deleting themselves
  if (parseInt(userId) === parseInt(adminId)) {
    return res.status(400).json({ error: 'Admin cannot delete their own account from the admin panel.' });
  }

  try {
    const user = await dbQuery.get('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await dbQuery.run('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ message: 'User account deleted successfully.' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Server error deleting user.' });
  }
});

// 8. Get summary stats for the admin dashboard
router.get('/stats', requireAdmin, async (req, res) => {
  try {
    const [totalPatients, totalVitals, totalGlucose, totalReports, recentActivity] = await Promise.all([
      dbQuery.get(`SELECT COUNT(*) as count FROM users WHERE role = 'patient'`),
      dbQuery.get(`SELECT COUNT(*) as count FROM vitals`),
      dbQuery.get(`SELECT COUNT(*) as count FROM glucose`),
      dbQuery.get(`SELECT COUNT(*) as count FROM reports`),
      dbQuery.all(`
        SELECT u.email, u.role, al.action, al.route, al.timestamp
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        ORDER BY al.timestamp DESC
        LIMIT 20
      `)
    ]);

    res.json({
      totalPatients: totalPatients?.count || 0,
      totalVitals: totalVitals?.count || 0,
      totalGlucose: totalGlucose?.count || 0,
      totalReports: totalReports?.count || 0,
      recentActivity
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: 'Server error retrieving stats.' });
  }
});

module.exports = router;
