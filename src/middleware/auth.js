/**
 * Authentication Middleware
 * Validates tokens and loads user context
 */

const { readAuthToken, verifyAccessToken } = require('../services/authService');
const { dbGet } = require('../db');
const { isKbaApprovedStatus, shouldRequireKbaForRole } = require('../utils/validators');

const requireAuth = async (req, res, next) => {
  try {
    const token = readAuthToken(req);
    const payload = verifyAccessToken(token);

    if (!payload) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: Invalid or missing token' });
    }

    const user = await dbGet(
      'SELECT userId, username, email, role, otpVerified, kbaStatus, kbaApprovedAt, kbaRejectedReason, phoneNumber FROM users WHERE userId = :userId',
      { userId: payload.userId }
    );

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Unauthorized: User not found' });
    }

    req.auth = {
      userId: user.userId,
      username: user.username,
      email: user.email,
      role: user.role,
      otpVerified: Number(user.otpVerified || 0),
      kbaStatus: user.kbaStatus || 'draft',
      kbaApprovedAt: user.kbaApprovedAt,
      phoneNumber: user.phoneNumber,
    };

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ ok: false, error: 'Authentication service error' });
  }
};

const requireRole = (allowedRoles = []) => (req, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const normalizedAllowed = allowedRoles.map((r) => String(r).trim().toLowerCase());
  const userRole = String(req.auth.role).trim().toLowerCase();

  if (!normalizedAllowed.includes(userRole)) {
    return res.status(403).json({ ok: false, error: 'Forbidden: Insufficient privileges' });
  }

  next();
};

const requireKbaApproved = (req, res, next) => {
  if (!req.auth) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (!shouldRequireKbaForRole(req.auth.role)) {
    return next();
  }

  if (Number(req.auth.otpVerified) === 0) {
    return res.status(403).json({ ok: false, error: 'KBA not verified: OTP verification required' });
  }

  if (!isKbaApprovedStatus(req.auth.kbaStatus)) {
    return res.status(403).json({ ok: false, error: `KBA verification required (current status: ${req.auth.kbaStatus})` });
  }

  next();
};

module.exports = {
  requireAuth,
  requireRole,
  requireKbaApproved,
};
