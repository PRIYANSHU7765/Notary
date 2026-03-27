/**
 * Notary Stats Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/dashboard/stats', requireAuth, requireRole(['notary']), (req, res) => {
  res.status(501).json({ ok: false, message: 'Notary dashboard stats - migration in progress' });
});

module.exports = router;
