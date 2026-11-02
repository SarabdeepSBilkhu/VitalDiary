const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/auth.schema');
const { deleteUserEmbeddings } = require('../services/vectorStore');
const { invalidateCache } = require('../services/cache');

const JWT_SECRET = process.env.JWT_SECRET || '5fa886b2925e167df6a334b148143d8618f47b29184e98271046f8d0273fcf3e';

// 1. User Registration
router.post('/register', validate(registerSchema), async (req, res) => {
  const { email, password, role: requestedRole } = req.body;

  // Only allow 'patient' role during self-registration.
  // 'admin' can only be assigned directly in the database.
  const role = 'patient';

  try {
    // Check if email already exists
    const existingUser = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into DB
    const result = await dbQuery.run(
      `INSERT INTO users (email, password, role, tier, subscription_status) VALUES (?, ?, ?, 'free', 'inactive')`,
      [email, hashedPassword, role]
    );

    const userId = result.lastID;

    // Generate JWT Token (includes role for RBAC)
    const token = jwt.sign({ id: userId, email, role, tier: 'free' }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Account registered successfully.',
      token,
      user: {
        id: userId,
        email,
        role,
        tier: 'free',
        subscription_status: 'inactive',
        subscription_plan: null,
        subscription_current_period_end: null
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// 2. User Login
router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  try {
    // Fetch user
    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const role = user.role || 'patient';
    let tier = user.tier || 'free';
    let subscription_status = user.subscription_status || 'inactive';

    // Auto-check expiry on login
    if (tier === 'premium' && user.subscription_current_period_end) {
      const periodEnd = new Date(user.subscription_current_period_end).getTime();
      if (Number.isFinite(periodEnd) && Date.now() > periodEnd) {
        tier = 'free';
        subscription_status = 'expired';
        await dbQuery.run(
          `UPDATE users SET tier = 'free', subscription_status = 'expired' WHERE id = ?`,
          [user.id]
        );
      }
    }

    // Generate JWT Token (includes role and tier)
    const token = jwt.sign({ id: user.id, email: user.email, role, tier }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        email,
        role,
        tier,
        subscription_status,
        subscription_plan: user.subscription_plan || null,
        subscription_current_period_end: user.subscription_current_period_end || null
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// 3. Get Current User info (Session Check)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbQuery.get(
      `SELECT id, email, role, tier, subscription_status, subscription_plan, 
              subscription_id, subscription_current_period_end, created_at 
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let tier = user.tier || 'free';
    let subscription_status = user.subscription_status || 'inactive';

    if (tier === 'premium' && user.subscription_current_period_end) {
      const periodEnd = new Date(user.subscription_current_period_end).getTime();
      if (Number.isFinite(periodEnd) && Date.now() > periodEnd) {
        tier = 'free';
        subscription_status = 'expired';
        await dbQuery.run(
          `UPDATE users SET tier = 'free', subscription_status = 'expired' WHERE id = ?`,
          [user.id]
        );
      }
    }

    res.json({
      ...user,
      tier,
      subscription_status
    });
  } catch (err) {
    console.error('Session check error:', err);
    res.status(500).json({ error: 'Server error retrieving session.' });
  }
});

// 4. Delete Account
router.delete('/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Remove user embeddings from RAG vector store
    deleteUserEmbeddings(userId);

    // Remove all user cache entries from Redis
    await invalidateCache(userId, '*');

    // Delete user from SQLite/Postgres.
    // ON DELETE CASCADE on foreign keys handles vitals, glucose, weight, reports, profile, medications, etc.
    await dbQuery.run('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ message: 'Account and all associated data deleted successfully.' });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ error: 'Server error deleting account.' });
  }
});

module.exports = router;
