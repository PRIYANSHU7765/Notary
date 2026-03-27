/**
 * Authentication Routes
 * User registration and login
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { dbGet, dbRun, persistDatabase, now } = require('../db');
const { appendUserToJson } = require('../db/userSync');
const { hashPassword, verifyPassword, createToken } = require('../services/authService');
const { isValidEmailAddress } = require('../utils/validators');

// POST /api/auth/register
router.post('/register', (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ ok: false, error: 'username, email, and password required' });
    }

    if (!isValidEmailAddress(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email format' });
    }

    const existing = dbGet('SELECT * FROM users WHERE username = :username OR email = :email', {
      username: String(username).trim(),
      email: String(email).trim().toLowerCase(),
    });

    if (existing) {
      return res.status(409).json({ ok: false, error: 'User already exists' });
    }

    const userId = crypto.randomUUID();
    const passwordHash = hashPassword(password);

    dbRun(
      'INSERT INTO users (userId, username, email, passwordHash, role, createdAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt)',
      {
        userId,
        username: String(username).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash,
        role: String(role || 'signer').trim().toLowerCase(),
        createdAt: now(),
      }
    );

    persistDatabase();
    appendUserToJson({
      userId,
      username: String(username).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash,
      role: String(role || 'signer').trim().toLowerCase(),
      createdAt: now(),
    });

    const user = dbGet('SELECT * FROM users WHERE userId = :userId', { userId });
    const token = createToken(user);

    res.status(201).json({
      ok: true,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username and password required' });
    }

    const user = dbGet('SELECT * FROM users WHERE username = :username', {
      username: String(username).trim(),
    });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    const token = createToken(user);

    res.json({
      ok: true,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
        kbaStatus: user.kbaStatus,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
