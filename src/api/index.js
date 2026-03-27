/**
 * API Router Setup
 * Central point to register all route handlers
 */

const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const kbaRoutes = require('./kba');
const adminRoutes = require('./admin');
const signaturesRoutes = require('./signatures');
const assetsRoutes = require('./assets');
const documentsRoutes = require('./documents');
const signerDocumentsRoutes = require('./signerDocuments');
const recordingsRoutes = require('./recordings');
const notaryStatsRoutes = require('./notaryStats');
const healthRoutes = require('./health');

// Register all routes
router.use('/auth', authRoutes);
router.use('/kba', kbaRoutes);
router.use('/admin', adminRoutes);
router.use('/signatures', signaturesRoutes);
router.use('/assets', assetsRoutes);
router.use('/documents', documentsRoutes);
router.use('/signer-documents', signerDocumentsRoutes);
router.use('/recordings', recordingsRoutes);
router.use('/notary', notaryStatsRoutes);
router.use('/', healthRoutes);

module.exports = router;
