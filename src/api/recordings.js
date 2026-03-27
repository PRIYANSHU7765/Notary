/**
 * Recordings Routes
 */
const express = require('express');
const crypto = require('crypto');
const { requireAuth, requireRole } = require('../middleware/auth');
const { normalizeRole, normalizeRoomId } = require('../utils/normalizers');
const { parseDataUrlPayload, sanitizeFileName } = require('../utils/file');
const { RECORDING_UPLOAD_MAX_BYTES } = require('../utils/env');
const { uploadRecordingToOneDrive, isOneDriveConfigured } = require('../services/oneDriveService');
const { now, dbAll, dbGet, dbRun, persistDatabase } = require('../db');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const { sessionId, status, provider } = req.query;

    const recordings = await dbAll(
      `SELECT * FROM recordings
       WHERE (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:status IS NULL OR status = :status)
         AND (:provider IS NULL OR provider = :provider)
       ORDER BY createdAt DESC`,
      {
        sessionId: sessionId ? String(sessionId) : null,
        status: status ? String(status) : null,
        provider: provider ? String(provider) : null,
      }
    );

    res.json(recordings);
  } catch (error) {
    console.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

router.post('/upload', requireAuth, requireRole(['notary', 'signer']), async (req, res) => {
  const nowMs = now();
  const recordingId = crypto.randomUUID();

  try {
    const {
      sessionId,
      fileName,
      mimeType,
      dataUrl,
      startedAt,
      endedAt,
      durationMs,
      role,
    } = req.body || {};

    const normalizedSessionId = normalizeRoomId(sessionId);
    if (!normalizedSessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }
    if (!dataUrl) {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    const parsed = parseDataUrlPayload(dataUrl);
    const buffer = Buffer.from(parsed.base64Payload, 'base64');
    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: 'Recording payload is empty or invalid' });
    }
    if (buffer.length > RECORDING_UPLOAD_MAX_BYTES) {
      return res.status(413).json({ error: `Recording exceeds max upload size (${RECORDING_UPLOAD_MAX_BYTES} bytes)` });
    }

    const resolvedMimeType = String(mimeType || parsed.mimeType || 'video/webm').trim() || 'video/webm';
    const resolvedFileName = sanitizeFileName(fileName || `recording-${Date.now()}.webm`);
    const startedAtMs = startedAt ? Number(new Date(startedAt).getTime()) : null;
    const endedAtMs = endedAt ? Number(new Date(endedAt).getTime()) : null;
    const duration = Number.isFinite(Number(durationMs)) ? Math.max(0, Number(durationMs)) : null;

    let uploadResult = {
      provider: 'local',
      providerFileId: null,
      providerUrl: null,
      shareUrl: null,
      sizeBytes: buffer.length,
    };

    if (isOneDriveConfigured()) {
      uploadResult = await uploadRecordingToOneDrive({
        fileBuffer: buffer,
        fileName: resolvedFileName,
        mimeType: resolvedMimeType,
        sessionId: normalizedSessionId,
      });
    }

    await dbRun(
      `INSERT INTO recordings (
        id, sessionId, userId, username, userRole,
        fileName, mimeType, sizeBytes,
        provider, providerFileId, providerUrl, shareUrl,
        status, errorMessage,
        startedAt, endedAt, durationMs,
        createdAt, updatedAt
      ) VALUES (
        :id, :sessionId, :userId, :username, :userRole,
        :fileName, :mimeType, :sizeBytes,
        :provider, :providerFileId, :providerUrl, :shareUrl,
        :status, :errorMessage,
        :startedAt, :endedAt, :durationMs,
        :createdAt, :updatedAt
      )`,
      {
        id: recordingId,
        sessionId: normalizedSessionId,
        userId: req.auth?.userId || null,
        username: req.auth?.username || null,
        userRole: normalizeRole(role || req.auth?.role || ''),
        fileName: resolvedFileName,
        mimeType: resolvedMimeType,
        sizeBytes: Number(uploadResult.sizeBytes || buffer.length || 0),
        provider: uploadResult.provider || 'local',
        providerFileId: uploadResult.providerFileId || null,
        providerUrl: uploadResult.providerUrl || null,
        shareUrl: uploadResult.shareUrl || null,
        status: 'uploaded',
        errorMessage: null,
        startedAt: Number.isFinite(startedAtMs) ? startedAtMs : null,
        endedAt: Number.isFinite(endedAtMs) ? endedAtMs : null,
        durationMs: duration,
        createdAt: nowMs,
        updatedAt: nowMs,
      }
    );

    await persistDatabase();
    const saved = await dbGet('SELECT * FROM recordings WHERE id = :id', { id: recordingId });
    res.json({ recording: saved });
  } catch (error) {
    console.error('Error uploading recording:', error);

    try {
      await dbRun(
        `INSERT INTO recordings (
          id, sessionId, userId, username, userRole,
          fileName, mimeType, sizeBytes,
          provider, providerFileId, providerUrl, shareUrl,
          status, errorMessage,
          startedAt, endedAt, durationMs,
          createdAt, updatedAt
        ) VALUES (
          :id, :sessionId, :userId, :username, :userRole,
          :fileName, :mimeType, :sizeBytes,
          :provider, :providerFileId, :providerUrl, :shareUrl,
          :status, :errorMessage,
          :startedAt, :endedAt, :durationMs,
          :createdAt, :updatedAt
        )`,
        {
          id: recordingId,
          sessionId: normalizeRoomId(req.body?.sessionId) || 'unknown-session',
          userId: req.auth?.userId || null,
          username: req.auth?.username || null,
          userRole: normalizeRole(req.body?.role || req.auth?.role || ''),
          fileName: sanitizeFileName(req.body?.fileName || `recording-${Date.now()}.webm`),
          mimeType: String(req.body?.mimeType || 'video/webm'),
          sizeBytes: null,
          provider: isOneDriveConfigured() ? 'onedrive' : 'local',
          providerFileId: null,
          providerUrl: null,
          shareUrl: null,
          status: 'failed',
          errorMessage: String(error?.message || 'Failed to upload recording').slice(0, 1000),
          startedAt: null,
          endedAt: null,
          durationMs: null,
          createdAt: nowMs,
          updatedAt: nowMs,
        }
      );
      await persistDatabase();
    } catch (dbErr) {
      console.warn('Failed to persist failed recording row:', dbErr?.message || dbErr);
    }

    res.status(500).json({ error: error?.message || 'Failed to upload recording' });
  }
});

module.exports = router;
