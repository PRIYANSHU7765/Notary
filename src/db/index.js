/**
 * Database Core Module
 * Handles initialization, persistence, and basic operations
 */

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const crypto = require('crypto');
const { initSql } = require('./schema');
const { 
  ensureUsersJsonFile, 
  appendUserToJson, 
  loadUsersFromJson, 
  syncUsersJsonFromDb 
} = require('./userSync');
const { normalizeRole } = require('../utils/normalizers');

const dbPath = path.resolve(__dirname, '../../data/notary.db');
const usersJsonPath = path.resolve(__dirname, '../../data/users.json');

let SQL = null;
let db = null;

const now = () => Math.floor(Date.now() / 1000) * 1000; // milliseconds

function normalizeParams(params = {}) {
  if (!params || typeof params !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      normalized[`:${key}`] = null;
    } else if (typeof value === 'boolean') {
      normalized[`:${key}`] = value ? 1 : 0;
    } else {
      normalized[`:${key}`] = value;
    }
  }
  return normalized;
}

function persistDatabase() {
  if (!db) throw new Error('Database not initialized');
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function dbGet(sql, params = {}) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));

  const hasRow = stmt.step();
  if (!hasRow) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  const hasValue = Object.values(row).some((value) => value !== undefined && value !== null);
  return hasValue ? row : null;
}

function dbAll(sql, params = {}) {
  if (!db) throw new Error('Database not initialized');
  try {
    const stmt = db.prepare(sql);
    stmt.bind(normalizeParams(params));
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch (error) {
    console.error('❌ Database query error:', error.message);
    throw error;
  }
}

function dbRun(sql, params = {}) {
  if (!db) throw new Error('Database not initialized');
  try {
    const stmt = db.prepare(sql);
    stmt.bind(normalizeParams(params));
    stmt.step();
    stmt.free();
  } catch (error) {
    console.error('❌ Database execution error:', error.message);
    throw error;
  }
}

function isDatabaseCorrupted(dbInstance) {
  try {
    const stmt = dbInstance.prepare('PRAGMA integrity_check');
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result?.integrity_check !== 'ok';
  } catch {
    return true;
  }
}

async function initDatabase() {
  console.log('🔧 Initializing database...');
  
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '../../node_modules/sql.js/dist', file),
  });

  const notarizedDir = path.resolve(__dirname, '../../data/notarized');
  if (!fs.existsSync(notarizedDir)) {
    fs.mkdirSync(notarizedDir, { recursive: true });
  }

  // Load or create database
  try {
    if (fs.existsSync(dbPath)) {
      const filebuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(filebuffer);

      if (isDatabaseCorrupted(db)) {
        throw new Error('Integrity check failed');
      }
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    console.warn('⚠️ Failed to load database, creating fresh:', err.message);
    db = new SQL.Database();
  }

  // Initialize schema
  db.exec(initSql);
  ensureUsersKbaSchema();
  ensureOwnerDocumentsSchema();
  ensureSessionsSchema();
  ensureAssetsSchema();
  ensureKbaSchema();
  ensureNotaryCallsSchema();
  ensureRecordingsSchema();
  dropLegacyDocumentsTable();
  
  // Load users
  loadUsersFromJson();
  ensureSeedAdminUser();
  
  // Save
  persistDatabase();
  console.log('✅ Database initialized');
}

function getDatabase() {
  return db;
}

function getSql() {
  return SQL;
}

function ensureSessionsSchema() {
  try {
    const cols = dbGet("PRAGMA table_info(sessions)");
    if (!cols) {
      // Table creation is handled by initSql
      console.log('Sessions table created by initSql');
    }
  } catch (err) {
    console.error('Sessions schema error:', err.message);
  }
}

function ensureOwnerDocumentsSchema() {
  try {
    // Table creation is handled by initSql, but you can add migration logic here
    console.log('Owner documents schema ensured');
  } catch (err) {
    console.error('Owner documents schema error:', err.message);
  }
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

function ensureKbaSchema() {
  try {
    console.log('KBA schema ensured');
  } catch (err) {
    console.error('KBA schema error:', err.message);
  }
}

function ensureNotaryCallsSchema() {
  try {
    console.log('Notary calls schema ensured');
  } catch (err) {
    console.error('Notary calls schema error:', err.message);
  }
}

function ensureRecordingsSchema() {
  try {
    console.log('Recordings schema ensured');
  } catch (err) {
    console.error('Recordings schema error:', err.message);
  }
}

function dropLegacyDocumentsTable() {
  try {
    // Drop if exists (for backward compatibility)
    dbRun('DROP TABLE IF EXISTS documents');
    console.log('Legacy documents table dropped');
  } catch (err) {
    console.warn('Warning dropping legacy table:', err.message);
  }
}

function ensureSeedAdminUser() {
  const {
    ADMIN_SEED_USER_ID,
    ADMIN_SEED_USERNAME,
    ADMIN_SEED_EMAIL,
    ADMIN_SEED_PASSWORD,
  } = require('../utils/env');
  const { hashPassword } = require('../services/authService');

  const existing = dbGet('SELECT * FROM users WHERE userId = :userId', { 
    userId: ADMIN_SEED_USER_ID 
  });

  if (!existing) {
    console.log('📝 Creating seed admin user...');
    const passwordHash = hashPassword(ADMIN_SEED_PASSWORD);
    dbRun(
      'INSERT INTO users (userId, username, email, passwordHash, role, createdAt, otpVerified, kbaStatus, kbaApprovedAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt, :otpVerified, :kbaStatus, :kbaApprovedAt)',
      {
        userId: ADMIN_SEED_USER_ID,
        username: ADMIN_SEED_USERNAME,
        email: ADMIN_SEED_EMAIL,
        passwordHash,
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
      passwordHash,
      role: 'admin',
      createdAt: now(),
    });
    persistDatabase();
  }
}

module.exports = {
  initDatabase,
  getDatabase,
  getSql,
  now,
  persistDatabase,
  dbGet,
  dbAll,
  dbRun,
  normalizeParams,
};
