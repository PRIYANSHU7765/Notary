/**
 * Placeholder API Routes
 * These are stubs that reference the original server.js implementations
 * Full implementations should be migrated next
 */

const express = require('express');
const router = express.Router();

// Placeholder: KBA routes
const kbaRouter = express.Router();
kbaRouter.post('/otp/send', (req, res) => {
  res.status(501).json({ ok: false, error: 'KBA OTP send - not yet migrated' });
});
kbaRouter.post('/otp/verify', (req, res) => {
  res.status(501).json({ ok: false, error: 'KBA OTP verify - not yet migrated' });
});

// Placeholder: Admin routes
const adminRouter = express.Router();
adminRouter.get('/users/:userId', (req, res) => {
  res.status(501).json({ ok: false, error: 'Admin routes - not yet migrated' });
});

// Placeholder: Signature routes
const signaturesRouter = express.Router();
signaturesRouter.get('/:userRole', (req, res) => {
  res.status(501).json({ ok: false, error: 'Signatures routes - not yet migrated' });
});

// Placeholder: Assets routes
const assetsRouter = express.Router();
assetsRouter.get('/:userRole', (req, res) => {
  res.status(501).json({ ok: false, error: 'Assets routes - not yet migrated' });
});

// Placeholder: Documents routes
const documentsRouter = express.Router();
documentsRouter.get('/', (req, res) => {
  res.status(501).json({ ok: false, error: 'Documents routes - not yet migrated' });
});

// Placeholder: Signer documents routes
const signerDocumentsRouter = express.Router();
signerDocumentsRouter.get('/', (req, res) => {
  res.status(501).json({ ok: false, error: 'Signer documents routes - not yet migrated' });
});

// Placeholder: Recordings routes  
const recordingsRouter = express.Router();
recordingsRouter.get('/', (req, res) => {
  res.status(501).json({ ok: false, error: 'Recordings routes - not yet migrated' });
});

// Placeholder: Notary stats routes
const notaryStatsRouter = express.Router();
notaryStatsRouter.get('/dashboard/stats', (req, res) => {
  res.status(501).json({ ok: false, error: 'Notary stats routes - not yet migrated' });
});

module.exports = {
  kba: kbaRouter,
  admin: adminRouter,
  signatures: signaturesRouter,
  assets: assetsRouter,
  documents: documentsRouter,
  signerDocuments: signerDocumentsRouter,
  recordings: recordingsRouter,
  notaryStats: notaryStatsRouter,
};
