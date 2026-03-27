/**
 * Admin Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/overview', (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin overview - migration in progress' });
});

router.get('/users/:userId', (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin user detail - migration in progress' });
});

router.put('/users/:userId', (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin user update - migration in progress' });
});

router.delete('/users/:userId', (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin user delete - migration in progress' });
});

router.post('/sessions/:sessionId/terminate', (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin session terminate - migration in progress' });
});

router.get('/kba/pending', requireAuth, requireRole(['admin']), (req, res) => {
  res.status(501).json({ ok: false, message: 'Admin KBA pending - migration in progress' });
});

module.exports = router;
