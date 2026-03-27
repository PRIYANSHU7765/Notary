/**
 * KBA Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, requireKbaApproved } = require('../middleware/auth');

router.post('/otp/send', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'KBA OTP send endpoint - migration in progress' });
});

router.post('/otp/verify', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'KBA OTP verify endpoint - migration in progress' });
});

router.post('/upload', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'KBA document upload - migration in progress' });
});

router.get('/status', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'KBA status endpoint - migration in progress' });
});

router.post('/cancel', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'KBA cancel endpoint - migration in progress' });
});

module.exports = router;
