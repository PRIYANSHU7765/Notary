/**
 * Database Core Module
 * PostgreSQL backend with node-postgres
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { initSql } = require('./schema');
const {
  ensureUsersJsonFile,
  appendUserToJson,
  loadUsersFromJson,
  syncUsersJsonFromDb,
} = require('./userSync');
const { normalizeRole } = require('../utils/normalizers');
const { verifyPassword } = require('../services/authService');

const ENV_DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
const PG_CONFIG = {
  connectionString: ENV_DB_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 2000),
};

const now = () => Math.floor(Date.now());

let pool = null;

function bindNamedParams(sql, params = {}) {
  const values = [];
  const nameIndexMap = {};

  // PostgreSQL cannot infer parameter types in patterns like
  // `:param IS NULL OR column = :param` when the runtime value is null.
  // Casting the null-check side avoids 42P08 errors while preserving semantics.
  const sqlWithTypedNullChecks = String(sql).replace(
    /:(\w+)\s+IS\s+NULL/gi,
    'CAST(:$1 AS TEXT) IS NULL'
  );

  const text = sqlWithTypedNullChecks.replace(/:(\w+)/g, (match, paramName) => {
    if (!(paramName in params)) {
      throw new Error(`Missing query parameter: ${paramName}`);
    }

    if (!(paramName in nameIndexMap)) {
      values.push(params[paramName]);
      nameIndexMap[paramName] = values.length;
    }

    return `$${nameIndexMap[paramName]}`;
  });

  return { text, values };
}

function toCamelCase(name) {
  if (!name || typeof name !== 'string') return name;

  const canonicalFields = [
    'userId', 'username', 'email', 'passwordHash', 'role', 'createdAt', 'otpVerified', 'kbaStatus',
    'kbaApprovedAt', 'kbaRejectedReason', 'kbaUpdatedAt', 'phoneNumber',
    'id', 'destination', 'channel', 'otpHash', 'expiresAt', 'attempts', 'maxAttempts', 'verifiedAt',
    'documentType', 'fileNameFront', 'mimeTypeFront', 'filePathFront', 'fileNameBack', 'mimeTypeBack',
    'filePathBack', 'submittedAt', 'status', 'rejectionReason', 'reviewedAt', 'reviewedBy', 'metadata',
    'sessionId', 'name', 'image', 'userRole', 'updatedAt', 'text', 'width', 'height',
    'ownerId', 'ownerUsername', 'notaryIds', 'participants', 'active', 'terminated',
    'ownerName', 'scheduledAt', 'size', 'type', 'dataUrl', 'notarizedDataUrl', 'notarizedPath', 'uploadedAt',
    'inProcess', 'notarized', 'notarizedAt', 'notaryId', 'notaryName', 'notaryReview', 'notaryReviewedAt',
    'sessionAmount', 'paymentStatus', 'paymentRequestedAt', 'paymentRequestedBy', 'paymentPaidAt',
    'paymentTransactionId', 'paymentMethod',
    'documentId', 'documentName', 'callType', 'amount', 'startedAt', 'completedAt', 'duration',
    'fileName', 'mimeType', 'sizeBytes', 'provider', 'providerFileId', 'providerUrl', 'shareUrl',
    'errorMessage', 'endedAt', 'durationMs', 'count'
  ];
  const special = Object.fromEntries(canonicalFields.map((field) => [field.toLowerCase(), field]));

  const lower = name.toLowerCase();
  if (special[lower]) return special[lower];

  if (name.includes('_')) {
    return name
      .split('_')
      .map((segment, idx) =>
        idx === 0 ? segment.toLowerCase() : segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
      )
      .join('');
  }

  return name;
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = value;
    const camel = toCamelCase(key);
    if (camel !== key) {
      result[camel] = value;
    }
  }
  return result;
}

async function persistDatabase() {
  // No-op for PostgreSQL.
  return;
}

async function dbGet(sql, params = {}) {
  if (!pool) throw new Error('PostgreSQL pool is not initialized');
  const query = bindNamedParams(sql, params);
  const result = await pool.query(query.text, query.values);
  if (!result.rows || result.rows.length === 0) return null;
  return normalizeRow(result.rows[0]);
}

async function dbAll(sql, params = {}) {
  if (!pool) throw new Error('PostgreSQL pool is not initialized');
  const query = bindNamedParams(sql, params);
  const result = await pool.query(query.text, query.values);
  return (result.rows || []).map(normalizeRow);
}

async function dbRun(sql, params = {}) {
  if (!pool) throw new Error('PostgreSQL pool is not initialized');
  const query = bindNamedParams(sql, params);
  const result = await pool.query(query.text, query.values);
  return result;
}

function ensureUsersKbaSchema() {
  try {
    // Schema is created by initSql; this helper exists for backward compatibility
    console.log('Users and KBA schema ensured');
  } catch (err) {
    console.error('Users/KBA schema error:', err.message);
  }
}

function ensureAssetsSchema() {
  try {
    console.log('Assets schema ensured');
  } catch (err) {
    console.error('Assets schema error:', err.message);
  }
}

async function initDatabase() {
  console.log('🔧 Initializing PostgreSQL database...');

  if (!ENV_DB_URL) {
    throw new Error('Database URL is missing. Set POSTGRES_URL or DATABASE_URL in environment.');
  }

  pool = new Pool(PG_CONFIG);

  // test connection
  await pool.query('SELECT 1');

  // create schema if missing
  const sqlStatements = initSql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of sqlStatements) {
    await pool.query(statement);
  }

  await ensureSessionsSchemaCompatibility();
  await ensureOwnerDocumentsSchemaCompatibility();
  ensureUsersKbaSchema();
  ensureAssetsSchema();

  // For safety: do not auto-import all users from users.json on startup.
  // This ensures users are controlled by admin actions only.
  await ensureSeedAdminUser();

  console.log('✅ PostgreSQL database initialized');
}

async function ensureSessionsSchemaCompatibility() {
  await pool.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS startedAt BIGINT');
  await pool.query('ALTER TABLE sessions ADD COLUMN IF NOT EXISTS endedAt BIGINT');
}

async function ensureOwnerDocumentsSchemaCompatibility() {
  // Keep legacy and migrated deployments compatible with current API writes.
  await pool.query('ALTER TABLE owner_documents ADD COLUMN IF NOT EXISTS startedAt BIGINT');
  await pool.query('ALTER TABLE owner_documents ADD COLUMN IF NOT EXISTS endedAt BIGINT');
}

async function ensureSeedAdminUser() {
  const {
    ADMIN_SEED_USER_ID,
    ADMIN_SEED_USERNAME,
    ADMIN_SEED_EMAIL,
    ADMIN_SEED_PASSWORD,
  } = require('../utils/env');
  const { hashPassword } = require('../services/authService');

  const existing = await dbGet(
    'SELECT * FROM users WHERE username = :username OR email = :email',
    {
      username: ADMIN_SEED_USERNAME,
      email: ADMIN_SEED_EMAIL,
    }
  );

  const desiredPasswordHash = hashPassword(ADMIN_SEED_PASSWORD);

  if (!existing) {
    console.log('📝 Creating seed admin user...');

    await dbRun(
      'INSERT INTO users (userId, username, email, passwordHash, role, createdAt, otpVerified, kbaStatus, kbaApprovedAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt, :otpVerified, :kbaStatus, :kbaApprovedAt)',
      {
        userId: ADMIN_SEED_USER_ID,
        username: ADMIN_SEED_USERNAME,
        email: ADMIN_SEED_EMAIL,
        passwordHash: desiredPasswordHash,
        role: 'admin',
        createdAt: now(),
        otpVerified: 1,
        kbaStatus: 'kba_approved',
        kbaApprovedAt: now(),
      }
    );

    appendUserToJson({
      userId: ADMIN_SEED_USER_ID,
      username: ADMIN_SEED_USERNAME,
      email: ADMIN_SEED_EMAIL,
      passwordHash: desiredPasswordHash,
      role: 'admin',
      createdAt: new Date(now()).toISOString(),
    });
  } else {
    // Ensure admin account has a usable password and role
    let needsUpdate = false;
    const updates = {}; 

    if (!existing.passwordHash || !verifyPassword(ADMIN_SEED_PASSWORD, existing.passwordHash)) {
      needsUpdate = true;
      updates.passwordHash = desiredPasswordHash;
    }

    if (existing.role !== 'admin') {
      needsUpdate = true;
      updates.role = 'admin';
    }

    if (Number(existing.otpVerified || 0) === 0) {
      needsUpdate = true;
      updates.otpVerified = 1;
    }

    if (!existing.kbaStatus || existing.kbaStatus !== 'kba_approved') {
      needsUpdate = true;
      updates.kbaStatus = 'kba_approved';
      updates.kbaApprovedAt = now();
    }

    if (needsUpdate) {
      console.log('🔧 Updating existing admin user credentials and status.');
      await dbRun(
        'UPDATE users SET passwordHash = :passwordHash, role = :role, otpVerified = :otpVerified, kbaStatus = :kbaStatus, kbaApprovedAt = :kbaApprovedAt WHERE userId = :userId',
        {
          userId: existing.userId,
          passwordHash: updates.passwordHash || existing.passwordHash,
          role: updates.role || existing.role,
          otpVerified: updates.otpVerified !== undefined ? updates.otpVerified : existing.otpVerified,
          kbaStatus: updates.kbaStatus || existing.kbaStatus,
          kbaApprovedAt: updates.kbaApprovedAt || existing.kbaApprovedAt,
        }
      );
    }
  }
}



async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = {
  initDatabase,
  getDatabase: () => pool,
  now,
  persistDatabase,
  dbGet,
  dbAll,
  dbRun,
  closeDatabase,
};
