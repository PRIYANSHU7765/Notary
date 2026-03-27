/**
 * Signer Documents Routes
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { requireAuth, requireRole, requireKbaApproved } = require('../middleware/auth');
const { normalizeRole } = require('../utils/normalizers');
const { now, dbAll, dbGet, dbRun, persistDatabase } = require('../db');

const router = express.Router();

function hasNotaryAccess(document, auth) {
  const docNotaryId = String(document?.notaryId || '').trim();
  const isUnclaimedPending = String(document?.status || '').trim().toLowerCase() === 'pending_review' && !docNotaryId;
  const isAssigned = docNotaryId && docNotaryId === String(auth?.userId || '').trim();
  return isUnclaimedPending || isAssigned;
}

router.put('/:id/notarize', requireAuth, requireRole(['notary']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { notaryName, notarizedDataUrl, sessionAmount } = req.body || {};

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    if (existing.notaryId && String(existing.notaryId) !== String(req.auth?.userId || '')) {
      return res.status(409).json({ error: 'This document is locked by another notary' });
    }

    const nowMs = now();
    const parsedAmount = Number(sessionAmount);
    const normalizedAmount = Number.isFinite(parsedAmount) && parsedAmount >= 0 ? Number(parsedAmount.toFixed(2)) : 0;
    const paymentRequired = normalizedAmount > 0;

    let notarizedPath = null;
    if (typeof notarizedDataUrl === 'string' && notarizedDataUrl.trim()) {
      const [, base64] = notarizedDataUrl.split(',');
      const buffer = Buffer.from(base64 || notarizedDataUrl, 'base64');
      const outDir = path.resolve(__dirname, '../../data/notarized');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      notarizedPath = path.join(outDir, `${id}.pdf`);
      try {
        fs.writeFileSync(notarizedPath, buffer);
      } catch (writeErr) {
        console.warn('Failed to write notarized PDF file:', writeErr?.message || writeErr);
        notarizedPath = null;
      }
    }

    await dbRun(
      `
      UPDATE owner_documents
      SET status = :status,
          inProcess = :inProcess,
          notarized = :notarized,
          notarizedAt = :notarizedAt,
          notaryReview = 'accepted',
          notaryId = :notaryId,
          notaryName = :notaryName,
          notarizedDataUrl = :notarizedDataUrl,
          notarizedPath = :notarizedPath,
          sessionAmount = :sessionAmount,
          paymentStatus = :paymentStatus,
          paymentRequestedAt = :paymentRequestedAt,
          paymentRequestedBy = :paymentRequestedBy,
          paymentPaidAt = :paymentPaidAt,
          paymentTransactionId = :paymentTransactionId,
          paymentMethod = :paymentMethod
      WHERE id = :id
    `,
      {
        id,
        status: paymentRequired ? 'payment_pending' : 'notarized',
        inProcess: paymentRequired ? 1 : 0,
        notarized: paymentRequired ? 0 : 1,
        notarizedAt: paymentRequired ? null : nowMs,
        notaryId: existing.notaryId || req.auth.userId,
        notaryName: notaryName || req.auth.username || 'Unknown Notary',
        notarizedDataUrl: notarizedDataUrl || null,
        notarizedPath,
        sessionAmount: normalizedAmount,
        paymentStatus: paymentRequired ? 'pending' : 'not_required',
        paymentRequestedAt: paymentRequired ? nowMs : null,
        paymentRequestedBy: paymentRequired ? req.auth.userId : null,
        paymentPaidAt: null,
        paymentTransactionId: null,
        paymentMethod: null,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(document);
  } catch (error) {
    console.error('Error marking signer document notarized:', error);
    return res.status(500).json({ error: 'Failed to mark document as notarized' });
  }
});

router.post('/:id/signer-notarize', requireAuth, requireRole(['signer']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Document not found', documentId: id });
    }

    if (String(existing.ownerId) !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'You can only notarize your own documents' });
    }

    const currentStatus = String(existing.status || '').trim().toLowerCase();
    if (currentStatus === 'session_started' || currentStatus === 'payment_pending' || currentStatus === 'notarized') {
      return res.status(409).json({ error: 'This document cannot be submitted for notarization in its current state' });
    }

    await dbRun(
      `UPDATE owner_documents
       SET status = :status,
           inProcess = :inProcess,
           notarized = :notarized,
           notarizedAt = :notarizedAt,
           notaryReview = :notaryReview,
           notaryReviewedAt = :notaryReviewedAt,
           notaryId = :notaryId,
           notaryName = :notaryName,
           scheduledAt = :scheduledAt,
           startedAt = :startedAt,
           endedAt = :endedAt,
           sessionAmount = :sessionAmount,
           paymentStatus = :paymentStatus,
           paymentRequestedAt = :paymentRequestedAt,
           paymentRequestedBy = :paymentRequestedBy,
           paymentPaidAt = :paymentPaidAt,
           paymentTransactionId = :paymentTransactionId,
           paymentMethod = :paymentMethod
       WHERE id = :id`,
      {
        id,
        status: 'pending_review',
        inProcess: 1,
        notarized: 0,
        notarizedAt: null,
        notaryReview: 'pending',
        notaryReviewedAt: null,
        notaryId: null,
        notaryName: null,
        scheduledAt: null,
        startedAt: null,
        endedAt: null,
        sessionAmount: 0,
        paymentStatus: 'not_required',
        paymentRequestedAt: null,
        paymentRequestedBy: null,
        paymentPaidAt: null,
        paymentTransactionId: null,
        paymentMethod: null,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(document);
  } catch (error) {
    console.error('Error notarizing signer document:', error);
    return res.status(500).json({ error: 'Failed to notarize document' });
  }
});

router.post('/', requireAuth, requireRole(['signer']), requireKbaApproved, async (req, res) => {
  try {
    const {
      id,
      ownerId,
      ownerName,
      sessionId,
      name,
      size,
      type,
      dataUrl,
      uploadedAt,
      status,
    } = req.body || {};

    const safeOwnerName = String(ownerName || '').trim() || 'Signer';

    if (!id || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, name' });
    }
    if (ownerId && String(ownerId) !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Signer mismatch: cannot create a document for another user' });
    }

    const nowMs = now();
    const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : nowMs;
    const normalizedStatus = String(status || 'uploaded').trim().toLowerCase();
    const isInProcess = ['pending_review', 'accepted', 'session_started'].includes(normalizedStatus);
    const isNotarized = normalizedStatus === 'notarized';

    await dbRun(
      `
      INSERT INTO owner_documents (id, ownerId, ownerName, sessionId, name, size, type, dataUrl, uploadedAt, inProcess, notarized, notarizedAt, notaryId, notaryName, notaryReview, notaryReviewedAt, status, sessionAmount, paymentStatus, paymentRequestedAt, paymentRequestedBy, paymentPaidAt, paymentTransactionId, paymentMethod)
      VALUES (:id, :ownerId, :ownerName, :sessionId, :name, :size, :type, :dataUrl, :uploadedAt, :inProcess, :notarized, :notarizedAt, :notaryId, :notaryName, :notaryReview, :notaryReviewedAt, :status, :sessionAmount, :paymentStatus, :paymentRequestedAt, :paymentRequestedBy, :paymentPaidAt, :paymentTransactionId, :paymentMethod)
      ON CONFLICT(id) DO UPDATE SET
        ownerId = excluded.ownerId,
        ownerName = excluded.ownerName,
        sessionId = excluded.sessionId,
        name = excluded.name,
        size = excluded.size,
        type = excluded.type,
        dataUrl = excluded.dataUrl,
        uploadedAt = excluded.uploadedAt,
        inProcess = excluded.inProcess,
        notarized = excluded.notarized,
        notarizedAt = excluded.notarizedAt,
        notaryId = excluded.notaryId,
        notaryName = excluded.notaryName,
        notaryReview = excluded.notaryReview,
        notaryReviewedAt = excluded.notaryReviewedAt,
        status = excluded.status,
        sessionAmount = excluded.sessionAmount,
        paymentStatus = excluded.paymentStatus,
        paymentRequestedAt = excluded.paymentRequestedAt,
        paymentRequestedBy = excluded.paymentRequestedBy,
        paymentPaidAt = excluded.paymentPaidAt,
        paymentTransactionId = excluded.paymentTransactionId,
        paymentMethod = excluded.paymentMethod
    `,
      {
        id,
        ownerId: req.auth.userId,
        ownerName: safeOwnerName,
        sessionId: sessionId || null,
        name,
        size: Number(size) || 0,
        type: type || 'application/octet-stream',
        dataUrl: typeof dataUrl === 'string' ? dataUrl : null,
        uploadedAt: uploadedMs,
        inProcess: isInProcess ? 1 : 0,
        notarized: isNotarized ? 1 : 0,
        notarizedAt: isNotarized ? nowMs : null,
        notaryId: null,
        notaryName: null,
        notaryReview: normalizedStatus === 'pending_review' ? 'pending' : normalizedStatus === 'accepted' ? 'accepted' : 'pending',
        notaryReviewedAt: null,
        status: normalizedStatus,
        sessionAmount: 0,
        paymentStatus: 'not_required',
        paymentRequestedAt: null,
        paymentRequestedBy: null,
        paymentPaidAt: null,
        paymentTransactionId: null,
        paymentMethod: null,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(500).json({ error: 'Failed to save signer document - retrieval failed', id });
    }

    return res.json(document);
  } catch (error) {
    console.error('Error saving signer document:', error);
    return res.status(500).json({ error: 'Failed to save signer document', details: error.message });
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { ownerId, sessionId, inProcess, notarized, status } = req.query;
    const currentRole = normalizeRole(req.auth?.role);
    const forcedOwnerId = currentRole === 'signer' ? req.auth.userId : ownerId;
    const viewerNotaryId = currentRole === 'notary' ? String(req.auth?.userId || '') : null;

    const inProcessFilter = inProcess === undefined ? null : (inProcess === '1' || inProcess === 'true' ? 1 : 0);
    const notarizedFilter = notarized === undefined ? null : (notarized === '1' || notarized === 'true' ? 1 : 0);
    const statusFilter = typeof status === 'string' ? status.trim().toLowerCase() : null;

    const conditions = [];
    const params = {};

    if (forcedOwnerId) {
      conditions.push('ownerId = :ownerId');
      params.ownerId = forcedOwnerId;
    }

    if (sessionId) {
      conditions.push('sessionId = :sessionId');
      params.sessionId = sessionId;
    }

    if (inProcessFilter !== null) {
      conditions.push('inProcess = :inProcess');
      params.inProcess = inProcessFilter;
    }

    if (notarizedFilter !== null) {
      conditions.push('notarized = :notarized');
      params.notarized = notarizedFilter;
    }

    if (statusFilter) {
      conditions.push('status = :status');
      params.status = statusFilter;
    }

    if (currentRole === 'notary') {
      conditions.push(`(
        (status = 'pending_review' AND (notaryId IS NULL OR TRIM(notaryId) = ''))
        OR notaryId = :viewerNotaryId
      )`);
      params.viewerNotaryId = viewerNotaryId;
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const documents = await dbAll(
      `SELECT * FROM owner_documents
       ${whereSql}
       ORDER BY uploadedAt DESC`,
      params
    );

    return res.json(documents);
  } catch (error) {
    console.error('Error fetching signer documents:', error);
    return res.status(500).json({ error: 'Failed to fetch signer documents' });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    const requestRole = normalizeRole(req.auth?.role);
    if (requestRole === 'signer' && String(document.ownerId || '') !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only access your own documents' });
    }
    if (requestRole === 'notary' && !hasNotaryAccess(document, req.auth)) {
      return res.status(403).json({ error: 'Forbidden: document is not available to this notary' });
    }
    return res.json(document);
  } catch (error) {
    console.error('Error fetching signer document:', error);
    return res.status(500).json({ error: 'Failed to fetch signer document' });
  }
});

router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    const requestRole = normalizeRole(req.auth?.role);
    if (requestRole === 'signer' && String(document.ownerId || '') !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only access your own documents' });
    }
    if (requestRole === 'notary' && !hasNotaryAccess(document, req.auth)) {
      return res.status(403).json({ error: 'Forbidden: document is not available to this notary' });
    }

    if (document.dataUrl && String(document.dataUrl).startsWith('data:')) {
      const match = String(document.dataUrl).match(/^data:(.+?);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Document data format invalid' });
      }
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${String(document.name || id).replace(/\.pdf$/i, '')}.pdf`;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    if (document.notarizedPath && fs.existsSync(document.notarizedPath)) {
      const fileName = `${String(document.name || id).replace(/\.pdf$/i, '')}.pdf`;
      return res.download(document.notarizedPath, fileName);
    }

    return res.status(404).json({ error: 'Original document not available for download' });
  } catch (error) {
    console.error('Error downloading signer document:', error);
    return res.status(500).json({ error: 'Failed to download signer document' });
  }
});

router.get('/:id/notarized', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    if (normalizeRole(req.auth?.role) === 'signer' && String(document.ownerId || '') !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only access your own documents' });
    }

    if (document.notarizedPath && fs.existsSync(document.notarizedPath)) {
      return res.download(document.notarizedPath, `${String(document.name || id).replace(/\.pdf$/i, '')}-notarized.pdf`);
    }

    if (document.notarizedDataUrl && String(document.notarizedDataUrl).startsWith('data:')) {
      const match = String(document.notarizedDataUrl).match(/^data:(.+?);base64,(.+)$/);
      if (!match) {
        return res.status(400).json({ error: 'Notarized document data format invalid' });
      }
      const [, mimeType, base64Data] = match;
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `${String(document.name || id).replace(/\.pdf$/i, '')}-notarized.pdf`;
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
    }

    return res.status(404).json({ error: 'Notarized document not found' });
  } catch (error) {
    console.error('Error downloading notarized document:', error);
    return res.status(500).json({ error: 'Failed to download notarized document' });
  }
});

router.delete('/:id', requireAuth, requireRole(['signer']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    if (String(existing.ownerId || '') !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only delete your own documents' });
    }

    const isAlreadyNotarized = Boolean(existing.notarized) || String(existing.status || '').trim().toLowerCase() === 'notarized';
    if (isAlreadyNotarized) {
      return res.status(403).json({ error: 'Forbidden: notarized documents cannot be deleted' });
    }

    await dbRun('DELETE FROM owner_documents WHERE id = :id', { id });
    await persistDatabase();

    return res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting signer document:', error);
    return res.status(500).json({ error: 'Failed to delete signer document' });
  }
});

router.put('/:id/session-started', requireAuth, requireRole(['notary']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { sessionId, notaryName, notaryUserId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    const existingStatus = String(existing.status || '').trim().toLowerCase();
    if (!existing.notaryId) {
      return res.status(409).json({ error: 'This document must be accepted by a notary before starting a session' });
    }
    if (String(existing.notaryId) !== String(req.auth?.userId || '')) {
      return res.status(409).json({ error: 'This document is locked by another notary' });
    }
    if (!['accepted', 'session_started'].includes(existingStatus)) {
      return res.status(409).json({ error: 'Session can only be started after notary acceptance' });
    }

    const startAtMs = now();
    await dbRun(
      `
      UPDATE owner_documents
      SET status = :status,
          sessionId = :sessionId,
          inProcess = :inProcess,
          notarized = :notarized,
          notaryReview = :notaryReview,
          notaryName = :notaryName,
          notaryId = :notaryId,
          startedAt = :startedAt
      WHERE id = :id
    `,
      {
        id,
        status: 'session_started',
        sessionId,
        inProcess: 1,
        notarized: 0,
        notaryReview: 'accepted',
        notaryName: notaryName || req.auth?.username || 'Unknown Notary',
        notaryId: existing.notaryId || notaryUserId || req.auth?.userId || null,
        startedAt: startAtMs,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(document);
  } catch (error) {
    console.error('Error marking signer document session started:', error);
    return res.status(500).json({ error: 'Failed to mark session started' });
  }
});

router.put('/:id/session-ended', requireAuth, requireRole(['notary']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { notaryName, notaryUserId } = req.body || {};

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }

    const amountDue = Number(existing.sessionAmount || 0);
    const paymentStatus = String(existing.paymentStatus || 'not_required').trim().toLowerCase();
    if (amountDue > 0 && paymentStatus !== 'paid') {
      return res.status(409).json({
        error: 'Signer payment is pending. End session is blocked until payment is completed.',
        paymentRequired: true,
        paymentStatus,
        amountDue,
      });
    }

    const currentStatus = String(existing.status || '').trim().toLowerCase();
    const nowMs = now();
    if (currentStatus === 'payment_pending' && paymentStatus === 'paid') {
      await dbRun(
        `
        UPDATE owner_documents
        SET status = :status,
            inProcess = :inProcess,
            notarized = :notarized,
            notarizedAt = :notarizedAt,
            notaryReview = :notaryReview,
            notaryReviewedAt = :notaryReviewedAt,
            notaryName = :notaryName,
            notaryId = :notaryId,
            endedAt = :endedAt
        WHERE id = :id
      `,
        {
          id,
          status: 'notarized',
          inProcess: 0,
          notarized: 1,
          notarizedAt: nowMs,
          notaryReview: 'accepted',
          notaryReviewedAt: nowMs,
          notaryName: notaryName || existing.notaryName || 'Unknown Notary',
          notaryId: notaryUserId || existing.notaryId || null,
          endedAt: nowMs,
        }
      );
    } else if (currentStatus !== 'notarized' && !existing.notarized) {
      await dbRun(
        `
        UPDATE owner_documents
        SET status = :status,
            inProcess = :inProcess,
            notarized = :notarized,
            notarizedAt = :notarizedAt,
            notaryReview = :notaryReview,
            notaryReviewedAt = :notaryReviewedAt,
            notaryName = :notaryName,
            notaryId = :notaryId,
            endedAt = :endedAt
        WHERE id = :id
      `,
        {
          id,
          status: 'accepted',
          inProcess: 1,
          notarized: 0,
          notarizedAt: null,
          notaryReview: 'accepted',
          notaryReviewedAt: nowMs,
          notaryName: notaryName || existing.notaryName || 'Unknown Notary',
          notaryId: notaryUserId || existing.notaryId || null,
          endedAt: nowMs,
        }
      );
    }

    await persistDatabase();
    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(document);
  } catch (error) {
    console.error('Error ending signer document session:', error);
    return res.status(500).json({ error: 'Failed to end session' });
  }
});

router.put('/:id/review', requireAuth, requireRole(['notary']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { notaryReview, notaryName } = req.body || {};

    if (!notaryReview || !['accepted', 'rejected', 'pending'].includes(notaryReview)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }

    const requesterNotaryId = String(req.auth?.userId || '').trim();
    const existingNotaryId = String(existing.notaryId || '').trim();
    const existingStatus = String(existing.status || '').trim().toLowerCase();
    const existingReview = String(existing.notaryReview || '').trim().toLowerCase();

    if (existingStatus === 'uploaded') {
      return res.status(409).json({ error: 'Signer must submit this document for notarization first' });
    }
    if (existingNotaryId && existingNotaryId !== requesterNotaryId) {
      return res.status(409).json({ error: 'This document is locked by another notary' });
    }

    const wasAcceptedAlready =
      existingReview === 'accepted' ||
      existingStatus === 'accepted' ||
      existingStatus === 'session_started' ||
      existingStatus === 'payment_pending' ||
      existingStatus === 'notarized';

    if (wasAcceptedAlready && notaryReview !== 'accepted') {
      return res.status(409).json({ error: 'This document is already accepted and can no longer be changed' });
    }

    const nowMs = now();
    const reviewerName = notaryName || req.auth?.username || 'Unknown Notary';
    const nextNotaryId = notaryReview === 'pending' ? null : (requesterNotaryId || existingNotaryId || null);
    const status =
      notaryReview === 'accepted'
        ? 'accepted'
        : notaryReview === 'rejected'
        ? 'rejected'
        : 'pending_review';
    const inProcess = status === 'accepted' || status === 'pending_review' ? 1 : 0;

    await dbRun(
      `
      UPDATE owner_documents
      SET notaryReview = :notaryReview,
          notaryReviewedAt = :notaryReviewedAt,
          notaryId = :notaryId,
          notaryName = :notaryName,
          scheduledAt = CASE WHEN :status = 'accepted' THEN scheduledAt ELSE NULL END,
          status = :status,
          inProcess = :inProcess,
          notarized = :notarized,
          notarizedAt = :notarizedAt
      WHERE id = :id
    `,
      {
        id,
        notaryReview,
        notaryId: nextNotaryId,
        notaryName: reviewerName,
        notaryReviewedAt: nowMs,
        status,
        inProcess,
        notarized: 0,
        notarizedAt: null,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(document);
  } catch (error) {
    console.error('Error updating signer document review:', error);
    return res.status(500).json({ error: 'Failed to update signer document review' });
  }
});

router.put('/:id/pay', requireAuth, requireRole(['signer']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId, paymentMethod } = req.body || {};

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    if (String(existing.ownerId || '') !== String(req.auth.userId)) {
      return res.status(403).json({ error: 'Forbidden: you can only pay for your own document sessions' });
    }

    const amountDue = Number(existing.sessionAmount || 0);
    if (amountDue <= 0) {
      return res.status(400).json({ error: 'No payment is required for this session' });
    }

    const currentPaymentStatus = String(existing.paymentStatus || '').trim().toLowerCase();
    if (currentPaymentStatus === 'paid') {
      return res.json(existing);
    }

    const nowMs = now();
    await dbRun(
      `
      UPDATE owner_documents
      SET paymentStatus = :paymentStatus,
          paymentPaidAt = :paymentPaidAt,
          paymentTransactionId = :paymentTransactionId,
          paymentMethod = :paymentMethod
      WHERE id = :id
    `,
      {
        id,
        paymentStatus: 'paid',
        paymentPaidAt: nowMs,
        paymentTransactionId: String(transactionId || `local-${nowMs}`).trim(),
        paymentMethod: String(paymentMethod || 'local_mock').trim(),
      }
    );
    await persistDatabase();

    const updated = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(updated);
  } catch (error) {
    console.error('Error processing signer session payment:', error);
    return res.status(500).json({ error: 'Failed to process payment' });
  }
});

router.put('/:id/schedule', requireAuth, requireRole(['notary']), requireKbaApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body || {};

    const existing = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signer document not found' });
    }
    if (existing.notaryId && String(existing.notaryId) !== String(req.auth?.userId || '')) {
      return res.status(409).json({ error: 'This document is locked by another notary' });
    }

    const status = String(existing.status || '').trim().toLowerCase();
    if (status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted documents can be scheduled' });
    }

    const scheduledAtMs = new Date(scheduledAt).getTime();
    if (!Number.isFinite(scheduledAtMs)) {
      return res.status(400).json({ error: 'Invalid scheduledAt value' });
    }

    await dbRun(
      `
      UPDATE owner_documents
      SET scheduledAt = :scheduledAt,
          notaryId = :notaryId,
          notaryName = :notaryName,
          inProcess = 1,
          status = :status,
          notarized = 0,
          notaryReview = :notaryReview
      WHERE id = :id
    `,
      {
        id,
        scheduledAt: scheduledAtMs,
        notaryId: existing.notaryId || req.auth.userId,
        notaryName: existing.notaryName || req.auth.username || 'Unknown Notary',
        status: 'accepted',
        notaryReview: existing.notaryReview || 'accepted',
      }
    );
    await persistDatabase();

    const updated = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    return res.json(updated);
  } catch (error) {
    console.error('Error scheduling signer document meeting:', error);
    return res.status(500).json({ error: 'Failed to schedule signer document meeting' });
  }
});

module.exports = router;
