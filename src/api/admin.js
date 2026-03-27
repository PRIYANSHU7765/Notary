/**
 * Admin Routes
 */
const express = require('express');
const fs = require('fs');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { dbAll, dbGet, dbRun, now, persistDatabase } = require('../db');
const { normalizeRole } = require('../utils/normalizers');
const { syncUsersJsonFromDb } = require('../db/userSync');
const { KBA_STATUS } = require('../utils/constants');
const { hashPassword } = require('../services/authService');
const { ADMIN_SEED_USER_ID, ADMIN_SEED_USERNAME } = require('../utils/env');

router.get('/overview', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const users = await dbAll('SELECT userId, username, email, role, createdAt, otpVerified, kbaStatus FROM users ORDER BY createdAt DESC');

    const documents = await dbAll(
      `SELECT id, ownerId, ownerName, sessionId, status, uploadedAt, scheduledAt, notarized, paymentStatus, sessionAmount 
      FROM owner_documents ORDER BY uploadedAt DESC LIMIT 10`
    );

    const activeSessions = await dbAll(
      `SELECT sessionId, ownerId, ownerUsername, participants, active, terminated, createdAt, updatedAt
      FROM sessions WHERE active = 1 ORDER BY updatedAt DESC LIMIT 20`
    );

    const pendingKba = await dbAll(
      `SELECT u.userId, u.username, u.email, u.role, u.kbaStatus, u.kbaUpdatedAt,
              s.documentType,
              s.fileNameFront, s.mimeTypeFront, s.filePathFront,
              s.fileNameBack, s.mimeTypeBack, s.filePathBack,
              s.submittedAt, s.status, s.rejectionReason
       FROM users u
       LEFT JOIN kba_submissions s ON s.userId = u.userId
       WHERE u.kbaStatus IN (:pendingStatus, :rejectedStatus)
       ORDER BY COALESCE(s.submittedAt, u.kbaUpdatedAt) DESC`,
      {
        pendingStatus: KBA_STATUS.PENDING_REVIEW,
        rejectedStatus: KBA_STATUS.REJECTED,
      }
    );

    const summary = {
      totalUsers: users.length,
      totalSigners: users.filter((user) => String(user.role).toLowerCase() === 'signer').length,
      totalNotaries: users.filter((user) => String(user.role).toLowerCase() === 'notary').length,
      totalAdmins: users.filter((user) => String(user.role).toLowerCase() === 'admin').length,
      totalDocuments: await dbAll('SELECT COUNT(*) as count FROM owner_documents').then((rows) => rows[0]?.count || 0),
      totalActiveSessions: activeSessions.length,
      pendingKbaCount: pendingKba.length,
    };

    // Keep backward compatibility with the current frontend fields.
    summary.signers = summary.totalSigners;
    summary.notaries = summary.totalNotaries;
    summary.admins = summary.totalAdmins;
    summary.activeSessions = summary.totalActiveSessions;
    summary.activeUsers = users.filter((u) => Number(u.active || 0) === 1).length;
    summary.notarizedDocuments = await dbAll('SELECT COUNT(*) as count FROM owner_documents WHERE notarized = 1').then((rows) => Number(rows[0]?.count || 0));
    summary.inProcessDocuments = await dbAll('SELECT COUNT(*) as count FROM owner_documents WHERE inProcess = 1').then((rows) => Number(rows[0]?.count || 0));

    res.json({
      ok: true,
      summary,
      users,
      recentDocuments: documents,
      activeSessions,
      pendingKba,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to get admin overview' });
  }
});

router.get('/users/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const user = await dbAll('SELECT userId, username, email, role, createdAt, otpVerified, kbaStatus FROM users WHERE userId = :userId', {
      userId: req.params.userId,
    });

    if (!user || user.length === 0) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user: user[0] });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to get user detail' });
  }
});

router.put('/users/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const existing = await dbGet('SELECT * FROM users WHERE userId = :userId', { userId });
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const incomingUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const incomingEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const incomingRole = normalizeRole(req.body?.role || existing.role);
    const incomingPassword = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!incomingUsername || !incomingEmail) {
      return res.status(400).json({ ok: false, error: 'username and email are required' });
    }
    if (!['signer', 'notary', 'admin'].includes(incomingRole)) {
      return res.status(400).json({ ok: false, error: 'role must be signer, notary, or admin' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(incomingEmail)) {
      return res.status(400).json({ ok: false, error: 'Invalid email format' });
    }

    const duplicateUsername = await dbGet(
      'SELECT userId FROM users WHERE username = :username AND userId != :userId',
      { username: incomingUsername, userId }
    );
    if (duplicateUsername) {
      return res.status(409).json({ ok: false, error: 'Username is already taken' });
    }

    const duplicateEmail = await dbGet(
      'SELECT userId FROM users WHERE email = :email AND userId != :userId',
      { email: incomingEmail, userId }
    );
    if (duplicateEmail) {
      return res.status(409).json({ ok: false, error: 'Email is already registered' });
    }

    const passwordHash = incomingPassword ? hashPassword(incomingPassword) : existing.passwordHash;

    await dbRun(
      `UPDATE users
       SET username = :username,
           email = :email,
           role = :role,
           passwordHash = :passwordHash
       WHERE userId = :userId`,
      {
        userId,
        username: incomingUsername,
        email: incomingEmail,
        role: incomingRole,
        passwordHash,
      }
    );

    await persistDatabase();
    await syncUsersJsonFromDb(dbAll);

    const updated = await dbGet(
      'SELECT userId, username, email, role, createdAt, otpVerified, kbaStatus FROM users WHERE userId = :userId',
      { userId }
    );
    return res.json({ ok: true, user: updated });
  } catch (error) {
    console.error('Error updating user from admin:', error);
    return res.status(500).json({ ok: false, error: 'Failed to update user' });
  }
});

router.delete('/users/:userId', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const existing = await dbGet('SELECT * FROM users WHERE userId = :userId', { userId });
    if (!existing) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const normalizedUsername = String(existing.username || '').trim().toLowerCase();
    if (
      existing.userId === ADMIN_SEED_USER_ID ||
      normalizedUsername === String(ADMIN_SEED_USERNAME || '').trim().toLowerCase()
    ) {
      return res.status(400).json({ ok: false, error: 'Seeded admin account cannot be deleted' });
    }

    await dbRun('DELETE FROM users WHERE userId = :userId', { userId });
    await persistDatabase();
    await syncUsersJsonFromDb(dbAll);

    return res.json({ ok: true, success: true, deletedUserId: userId });
  } catch (error) {
    console.error('Error deleting user from admin:', error);
    return res.status(500).json({ ok: false, error: 'Failed to delete user' });
  }
});

router.post('/sessions/:sessionId/terminate', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { dbRun } = require('../db');

    await dbRun('UPDATE sessions SET active = 0, terminated = 1, updatedAt = :updatedAt WHERE sessionId = :sessionId', {
      sessionId,
      updatedAt: Date.now(),
    });

    res.json({ ok: true, message: 'Session terminated' });
  } catch (err) {
    console.error('Admin terminate session error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to terminate session' });
  }
});

router.get('/kba/pending', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const pending = await dbAll(
      `SELECT u.userId, u.username, u.email, u.role, u.kbaStatus, u.kbaUpdatedAt,
              s.documentType,
              s.fileNameFront, s.mimeTypeFront, s.filePathFront,
              s.fileNameBack, s.mimeTypeBack, s.filePathBack,
              s.submittedAt, s.status, s.rejectionReason
       FROM users u
       LEFT JOIN kba_submissions s ON s.userId = u.userId
       WHERE u.kbaStatus IN (:pendingStatus, :rejectedStatus)
       ORDER BY COALESCE(s.submittedAt, u.kbaUpdatedAt) DESC`,
      {
        pendingStatus: KBA_STATUS.PENDING_REVIEW,
        rejectedStatus: KBA_STATUS.REJECTED,
      }
    );
    res.json(Array.isArray(pending) ? pending : []);
  } catch (err) {
    console.error('Admin KBA pending error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to fetch KBA pending submissions' });
  }
});

router.get('/kba/:userId/document', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const side = String(req.query?.side || 'front').toLowerCase();

    const submission = await dbGet(
      `SELECT filePathFront, mimeTypeFront, fileNameFront,
              filePathBack, mimeTypeBack, fileNameBack
       FROM kba_submissions WHERE userId = :userId`,
      { userId }
    );

    if (!submission) {
      return res.status(404).json({ ok: false, error: 'KBA submission not found' });
    }

    const filePath = side === 'back' ? submission.filePathBack : submission.filePathFront;
    const mimeType = side === 'back' ? submission.mimeTypeBack : submission.mimeTypeFront;
    const fileName = side === 'back' ? submission.fileNameBack : submission.fileNameFront;

    if (!filePath) {
      return res.status(404).json({ ok: false, error: `KBA ${side} document file path not stored` });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'Document file not found on server' });
    }

    const buffer = fs.readFileSync(filePath);
    res.setHeader('Content-Type', mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${fileName || `kba-${side}`}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(buffer);
  } catch (error) {
    console.error('Error retrieving KBA document:', error);
    return res.status(500).json({ ok: false, error: 'Failed to retrieve KBA document' });
  }
});

router.put('/kba/:userId/approve', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await dbGet('SELECT userId FROM users WHERE userId = :userId', { userId });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const nowMs = now();
    await dbRun(
      `UPDATE users
       SET otpVerified = 1,
           kbaStatus = :kbaStatus,
           kbaApprovedAt = :kbaApprovedAt,
           kbaRejectedReason = NULL,
           kbaUpdatedAt = :kbaUpdatedAt
       WHERE userId = :userId`,
      {
        userId,
        kbaStatus: KBA_STATUS.APPROVED,
        kbaApprovedAt: nowMs,
        kbaUpdatedAt: nowMs,
      }
    );

    await dbRun(
      `UPDATE kba_submissions
       SET status = :status,
           rejectionReason = NULL,
           reviewedAt = :reviewedAt,
           reviewedBy = :reviewedBy
       WHERE userId = :userId`,
      {
        userId,
        status: KBA_STATUS.APPROVED,
        reviewedAt: nowMs,
        reviewedBy: req.auth.userId,
      }
    );

    await persistDatabase();
    return res.json({ ok: true, success: true, userId, kbaStatus: KBA_STATUS.APPROVED, approvedAt: nowMs });
  } catch (error) {
    console.error('Error approving KBA:', error);
    return res.status(500).json({ ok: false, error: 'Failed to approve KBA' });
  }
});

router.put('/kba/:userId/reject', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { userId } = req.params;
    const reason = String(req.body?.reason || '').trim() || 'KBA documents could not be verified';

    const user = await dbGet('SELECT userId FROM users WHERE userId = :userId', { userId });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const nowMs = now();
    await dbRun(
      `UPDATE users
       SET kbaStatus = :kbaStatus,
           kbaRejectedReason = :kbaRejectedReason,
           kbaUpdatedAt = :kbaUpdatedAt
       WHERE userId = :userId`,
      {
        userId,
        kbaStatus: KBA_STATUS.REJECTED,
        kbaRejectedReason: reason,
        kbaUpdatedAt: nowMs,
      }
    );

    await dbRun(
      `UPDATE kba_submissions
       SET status = :status,
           rejectionReason = :rejectionReason,
           reviewedAt = :reviewedAt,
           reviewedBy = :reviewedBy
       WHERE userId = :userId`,
      {
        userId,
        status: KBA_STATUS.REJECTED,
        rejectionReason: reason,
        reviewedAt: nowMs,
        reviewedBy: req.auth.userId,
      }
    );

    await persistDatabase();
    return res.json({ ok: true, success: true, userId, kbaStatus: KBA_STATUS.REJECTED, reason });
  } catch (error) {
    console.error('Error rejecting KBA:', error);
    return res.status(500).json({ ok: false, error: 'Failed to reject KBA' });
  }
});

module.exports = router;
