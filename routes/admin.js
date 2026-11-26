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
      WHERE u.role != 'admin'
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
    const [totalPatients, totalVitals, totalGlucose, totalReports, recentActivity,
           premiumUsers, subscriptionBreakdown] = await Promise.all([
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
      `),
      dbQuery.get(`SELECT COUNT(*) as count FROM users WHERE tier = 'premium' AND role != 'admin'`),
      dbQuery.all(`
        SELECT subscription_status, COUNT(*) as count
        FROM users
        WHERE role != 'admin' AND subscription_status IS NOT NULL AND subscription_status != 'inactive'
        GROUP BY subscription_status
      `)
    ]);

    res.json({
      totalPatients: totalPatients?.count || 0,
      totalVitals: totalVitals?.count || 0,
      totalGlucose: totalGlucose?.count || 0,
      totalReports: totalReports?.count || 0,
      recentActivity,
      premiumUsers: premiumUsers?.count || 0,
      subscriptionBreakdown: subscriptionBreakdown || []
    });
  } catch (err) {
    console.error('Error fetching admin stats:', err);
    res.status(500).json({ error: 'Server error retrieving stats.' });
  }
});

// ─────────────────────────────────────────────────────────
//  SUBSCRIPTION MANAGEMENT ROUTES
// ─────────────────────────────────────────────────────────

/**
 * 9. GET /api/admin/subscriptions
 * Returns all users with their subscription status, plan, period end, and profile name.
 * Sorted by most recently updated subscription first.
 */
router.get('/subscriptions', requireAdmin, async (req, res) => {
  try {
    const rows = await dbQuery.all(`
      SELECT
        u.id,
        u.email,
        u.role,
        u.tier,
        u.subscription_status,
        u.subscription_plan,
        u.subscription_id,
        u.subscription_current_period_end,
        u.created_at,
        p.name
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE u.role != 'admin'
      ORDER BY
        CASE WHEN u.subscription_status IN ('active','refund_pending') THEN 0 ELSE 1 END,
        u.subscription_current_period_end DESC NULLS LAST,
        u.created_at DESC
    `);

    // Annotate with computed expiry status
    const now = new Date();
    const enriched = rows.map(r => ({
      ...r,
      isExpired: r.subscription_current_period_end
        ? new Date(r.subscription_current_period_end) < now
        : null
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Error fetching subscription list:', err);
    res.status(500).json({ error: 'Server error retrieving subscriptions.' });
  }
});

/**
 * 10. POST /api/admin/subscriptions/:userId/grant
 * Manually grants Premium access for a specified number of days.
 * Body: { days: number (default 30), plan: 'monthly'|'yearly' (default 'monthly'), reason: string }
 */
router.post('/subscriptions/:userId/grant', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { days = 30, plan = 'monthly', reason = 'Admin manual grant' } = req.body;

  if (isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const user = await dbQuery.get('SELECT id, email FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const expiresAt = new Date(Date.now() + parseInt(days) * 24 * 60 * 60 * 1000).toISOString();

    await dbQuery.run(
      `UPDATE users
       SET tier = 'premium',
           subscription_status = 'active',
           subscription_plan = ?,
           subscription_id = ?,
           subscription_current_period_end = ?
       WHERE id = ?`,
      [plan, `admin_grant_${req.user.id}_${Date.now()}`, expiresAt, userId]
    );

    console.info(`[Admin] ${req.user.email} granted Premium to user ${user.email} for ${days} days. Reason: ${reason}`);

    res.json({
      success: true,
      message: `Premium granted to ${user.email} until ${new Date(expiresAt).toLocaleDateString()}.`,
      currentPeriodEnd: expiresAt
    });
  } catch (err) {
    console.error('Error granting premium:', err);
    res.status(500).json({ error: 'Server error granting premium access.' });
  }
});

/**
 * 11. POST /api/admin/subscriptions/:userId/revoke
 * Immediately revokes Premium access and sets tier back to free.
 * Body: { reason: string }
 */
router.post('/subscriptions/:userId/revoke', requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { reason = 'Admin manual revoke' } = req.body;

  if (isNaN(parseInt(userId))) {
    return res.status(400).json({ error: 'Invalid user ID.' });
  }

  try {
    const user = await dbQuery.get('SELECT id, email FROM users WHERE id = ?', [userId]);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    await dbQuery.run(
      `UPDATE users
       SET tier = 'free',
           subscription_status = 'cancelled',
           subscription_plan = NULL,
           subscription_current_period_end = datetime('now')
       WHERE id = ?`,
      [userId]
    );

    console.info(`[Admin] ${req.user.email} revoked Premium from user ${user.email}. Reason: ${reason}`);

    res.json({
      success: true,
      message: `Premium access revoked for ${user.email}.`
    });
  } catch (err) {
    console.error('Error revoking premium:', err);
    res.status(500).json({ error: 'Server error revoking premium access.' });
  }
});

/**
 * 12. GET /api/admin/stats (augmented with subscription metrics)
 * Also returns premium user count, revenue stats, and subscription breakdown.
 */

module.exports = router;
