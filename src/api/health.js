/**
 * Health Check & Monitoring Routes
 */

const express = require('express');
const router = express.Router();
const { dbGet } = require('../db');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Root health check (support legacy path)
router.get('/', (req, res) => {
  res.json({ ok: true, message: 'Notarization Platform Backend' });
});

// Active sessions for monitoring
router.get('/api/sessions', (req, res) => {
  try {
    const sessions = dbGet('SELECT sessionId, active, ownerId, createdAt FROM sessions LIMIT 100');
    res.json({ ok: true, sessions: sessions || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List all users (public)
router.get('/api/users', (req, res) => {
  try {
    const users = dbGet(
      'SELECT userId, username, email, role, createdAt FROM users ORDER BY createdAt DESC LIMIT 100'
    );
    res.json({ ok: true, users: users || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
