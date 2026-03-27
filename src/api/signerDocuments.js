/**
 * Signer Documents Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();
const { requireAuth, requireRole, requireKbaApproved } = require('../middleware/auth');

router.post('/', requireAuth, requireRole(['signer']), requireKbaApproved, (req, res) => {
  res.status(501).json({ ok: false, message: 'Signer document upload - migration in progress' });
});

router.get('/', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'Get signer documents - migration in progress' });
});

router.get('/:id', requireAuth, (req, res) => {
  res.status(501).json({ ok: false, message: 'Get signer document detail - migration in progress' });
});

router.put('/:id/review', requireAuth, requireRole(['notary']), requireKbaApproved, (req, res) => {
  res.status(501).json({ ok: false, message: 'Signer document review - migration in progress' });
});

router.put('/:id/pay', requireAuth, requireRole(['signer']), (req, res) => {
  res.status(501).json({ ok: false, message: 'Signer document payment - migration in progress' });
});

module.exports = router;
