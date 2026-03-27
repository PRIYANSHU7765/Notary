/**
 * Documents Routes
 */
const express = require('express');
const { now, dbAll, dbGet, dbRun, persistDatabase } = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const {
      id,
      sessionId,
      ownerId,
      ownerName,
      name,
      size,
      type,
      dataUrl,
      uploadedAt,
      notarized,
    } = req.body || {};

    const safeOwnerName = String(ownerName || '').trim() || 'Signer';

    if (!id || !sessionId || !ownerId || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, sessionId, ownerId, name' });
    }

    const nowMs = now();
    const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : nowMs;

    const status = notarized ? 'pending_review' : 'uploaded';
    const inProcess = ['pending_review', 'accepted', 'session_started'].includes(status) ? 1 : 0;

    await dbRun(
      `
      INSERT INTO owner_documents (id, ownerId, ownerName, sessionId, name, size, type, dataUrl, notarizedDataUrl, uploadedAt, inProcess, notarized, notarizedAt, notaryId, notaryName, notaryReview, notaryReviewedAt, status)
      VALUES (:id, :ownerId, :ownerName, :sessionId, :name, :size, :type, :dataUrl, :notarizedDataUrl, :uploadedAt, :inProcess, :notarized, :notarizedAt, :notaryId, :notaryName, :notaryReview, :notaryReviewedAt, :status)
      ON CONFLICT(id) DO UPDATE SET
        ownerId = excluded.ownerId,
        ownerName = excluded.ownerName,
        sessionId = excluded.sessionId,
        dataUrl = excluded.dataUrl,
        notarizedDataUrl = excluded.notarizedDataUrl,
        inProcess = excluded.inProcess,
        status = excluded.status,
        notaryId = excluded.notaryId,
        notaryName = excluded.notaryName,
        name = excluded.name,
        size = excluded.size,
        type = excluded.type,
        uploadedAt = excluded.uploadedAt,
        notarized = excluded.notarized,
        notarizedAt = excluded.notarizedAt,
        notaryReview = excluded.notaryReview,
        notaryReviewedAt = excluded.notaryReviewedAt
    `,
      {
        id,
        sessionId,
        ownerId,
        ownerName: safeOwnerName,
        notaryId: null,
        notaryName: null,
        name,
        size: Number(size) || 0,
        type: type || 'application/octet-stream',
        dataUrl: typeof dataUrl === 'string' ? dataUrl : null,
        notarizedDataUrl: typeof req.body?.notarizedDataUrl === 'string' ? req.body.notarizedDataUrl : null,
        uploadedAt: uploadedMs,
        inProcess,
        notarized: notarized ? 1 : 0,
        notarizedAt: notarized ? nowMs : null,
        notaryReview: notarized ? 'pending' : null,
        notaryReviewedAt: null,
        status,
      }
    );
    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    res.json(document);
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document', details: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { sessionId, ownerId } = req.query;

    const documents = await dbAll(
      `SELECT * FROM owner_documents
       WHERE (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:ownerId IS NULL OR ownerId = :ownerId)
       ORDER BY uploadedAt DESC`,
      { sessionId: sessionId || null, ownerId: ownerId || null }
    );

    res.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.get('/notarized', async (req, res) => {
  try {
    const { sessionId, ownerId } = req.query;

    const documents = await dbAll(
      `SELECT * FROM owner_documents
       WHERE notarized = 1
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:ownerId IS NULL OR ownerId = :ownerId)
       ORDER BY uploadedAt DESC`,
      { sessionId: sessionId || null, ownerId: ownerId || null }
    );

    res.json(documents);
  } catch (error) {
    console.error('Error fetching notarized documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

router.put('/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { notaryReview, notaryName } = req.body || {};

    if (!notaryReview || !['accepted', 'rejected', 'pending'].includes(notaryReview)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }

    const nowMs = now();
    const normalizedReview = String(notaryReview).trim().toLowerCase();
    const status =
      normalizedReview === 'accepted'
        ? 'accepted'
        : normalizedReview === 'rejected'
        ? 'rejected'
        : 'pending_review';

    const inProcess = ['pending_review', 'accepted', 'session_started'].includes(status) ? 1 : 0;
    const notarized = status === 'notarized' ? 1 : 0;
    const notarizedAt = notarized ? nowMs : null;

    await dbRun(
      `
      UPDATE owner_documents
      SET notaryReview = :notaryReview,
          notaryReviewedAt = :notaryReviewedAt,
          notaryName = :notaryName,
          inProcess = :inProcess,
          notarized = :notarized,
          notarizedAt = :notarizedAt,
          status = :status
      WHERE id = :id
    `,
      {
        id,
        notaryReview: normalizedReview,
        notaryName: notaryName || 'Unknown Notary',
        notaryReviewedAt: nowMs,
        inProcess,
        notarized,
        notarizedAt,
        status,
      }
    );

    await persistDatabase();

    const document = await dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error updating document review:', error);
    res.status(500).json({ error: 'Failed to update document review' });
  }
});

module.exports = router;
