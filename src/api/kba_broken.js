/**
 * KBA Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');
const { dbGet, dbAll, dbRun, now, persistDatabase } = require('../db');
const { hashOtpCode, sendOtpViaEmail, isValidEmailAddress } = require('../utils/kbaUtils');
const { KBA_STATUS } = require('../utils/constants');

// KBA storage directory
const KBA_STORAGE_DIR = path.resolve(__dirname, '..', '..', 'data', 'kba');

function ensureKbaStorageDir() {
  if (!fs.existsSync(KBA_STORAGE_DIR)) {
    fs.mkdirSync(KBA_STORAGE_DIR, { recursive: true });
    console.log('✅ KBA storage directory created:', KBA_STORAGE_DIR);
  }
}

router.post('/otp/send', requireAuth, async (req, res) => {
  try {
    const currentUser = await dbGet('SELECT otpVerified, kbaStatus, email FROM users WHERE userId = :userId', { userId: req.auth.userId });

    if (currentUser && Number(currentUser.otpVerified) === 1) {
      return res.status(400).json({ ok: false, error: 'OTP already verified; cannot send another OTP' });
    }

    if (currentUser && String(currentUser.kbaStatus || '').toLowerCase() === KBA_STATUS.PENDING_REVIEW) {
      return res.status(400).json({ ok: false, error: 'KBA submission is pending review; cannot send OTP' });
    }

    const channel = String(req.body?.channel || 'email').trim().toLowerCase();
    const destination = String(req.body?.destination || currentUser?.email || '').trim().toLowerCase();

    if (!destination || channel !== 'email') {
      return res.status(400).json({ ok: false, error: 'A valid email destination is required' });
    }

    if (!isValidEmailAddress(destination)) {
      return res.status(400).json({ ok: false, error: 'A valid email address is required' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const challengeId = require('crypto').randomUUID();
    const nowMs = now();

    await dbRun('DELETE FROM otp_challenges WHERE userId = :userId', { userId: req.auth.userId });
    await dbRun(
      `INSERT INTO otp_challenges (id, userId, destination, channel, otpHash, expiresAt, attempts, maxAttempts, verifiedAt, createdAt)
       VALUES (:id, :userId, :destination, :channel, :otpHash, :expiresAt, :attempts, :maxAttempts, :verifiedAt, :createdAt)`,
      {
        id: challengeId,
        userId: req.auth.userId,
        destination,
        channel,
        otpHash: hashOtpCode(otpCode),
        expiresAt: nowMs + Number(process.env.OTP_TTL_MS || 10 * 60 * 1000),
        attempts: 0,
        maxAttempts: 5,
        verifiedAt: null,
        createdAt: nowMs,
      }
    );

    await dbRun(
      `UPDATE users SET phoneNumber = :phoneNumber, otpVerified = 0, kbaStatus = :kbaStatus, kbaUpdatedAt = :kbaUpdatedAt WHERE userId = :userId`,
      {
        userId: req.auth.userId,
        phoneNumber: destination,
        kbaStatus: KBA_STATUS.OTP_PENDING,
        kbaUpdatedAt: nowMs,
      }
    );

    await persistDatabase();

    await sendOtpViaEmail({ destination, code: otpCode });

    const responsePayload = {
      ok: true,
      challengeId,
      destination,
      channel,
      expiresAt: nowMs + Number(process.env.OTP_TTL_MS || 10 * 60 * 1000),
      kbaStatus: KBA_STATUS.OTP_PENDING,
    };

    if (process.env.NODE_ENV === 'development') {
      // For local development and testing only, expose OTP to frontend (no email needed)
      responsePayload.debugOtp = otpCode;
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error('Error sending KBA OTP:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to send OTP' });
  }
});

router.post('/otp/verify', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT otpVerified FROM users WHERE userId = :userId', { userId: req.auth.userId });
    if (user && Number(user.otpVerified) === 1) {
      return res.status(400).json({ ok: false, error: 'OTP already verified; verification cannot be repeated' });
    }

    const otpCode = String(req.body?.otp || '').trim();
    if (!otpCode) {
      return res.status(400).json({ ok: false, error: 'otp is required' });
    }

    const challenge = await dbGet(
      `SELECT * FROM otp_challenges WHERE userId = :userId ORDER BY createdAt DESC LIMIT 1`,
      { userId: req.auth.userId }
    );

    if (!challenge) {
      return res.status(404).json({ ok: false, error: 'OTP challenge not found. Request a new OTP.' });
    }

    const nowMs = now();
    if (Number(challenge.verifiedAt || 0) > 0) {
      return res.status(400).json({ ok: false, error: 'OTP already verified' });
    }
    if (Number(challenge.expiresAt) < nowMs) {
      return res.status(400).json({ ok: false, error: 'OTP expired. Request a new OTP.' });
    }
    if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || 5)) {
      return res.status(429).json({ ok: false, error: 'Maximum OTP attempts reached. Request a new OTP.' });
    }

    const computedHash = hashOtpCode(otpCode);
    const storedHash = String(challenge.otpHash || '');
    const verified = computedHash === storedHash;

    if (!verified) {
      dbRun('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = :id', { id: challenge.id });
      await persistDatabase();
      
      // Enhanced error response with debugging info in development mode
      const response = { 
        ok: false, 
        error: 'Invalid OTP code',
        attemptsRemaining: Math.max(0, (challenge.maxAttempts || 5) - (Number(challenge.attempts || 0) + 1))
      };
      
      if (process.env.NODE_ENV === 'development') {
        response.debug = {
          provided: otpCode,
          hasHash: !!storedHash,
          computedHashLength: computedHash.length,
          storedHashLength: storedHash.length
        };
      }
      
      return res.status(400).json(response);
    }

    // OTP is valid - mark it as verified in the challenge
    dbRun('UPDATE otp_challenges SET verifiedAt = :verifiedAt WHERE id = :id', {
      id: challenge.id,
      verifiedAt: nowMs,
    });

    // Update user OTP verification status
    dbRun(
      `UPDATE users SET otpVerified = 1, kbaStatus = :kbaStatus, kbaUpdatedAt = :kbaUpdatedAt, kbaRejectedReason = NULL WHERE userId = :userId`,
      {
        userId: req.auth.userId,
        kbaStatus: KBA_STATUS.OTP_VERIFIED,
        kbaUpdatedAt: nowMs,
      }
    );

    await persistDatabase();

    console.log(`[KBA OTP Verify] OTP verification successful for user ${req.auth.userId}`);

    return res.json({ ok: true, otpVerified: true, kbaStatus: KBA_STATUS.OTP_VERIFIED });
  } catch (error) {
    console.error('Error verifying KBA OTP:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to verify OTP' });
  }
});

router.post('/upload', requireAuth, async (req, res) => {
  try {
    const documentType = String(req.body?.documentType || '').trim();
    let front = req.body?.front || {};
    let back = req.body?.back || {};

    // Backward compatibility: old client may send documentDataUrl directly
    if (!front.documentDataUrl && req.body?.documentDataUrl) {
      front = {
        fileName: String(req.body?.fileName || 'kba-document').trim(),
        mimeType: String(req.body?.mimeType || 'application/octet-stream').trim(),
        documentDataUrl: String(req.body?.documentDataUrl || '').trim(),
      };
      back = back || {};
    }

    const fileNameFront = String(front.fileName || '').trim();
    const mimeTypeFront = String(front.mimeType || 'application/octet-stream').trim();
    const documentDataUrlFront = String(front.documentDataUrl || '').trim();

    const fileNameBack = String(back.fileName || '').trim();
    const mimeTypeBack = String(back.mimeType || 'application/octet-stream').trim();
    const documentDataUrlBack = String(back.documentDataUrl || '').trim();

    console.log(`[KBA Upload] Validating: documentType=${documentType}, frontFile=${fileNameFront}, backFile=${fileNameBack}`);
    console.log(`[KBA Upload] Front dataUrl length: ${documentDataUrlFront.length}, Back dataUrl length: ${documentDataUrlBack.length}`);

    // Validation
    if (!documentType) {
      return res.status(400).json({ ok: false, error: 'documentType is required' });
    }

    if (!fileNameFront) {
      return res.status(400).json({ ok: false, error: 'Front side: fileName is required' });
    }
    if (!documentDataUrlFront) {
      return res.status(400).json({ ok: false, error: 'Front side: documentDataUrl is required (file data missing)' });
    }

    if (!fileNameBack) {
      return res.status(400).json({ ok: false, error: 'Back side: fileName is required' });
    }
    if (!documentDataUrlBack) {
      return res.status(400).json({ ok: false, error: 'Back side: documentDataUrl is required (file data missing)' });
    }

    // Check OTP verification status - read directly from database
    const user = dbGet('SELECT otpVerified, kbaStatus FROM users WHERE userId = :userId', { userId: req.auth.userId });
    console.log(`[KBA Upload] OTP Check for user ${req.auth.userId}:`, {
      userExists: !!user,
      otpVerified: user?.otpVerified,
      kbaStatus: user?.kbaStatus,
      otpVerifiedType: typeof user?.otpVerified,
      otpVerifiedValue: user?.otpVerified ? 'truthy' : 'falsy',
    });

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    const otpVerifiedValue = user.otpVerified;
    const isOtpVerified = otpVerifiedValue === 1 || otpVerifiedValue === true || otpVerifiedValue === '1' || Number(otpVerifiedValue) === 1;
    
    if (!isOtpVerified) {
      console.log(`[KBA Upload] OTP not verified for user ${req.auth.userId}. Value: ${otpVerifiedValue} (type: ${typeof otpVerifiedValue})`);
      return res.status(403).json({ ok: false, error: 'Verify OTP before uploading KBA documents', otpVerified: otpVerifiedValue });
    }

    const nowMs = now();
    ensureKbaStorageDir();

    // Helper to save file side
    const saveSide = (sideFileName, sideMimeType, sideDataUrl, sideLabel) => {
      const ext = path.extname(sideFileName) || '.bin';
      const safeExt = /^[.A-Za-z0-9_-]+$/.test(ext) ? ext : '.bin';
      const outPath = path.join(KBA_STORAGE_DIR, `${req.auth.userId}-${sideLabel}-${nowMs}${safeExt}`);
      const base64Payload = sideDataUrl.includes(',') ? sideDataUrl.split(',')[1] : sideDataUrl;
      const buffer = Buffer.from(base64Payload, 'base64');
      fs.writeFileSync(outPath, buffer);
      return { outPath, fileSize: buffer.length };
    };

    // Save both sides
    const frontSave = saveSide(fileNameFront, mimeTypeFront, documentDataUrlFront, 'front');
    const backSave = saveSide(fileNameBack, mimeTypeBack, documentDataUrlBack, 'back');

    console.log(`[KBA Upload] Files saved - Front: ${frontSave.fileSize} bytes, Back: ${backSave.fileSize} bytes`);

    // Insert or update kba_submissions record
    dbRun(
      `INSERT INTO kba_submissions (userId, documentType, fileNameFront, mimeTypeFront, filePathFront, fileNameBack, mimeTypeBack, filePathBack, submittedAt, status, rejectionReason, reviewedAt, reviewedBy, metadata)
       VALUES (:userId, :documentType, :fileNameFront, :mimeTypeFront, :filePathFront, :fileNameBack, :mimeTypeBack, :filePathBack, :submittedAt, :status, :rejectionReason, :reviewedAt, :reviewedBy, :metadata)
       ON CONFLICT(userId) DO UPDATE SET
         documentType = excluded.documentType,
         fileNameFront = excluded.fileNameFront,
         mimeTypeFront = excluded.mimeTypeFront,
         filePathFront = excluded.filePathFront,
         fileNameBack = excluded.fileNameBack,
         mimeTypeBack = excluded.mimeTypeBack,
         filePathBack = excluded.filePathBack,
         submittedAt = excluded.submittedAt,
         status = excluded.status,
         rejectionReason = excluded.rejectionReason,
         reviewedAt = excluded.reviewedAt,
         reviewedBy = excluded.reviewedBy,
         metadata = excluded.metadata`,
      {
        userId: req.auth.userId,
        documentType,
        fileNameFront,
        mimeTypeFront,
        filePathFront: frontSave.outPath,
        fileNameBack,
        mimeTypeBack,
        filePathBack: backSave.outPath,
        submittedAt: nowMs,
        status: KBA_STATUS.PENDING_REVIEW,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        metadata: JSON.stringify({ frontSize: frontSave.fileSize, backSize: backSave.fileSize }),
      }
    );

    // Update user KBA status
    dbRun(
      `UPDATE users
       SET kbaStatus = :kbaStatus,
           kbaUpdatedAt = :kbaUpdatedAt,
           kbaRejectedReason = NULL
       WHERE userId = :userId`,
      {
        userId: req.auth.userId,
        kbaStatus: KBA_STATUS.PENDING_REVIEW,
        kbaUpdatedAt: nowMs,
      }
    );

    await persistDatabase();

    console.log(`[KBA Upload] Documents successfully stored for user ${req.auth.userId}`);

    return res.json({
      ok: true,
      kbaStatus: KBA_STATUS.PENDING_REVIEW,
      submittedAt: nowMs,
      documentType,
      fileNameFront,
      fileNameBack,
    });
  } catch (error) {
    console.error('[KBA Upload] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to upload KBA document' });
  }
});

    const nowMs = now();
    ensureKbaStorageDir();

    // Helper to save file side
    const saveSide = (sideFileName, sideMimeType, sideDataUrl, sideLabel) => {
      const ext = path.extname(sideFileName) || '.bin';
      const safeExt = /^[.A-Za-z0-9_-]+$/.test(ext) ? ext : '.bin';
      const outPath = path.join(KBA_STORAGE_DIR, `${req.auth.userId}-${sideLabel}-${nowMs}${safeExt}`);
      const base64Payload = sideDataUrl.includes(',') ? sideDataUrl.split(',')[1] : sideDataUrl;
      const buffer = Buffer.from(base64Payload, 'base64');
      fs.writeFileSync(outPath, buffer);
      return { outPath, fileSize: buffer.length };
    };

    // Save both sides
    const frontSave = saveSide(fileNameFront, mimeTypeFront, documentDataUrlFront, 'front');
    const backSave = saveSide(fileNameBack, mimeTypeBack, documentDataUrlBack, 'back');

    console.log(`[KBA Upload] Files saved - Front: ${frontSave.fileSize} bytes, Back: ${backSave.fileSize} bytes`);

    // Insert or update kba_submissions record
    dbRun(
      `INSERT INTO kba_submissions (userId, documentType, fileNameFront, mimeTypeFront, filePathFront, fileNameBack, mimeTypeBack, filePathBack, submittedAt, status, rejectionReason, reviewedAt, reviewedBy, metadata)
       VALUES (:userId, :documentType, :fileNameFront, :mimeTypeFront, :filePathFront, :fileNameBack, :mimeTypeBack, :filePathBack, :submittedAt, :status, :rejectionReason, :reviewedAt, :reviewedBy, :metadata)
       ON CONFLICT(userId) DO UPDATE SET
         documentType = excluded.documentType,
         fileNameFront = excluded.fileNameFront,
         mimeTypeFront = excluded.mimeTypeFront,
         filePathFront = excluded.filePathFront,
         fileNameBack = excluded.fileNameBack,
         mimeTypeBack = excluded.mimeTypeBack,
         filePathBack = excluded.filePathBack,
         submittedAt = excluded.submittedAt,
         status = excluded.status,
         rejectionReason = excluded.rejectionReason,
         reviewedAt = excluded.reviewedAt,
         reviewedBy = excluded.reviewedBy,
         metadata = excluded.metadata`,
      {
        userId: req.auth.userId,
        documentType,
        fileNameFront,
        mimeTypeFront,
        filePathFront: frontSave.outPath,
        fileNameBack,
        mimeTypeBack,
        filePathBack: backSave.outPath,
        submittedAt: nowMs,
        status: KBA_STATUS.PENDING_REVIEW,
        rejectionReason: null,
        reviewedAt: null,
        reviewedBy: null,
        metadata: JSON.stringify({ frontSize: frontSave.fileSize, backSize: backSave.fileSize }),
      }
    );

    // Update user KBA status
    dbRun(
      `UPDATE users
       SET kbaStatus = :kbaStatus,
           kbaUpdatedAt = :kbaUpdatedAt,
           kbaRejectedReason = NULL
       WHERE userId = :userId`,
      {
        userId: req.auth.userId,
        kbaStatus: KBA_STATUS.PENDING_REVIEW,
        kbaUpdatedAt: nowMs,
      }
    );

    await persistDatabase();

    console.log(`[KBA Upload] Documents successfully stored for user ${req.auth.userId}`);

    return res.json({
      ok: true,
      kbaStatus: KBA_STATUS.PENDING_REVIEW,
      submittedAt: nowMs,
      documentType,
      fileNameFront,
      fileNameBack,
    });
  } catch (error) {
    console.error('[KBA Upload] Error:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to upload KBA document' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await dbGet('SELECT kbaStatus, otpVerified FROM users WHERE userId = :userId', { userId: req.auth.userId });
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    return res.json({ ok: true, kbaStatus: user.kbaStatus || KBA_STATUS.DRAFT, otpVerified: Boolean(Number(user.otpVerified)) });
  } catch (error) {
    console.error('Error fetching KBA status:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to fetch KBA status' });
  }
});

router.post('/cancel', requireAuth, async (req, res) => {
  try {
    await dbRun('DELETE FROM otp_challenges WHERE userId = :userId', { userId: req.auth.userId });
    await dbRun('UPDATE users SET kbaStatus = :kbaStatus, otpVerified = 0, kbaUpdatedAt = :kbaUpdatedAt WHERE userId = :userId', {
      userId: req.auth.userId,
      kbaStatus: KBA_STATUS.DRAFT,
      kbaUpdatedAt: now(),
    });
    await persistDatabase();
    return res.json({ ok: true });
  } catch (error) {
    console.error('Error cancelling KBA request:', error);
    return res.status(500).json({ ok: false, error: error.message || 'Failed to cancel KBA request' });
  }
});

module.exports = router;
