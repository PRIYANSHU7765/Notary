/**
 * Assets Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();

router.get('/:userRole', (req, res) => {
  res.status(501).json({ ok: false, message: 'Get assets - migration in progress' });
});

router.post('/', (req, res) => {
  res.status(501).json({ ok: false, message: 'Save asset - migration in progress' });
});

router.delete('/:id', (req, res) => {
  res.status(501).json({ ok: false, message: 'Delete asset - migration in progress' });
});

module.exports = router;
