/**
 * Recordings Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'Get recordings - migration in progress' });
});

router.post('/upload', requireAuth, requireRole(['notary', 'signer']), (req, res) => {
  res.status(501).json({ ok: false, message: 'Upload recording - migration in progress' });
});

module.exports = router;
