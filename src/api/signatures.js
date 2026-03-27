/**
 * Signatures Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();

router.get('/:userRole', (req, res) => {
  res.status(501).json({ ok: false, message: 'Get signatures - migration in progress' });
});

router.post('/', (req, res) => {
  res.status(501).json({ ok: false, message: 'Save signature - migration in progress' });
});

router.delete('/:id', (req, res) => {
  res.status(501).json({ ok: false, message: 'Delete signature - migration in progress' });
});

module.exports = router;
