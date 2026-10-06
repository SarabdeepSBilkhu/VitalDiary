const express = require('express');
const router = express.Router();
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// Apply auth middleware to all routes here
router.use(authenticateToken);

// Middleware to ensure user is a caregiver for caregiver-only routes
const requireCaregiver = authorize('caregiver');

// ─────────────────────────────────────────────────────────
//  CAREGIVER ROUTES
// ─────────────────────────────────────────────────────────

// 1. Get Patients linked to Caregiver (accepted only)
router.get('/patients', requireCaregiver, async (req, res) => {
  try {
    const patients = await dbQuery.all(`
      SELECT u.id, u.email, p.name, p.age, p.gender 
      FROM caregiver_links cl
      JOIN users u ON cl.patient_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE cl.caregiver_id = ? AND cl.status = 'accepted'
    `, [req.user.originalId || req.user.id]);

    res.json(patients);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ error: 'Server error retrieving patients.' });
  }
});

// 2. Send Invite to a Patient (by email) — creates a PENDING link
router.post('/link', requireCaregiver, async (req, res) => {
  const { patientEmail } = req.body;
  if (!patientEmail) return res.status(400).json({ error: 'Patient email is required.' });

  try {
    const patient = await dbQuery.get('SELECT id, role FROM users WHERE email = ?', [patientEmail]);
    if (!patient) return res.status(404).json({ error: 'No patient account found with that email.' });
    if (patient.role !== 'patient') return res.status(400).json({ error: 'User is not a patient.' });

    const caregiverId = req.user.originalId || req.user.id;

    // Check if a link already exists in any state
    const existing = await dbQuery.get(
      'SELECT * FROM caregiver_links WHERE caregiver_id = ? AND patient_id = ?',
      [caregiverId, patient.id]
    );

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: 'This patient is already linked to your account.' });
      }
      if (existing.status === 'pending') {
        return res.status(400).json({ error: 'An invite has already been sent to this patient. Waiting for their approval.' });
      }
    }

    // Create a new PENDING invite
    await dbQuery.run(
      `INSERT INTO caregiver_links (caregiver_id, patient_id, status) VALUES (?, ?, 'pending')`,
      [caregiverId, patient.id]
    );

    res.status(201).json({ message: 'Invite sent. The patient must accept it before you can view their data.' });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'An invite already exists for this patient.' });
    }
    console.error('Error sending invite:', err);
    res.status(500).json({ error: 'Server error sending invite.' });
  }
});

// 3. Unlink a Patient (caregiver side)
router.delete('/unlink/:patientId', requireCaregiver, async (req, res) => {
  const { patientId } = req.params;
  try {
    await dbQuery.run(
      'DELETE FROM caregiver_links WHERE caregiver_id = ? AND patient_id = ?',
      [req.user.originalId || req.user.id, patientId]
    );
    res.json({ message: 'Patient unlinked successfully.' });
  } catch (err) {
    console.error('Error unlinking patient:', err);
    res.status(500).json({ error: 'Server error unlinking patient.' });
  }
});

// ─────────────────────────────────────────────────────────
//  PATIENT ROUTES (Invite management)
// ─────────────────────────────────────────────────────────

// 4. Get pending invites sent to the logged-in patient
router.get('/invites', async (req, res) => {
  try {
    const invites = await dbQuery.all(`
      SELECT cl.id, cl.caregiver_id, cl.created_at, u.email AS caregiver_email, p.name AS caregiver_name
      FROM caregiver_links cl
      JOIN users u ON cl.caregiver_id = u.id
      LEFT JOIN profiles p ON u.id = p.user_id
      WHERE cl.patient_id = ? AND cl.status = 'pending'
    `, [req.user.id]);

    res.json(invites);
  } catch (err) {
    console.error('Error fetching invites:', err);
    res.status(500).json({ error: 'Server error retrieving invites.' });
  }
});

// 5. Accept an invite (patient action)
router.post('/invites/:inviteId/accept', async (req, res) => {
  const { inviteId } = req.params;
  try {
    const invite = await dbQuery.get(
      `SELECT * FROM caregiver_links WHERE id = ? AND patient_id = ? AND status = 'pending'`,
      [inviteId, req.user.id]
    );
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or already actioned.' });
    }

    await dbQuery.run(
      `UPDATE caregiver_links SET status = 'accepted' WHERE id = ?`,
      [inviteId]
    );

    res.json({ message: 'Caregiver invite accepted.' });
  } catch (err) {
    console.error('Error accepting invite:', err);
    res.status(500).json({ error: 'Server error accepting invite.' });
  }
});

// 6. Decline an invite (patient action) — deletes the link row
router.post('/invites/:inviteId/decline', async (req, res) => {
  const { inviteId } = req.params;
  try {
    const invite = await dbQuery.get(
      `SELECT * FROM caregiver_links WHERE id = ? AND patient_id = ? AND status = 'pending'`,
      [inviteId, req.user.id]
    );
    if (!invite) {
      return res.status(404).json({ error: 'Invite not found or already actioned.' });
    }

    await dbQuery.run(`DELETE FROM caregiver_links WHERE id = ?`, [inviteId]);

    res.json({ message: 'Caregiver invite declined.' });
  } catch (err) {
    console.error('Error declining invite:', err);
    res.status(500).json({ error: 'Server error declining invite.' });
  }
});

module.exports = router;
