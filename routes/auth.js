const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbQuery } = require('../database');
const authenticateToken = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'vitaldiary_fallback_secret_key_123';

// 1. User Registration
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Check if email already exists
    const existingUser = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user into DB
    const result = await dbQuery.run(
      'INSERT INTO users (email, password) VALUES (?, ?)',
      [email.toLowerCase().trim(), hashedPassword]
    );

    const userId = result.lastID;

    // Generate JWT Token
    const token = jwt.sign({ id: userId, email: email }, JWT_SECRET, { expiresIn: '30d' });

    res.status(201).json({
      message: 'Account registered successfully.',
      token,
      user: { id: userId, email: email.toLowerCase().trim() }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// 2. User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // Fetch user
    const user = await dbQuery.get('SELECT * FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Generate JWT Token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      message: 'Login successful.',
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// 3. Get Current User info (Session Check)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await dbQuery.get('SELECT id, email, created_at FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    console.error('Session check error:', err);
    res.status(500).json({ error: 'Server error retrieving session.' });
  }
});

module.exports = router;
