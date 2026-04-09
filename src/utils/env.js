/**
 * Environment Configuration
 * Loads and validates all environment variables
 */

const path = require('path');

const normalizeUrl = (value) => {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '');
};

const parsePort = (value, fallback) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return fallback;
  return port;
};

const isDevTunnelOrigin = (origin) => {
  try {
    const host = new URL(origin).hostname;
    return /(^|\.)devtunnels\.ms$/i.test(host);
  } catch {
    return false;
  }
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true;
  if (isDevTunnelOrigin(origin)) return true;
  return false;
};

const PORT = parsePort(process.env.PORT, 5000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = normalizeUrl(process.env.FRONTEND_URL) || 'http://localhost:3000';

const STATIC_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  FRONTEND_URL,
  'https://notaryqwe45r67857.vercel.app',
  'https://notary-platform.vercel.app',
].filter(Boolean);

const AUTH_SECRET = process.env.AUTH_SECRET || 'notary-dev-auth-secret';
const ADMIN_SEED_USER_ID = process.env.ADMIN_SEED_USER_ID || 'admin-seed-001';
const ADMIN_SEED_USERNAME = process.env.ADMIN_SEED_USERNAME || 'admin';
const ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@notary.local';
const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '';

const OTP_CHANNEL_DEFAULT = process.env.OTP_CHANNEL_DEFAULT || 'email';
const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 10 * 60 * 1000);

const KBA_STORAGE_DIR = path.resolve(__dirname, '../../data/kba');
const RECORDING_UPLOAD_MAX_BYTES = Number(process.env.RECORDING_UPLOAD_MAX_BYTES || 120 * 1024 * 1024);

const ONEDRIVE_TENANT_ID = String(process.env.ONEDRIVE_TENANT_ID || '').trim();
const ONEDRIVE_CLIENT_ID = String(process.env.ONEDRIVE_CLIENT_ID || '').trim();
const ONEDRIVE_CLIENT_SECRET = String(process.env.ONEDRIVE_CLIENT_SECRET || '').trim();
const ONEDRIVE_DRIVE_ID = String(process.env.ONEDRIVE_DRIVE_ID || '').trim();
const ONEDRIVE_USER_ID = String(process.env.ONEDRIVE_USER_ID || '').trim();
const ONEDRIVE_FOLDER_PATH = String(process.env.ONEDRIVE_FOLDER_PATH || '/NotaryRecordings').trim() || '/NotaryRecordings';
const ONEDRIVE_SHARE_SCOPE = String(process.env.ONEDRIVE_SHARE_SCOPE || 'organization').trim().toLowerCase();

const SIGNATURE_PYTHON_EXECUTABLE = String(process.env.SIGNATURE_PYTHON_EXECUTABLE || 'python').trim() || 'python';
const SIGNATURE_PYTHON_TIMEOUT_MS = Number(process.env.SIGNATURE_PYTHON_TIMEOUT_MS || 120000);
const SIGNATURE_PYTHON_SCRIPT = path.resolve(__dirname, '../../scripts/signature_detector.py');

module.exports = {
  parsePort,
  isDevTunnelOrigin,
  isAllowedOrigin,
  PORT,
  NODE_ENV,
  FRONTEND_URL,
  STATIC_ALLOWED_ORIGINS,
  AUTH_SECRET,
  ADMIN_SEED_USER_ID,
  ADMIN_SEED_USERNAME,
  ADMIN_SEED_EMAIL,
  ADMIN_SEED_PASSWORD,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM,
  OTP_CHANNEL_DEFAULT,
  OTP_TTL_MS,
  KBA_STORAGE_DIR,
  RECORDING_UPLOAD_MAX_BYTES,
  ONEDRIVE_TENANT_ID,
  ONEDRIVE_CLIENT_ID,
  ONEDRIVE_CLIENT_SECRET,
  ONEDRIVE_DRIVE_ID,
  ONEDRIVE_USER_ID,
  ONEDRIVE_FOLDER_PATH,
  ONEDRIVE_SHARE_SCOPE,
  SIGNATURE_PYTHON_EXECUTABLE,
  SIGNATURE_PYTHON_TIMEOUT_MS,
  SIGNATURE_PYTHON_SCRIPT,
};
