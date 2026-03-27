/**
 * Documents Routes (Stubs - full migration needed)
 */
const express = require('express');
const router = express.Router();

router.post('/', (req, res) => {
  res.status(501).json({ ok: false, message: 'Save document - migration in progress' });
});

router.get('/', (req, res) => {
  res.status(501).json({ ok: false, message: 'Get documents - migration in progress' });
});

router.get('/notarized', (req, res) => {
  res.status(501).json({ ok: false, message: 'Get notarized documents - migration in progress' });
});

router.put('/:id/review', (req, res) => {
  res.status(501).json({ ok: false, message: 'Update document review - migration in progress' });
});

module.exports = router;
