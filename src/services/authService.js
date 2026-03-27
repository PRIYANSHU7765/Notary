/**
 * Authentication Service
 * Password hashing, token creation, and verification
 */

const crypto = require('crypto');
const { AUTH_SECRET } = require('../utils/env');
const { KBA_STATUS } = require('./constants');

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPassword = (password, hashedPassword) => {
  const [salt, storedHash] = String(hashedPassword || '').split(':');
  if (!salt || !storedHash) return false;
  const candidateHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(storedHash, 'hex');
  const b = Buffer.from(candidateHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const createToken = (user) => {
  const payload = {
    sub: user.username,
    userId: user.userId,
    role: user.role,
    kbaStatus: user.kbaStatus || KBA_STATUS.DRAFT,
    iat: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const verifyAccessToken = (token) => {
  if (!token || typeof token !== 'string') return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    return decoded;
  } catch {
    return null;
  }
};

const readAuthToken = (req) => {
  const authorization = String(req.headers?.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;
  return authorization.slice(7).trim();
};

const generateOtpCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;
const hashOtpCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');

module.exports = {
  hashPassword,
  verifyPassword,
  createToken,
  verifyAccessToken,
  readAuthToken,
  generateOtpCode,
  hashOtpCode,
};
