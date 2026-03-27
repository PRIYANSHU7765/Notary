/**
 * Notary Stats Routes
 */
const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const { dbAll, dbGet } = require('../db');

const router = express.Router();

router.get('/dashboard/stats', requireAuth, requireRole(['notary']), async (req, res) => {
  try {
    const notaryId = req.auth?.userId;
    if (!notaryId) {
      return res.status(400).json({ error: 'Notary ID not found' });
    }

    const completedCallsResult = await dbGet(
      `SELECT COUNT(*) as count FROM owner_documents
       WHERE notaryId = :notaryId AND (status = 'notarized' OR notaryReview = 'accepted')`,
      { notaryId }
    );
    const totalCompletedCalls = Number(completedCallsResult?.count || 0);

    const onDemandCallsResult = await dbGet(
      `SELECT COUNT(*) as count FROM owner_documents
       WHERE notaryId = :notaryId AND (scheduledAt IS NULL OR scheduledAt = 0) AND inProcess = 0`,
      { notaryId }
    );
    const onDemandCalls = Number(onDemandCallsResult?.count || 0);

    const scheduledCallsResult = await dbGet(
      `SELECT COUNT(*) as count FROM owner_documents
       WHERE notaryId = :notaryId AND scheduledAt IS NOT NULL AND scheduledAt > :now AND status IN ('accepted', 'session_started')`,
      { notaryId, now: Date.now() }
    );
    const scheduledCalls = Number(scheduledCallsResult?.count || 0);

    const transactionsResult = await dbGet(
      `SELECT COALESCE(SUM(sessionAmount), 0) as totalAmount FROM owner_documents
       WHERE notaryId = :notaryId AND sessionAmount > 0`,
      { notaryId }
    );
    const totalTransactionAmount = Number(transactionsResult?.totalAmount || 0);

    const transactionsRaw = await dbAll(
      `SELECT
         id,
         name as documentName,
         ownerId,
         ownerName,
         sessionAmount,
         status,
         notarizedAt,
         uploadedAt,
         paymentStatus,
         paymentPaidAt
       FROM owner_documents
       WHERE notaryId = :notaryId AND sessionAmount > 0
       ORDER BY uploadedAt DESC
       LIMIT 50`,
      { notaryId }
    );

    const transactions = transactionsRaw.map((doc) => ({
      id: doc.id,
      documentId: doc.id,
      documentName: doc.documentName,
      ownerName: doc.ownerName,
      amount: Number(doc.sessionAmount || 0),
      status: doc.status,
      date: doc.notarizedAt || doc.uploadedAt,
      paymentStatus: doc.paymentStatus || 'not_required',
      paymentDate: doc.paymentPaidAt,
    }));

    const payoutResult = await dbGet(
      `SELECT COALESCE(SUM(sessionAmount), 0) as totalPayout FROM owner_documents
       WHERE notaryId = :notaryId AND paymentStatus = 'paid' AND sessionAmount > 0`,
      { notaryId }
    );
    const availableForPayout = Number(payoutResult?.totalPayout || 0);

    res.json({
      success: true,
      data: {
        totalCompletedCalls,
        onDemandCalls,
        scheduledCalls,
        totalTransactionAmount,
        availableForPayout,
        transactions,
      },
    });
  } catch (error) {
    console.error('Error fetching notary dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch notary dashboard stats' });
  }
});

module.exports = router;
