/**
 * NOTARIZATION PLATFORM - Backend Server
 * Socket.io Server for Real-time Synchronization
 * 
 * Environment Variables:
 * - PORT: Server port (default: 5000)
 * - NODE_ENV: development or production
 * - FRONTEND_URL: Frontend domain for CORS
 */

require('dotenv').config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const app = express();
const server = http.createServer(app);

// Environment variables
const parsePort = (value, fallback) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) return fallback;
  return port;
};

const PORT = parsePort(process.env.PORT, 5000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS configuration for production
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    FRONTEND_URL,
    'https://notaryqwe45r67857.vercel.app', // Your actual Vercel domain
    'https://notary-platform.vercel.app', // Fallback Vercel domain
  ],
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  credentials: true,
};

const io = socketIO(server, {
  cors: corsOptions,
  maxHttpBufferSize: 20e6, // allow up to 20 MB for PDF data transfers
});

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup SQLite database (using sql.js in Node to avoid native build tool requirements)
const dbPath = path.resolve(__dirname, 'data', 'notary.db');
const usersJsonPath = path.resolve(__dirname, 'data', 'users.json');

function ensureUsersJsonFile() {
  if (!fs.existsSync(path.dirname(usersJsonPath))) {
    fs.mkdirSync(path.dirname(usersJsonPath), { recursive: true });
  }
  if (!fs.existsSync(usersJsonPath)) {
    fs.writeFileSync(usersJsonPath, '[]', 'utf8');
  }
}

function appendUserToJson(user) {
  try {
    ensureUsersJsonFile();
    const raw = fs.readFileSync(usersJsonPath, 'utf8');
    const users = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    const exists = users.some((u) => u.username === user.username || u.email === user.email);
    if (!exists) {
      users.push({
        userId: user.userId,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: new Date(user.createdAt).toISOString(),
      });
      fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('⚠️ Failed to write user to JSON store:', err.message || err);
  }
}

function loadUsersFromJson() {
  try {
    ensureUsersJsonFile();
    const raw = fs.readFileSync(usersJsonPath, 'utf8');
    const users = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    for (const user of users) {
      const createdAt = typeof user.createdAt === 'number'
        ? user.createdAt
        : Date.parse(user.createdAt) || now();
      dbRun(
        'INSERT OR IGNORE INTO users (userId, username, email, passwordHash, role, createdAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt)',
        {
          userId: user.userId || crypto.randomUUID(),
          username: String(user.username || '').trim(),
          email: String(user.email || '').trim().toLowerCase(),
          passwordHash: String(user.passwordHash || ''),
          role: normalizeRole(user.role),
          createdAt,
        }
      );
    }
  } catch (err) {
    console.warn('⚠️ Failed to load users from JSON store:', err.message || err);
  }
}

function syncUsersJsonFromDb() {
  try {
    ensureUsersJsonFile();
    const users = dbAll(
      'SELECT userId, username, email, passwordHash, role, createdAt FROM users ORDER BY createdAt DESC'
    ).map((user) => ({
      userId: user.userId,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: new Date(Number(user.createdAt) || Date.now()).toISOString(),
    }));
    fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Failed to sync users JSON store:', err.message || err);
  }
}

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

let SQL;
let db;

const initSql = `
CREATE TABLE IF NOT EXISTS users (
  userId TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  userId TEXT,
  username TEXT,
  name TEXT,
  image TEXT NOT NULL,
  userRole TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  sessionId TEXT,
  userId TEXT,
  username TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  image TEXT,
  text TEXT,
  width INTEGER,
  height INTEGER,
  userRole TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  sessionId TEXT PRIMARY KEY,
  ownerId TEXT,
  ownerUsername TEXT,
  notaryIds TEXT,
  participants TEXT,
  active INTEGER DEFAULT 1,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS owner_documents (
  id TEXT PRIMARY KEY,
  ownerId TEXT NOT NULL,
  ownerName TEXT NOT NULL,
  sessionId TEXT,
  scheduledAt INTEGER,
  name TEXT NOT NULL,
  size INTEGER,
  type TEXT,
  dataUrl TEXT,
  notarizedDataUrl TEXT,
  notarizedPath TEXT,
  uploadedAt INTEGER NOT NULL,
  inProcess INTEGER NOT NULL DEFAULT 0,
  notarized INTEGER NOT NULL DEFAULT 0,
  notarizedAt INTEGER,
  notaryId TEXT,
  notaryName TEXT,
  notaryReview TEXT DEFAULT 'pending',
  notaryReviewedAt INTEGER,
  status TEXT NOT NULL DEFAULT 'uploaded'
);
`;

const now = () => Math.floor(Date.now());

function persistDatabase() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function normalizeParams(params = {}) {
  if (!params || typeof params !== 'object') return params;
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(':') || key.startsWith('@') || key.startsWith('$')) {
      normalized[key] = value;
    } else {
      normalized[`:${key}`] = value;
    }
  }
  return normalized;
}

function dbGet(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));

  const hasRow = stmt.step();
  if (!hasRow) {
    stmt.free();
    return null;
  }

  const row = stmt.getAsObject();
  stmt.free();

  // Ensure we didn't get a row with all undefined (sql.js quirk)
  const hasValue = Object.values(row).some((value) => value !== undefined && value !== null);
  return hasValue ? row : null;
}

function isDatabaseCorrupted(dbInstance) {
  try {
    const res = dbInstance.exec("PRAGMA integrity_check;");
    const status = res?.[0]?.values?.[0]?.[0];
    return status !== "ok";
  } catch {
    return true;
  }
}

function recoverDatabase(reason) {
  console.warn(`⚠️ Recovering database due to: ${reason}`);
  try {
    if (fs.existsSync(dbPath)) {
      const backupPath = `${dbPath}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(dbPath, backupPath);
        console.warn(`⚠️ Corrupted DB backed up to: ${backupPath}`);
      } catch (renameErr) {
        console.warn('⚠️ Failed to rename corrupted DB, attempting delete:', renameErr?.message || renameErr);
        try {
          fs.unlinkSync(dbPath);
          console.warn('⚠️ Corrupted DB deleted to allow fresh creation.');
        } catch (unlinkErr) {
          console.warn('⚠️ Failed to delete corrupted DB file:', unlinkErr?.message || unlinkErr);
        }
      }
    }
  } catch (backupError) {
    console.warn('⚠️ Failed to backup corrupted database file:', backupError?.message || backupError);
  }

  // Create a fresh database
  db = new SQL.Database();
  db.exec(initSql);
  ensureOwnerDocumentsSchema();
  ensureAssetsSchema();
  dropLegacyDocumentsTable();
  setupPreparedStatements();
  loadUsersFromJson();
  ensureSeedAdminUser();
  persistDatabase();
}

function dbAll(sql, params = {}) {
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
    const msg = (error && error.message) || String(error);
    if (msg.includes('disk image is malformed') || msg.includes('database disk image is malformed')) {
      recoverDatabase(msg);
      return [];
    }
    throw error;
  }
}

function dbRun(sql, params = {}) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(normalizeParams(params));
    stmt.step();
    stmt.free();
  } catch (error) {
    const msg = (error && error.message) || String(error);
    if (msg.includes('disk image is malformed') || msg.includes('database disk image is malformed')) {
      recoverDatabase(msg);
      return;
    }
    throw error;
  }
}

async function initDatabase() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });

  // Ensure the notarized output directory exists.
  const notarizedDir = path.resolve(__dirname, "data", "notarized");
  if (!fs.existsSync(notarizedDir)) {
    fs.mkdirSync(notarizedDir, { recursive: true });
  }

  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(new Uint8Array(buffer));

      if (isDatabaseCorrupted(db)) {
        console.warn('⚠️ Detected corrupted database on startup, rebuilding.');
        recoverDatabase('integrity check failed');
      }
    } else {
      db = new SQL.Database();
    }
  } catch (err) {
    console.warn('⚠️ Failed to load existing DB, rebuilding:', err?.message || err);
    recoverDatabase(err?.message || 'load error');
  }

  db.exec(initSql);
  ensureOwnerDocumentsSchema();
  ensureAssetsSchema();
  dropLegacyDocumentsTable();
  setupPreparedStatements();
  loadUsersFromJson();
  ensureSeedAdminUser();
  persistDatabase();
}

function ensureOwnerDocumentsSchema() {
  try {
    const res = db.exec("PRAGMA table_info(owner_documents);");
    const columns = (res[0]?.values || []).map((row) => row[1]);
    if (!columns.includes('status')) {
      console.log('🔧 Adding missing owner_documents.status column');
      db.exec("ALTER TABLE owner_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'uploaded';");
    }
    if (!columns.includes('dataUrl')) {
      console.log('🔧 Adding missing owner_documents.dataUrl column');
      db.exec("ALTER TABLE owner_documents ADD COLUMN dataUrl TEXT;");
    }
    if (!columns.includes('notarizedDataUrl')) {
      console.log('🔧 Adding missing owner_documents.notarizedDataUrl column');
      db.exec("ALTER TABLE owner_documents ADD COLUMN notarizedDataUrl TEXT;");
    }
    if (!columns.includes('notarizedPath')) {
      console.log('🔧 Adding missing owner_documents.notarizedPath column');
      db.exec("ALTER TABLE owner_documents ADD COLUMN notarizedPath TEXT;");
    }
    if (!columns.includes('scheduledAt')) {
      console.log('🔧 Adding missing owner_documents.scheduledAt column');
      db.exec("ALTER TABLE owner_documents ADD COLUMN scheduledAt INTEGER;");
    }

    // Normalize legacy rows from earlier workflow bug where accepted docs were marked notarized.
    db.exec(`
      UPDATE owner_documents
      SET notarized = 0,
          notarizedAt = NULL,
          inProcess = 1,
          status = 'accepted'
      WHERE notaryReview = 'accepted'
        AND status != 'notarized'
        AND notarized = 1
    `);
  } catch (err) {
    console.warn('⚠️ Failed to ensure owner_documents schema:', err.message || err);
  }
}

function autoStartDueScheduledMeetings() {
  try {
    const nowMs = Date.now();
    const dueDocuments = dbAll(
      `SELECT * FROM owner_documents
       WHERE status = 'accepted'
         AND scheduledAt IS NOT NULL
         AND scheduledAt <= :nowMs`,
      { nowMs }
    );

    dueDocuments.forEach((doc) => {
      dbRun(
        `
        UPDATE owner_documents
        SET status = :status,
            inProcess = :inProcess,
            notarized = :notarized,
            notaryReview = :notaryReview
        WHERE id = :id
      `,
        {
          id: doc.id,
          status: 'session_started',
          inProcess: 1,
          notarized: 0,
          notaryReview: 'accepted',
        }
      );

      const updatedDoc = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id: doc.id });
      if (!updatedDoc) return;

      io.emit('documentReviewUpdated', {
        id: updatedDoc.id,
        documentId: updatedDoc.id,
        sessionId: updatedDoc.sessionId,
        ownerId: updatedDoc.ownerId,
        notaryReview: updatedDoc.notaryReview || 'accepted',
        notaryName: updatedDoc.notaryName || 'Unknown Notary',
        notaryReviewedAt: updatedDoc.notaryReviewedAt,
        status: updatedDoc.status,
        scheduledAt: updatedDoc.scheduledAt,
      });

      io.emit('notarySessionStarted', {
        documentId: updatedDoc.id,
        sessionId: updatedDoc.sessionId,
        notaryName: updatedDoc.notaryName || 'Unknown Notary',
        notaryUserId: updatedDoc.notaryId || null,
        scheduledAt: updatedDoc.scheduledAt,
        timestamp: new Date().toISOString(),
      });

      console.log(`⏰ Auto-started scheduled meeting for document ${updatedDoc.id} at ${updatedDoc.scheduledAt}`);
    });

    if (dueDocuments.length > 0) {
      persistDatabase();
    }
  } catch (error) {
    console.error('Error auto-starting scheduled meetings:', error);
  }
}

function ensureAssetsSchema() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        sessionId TEXT,
        userId TEXT,
        username TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        image TEXT,
        text TEXT,
        width INTEGER,
        height INTEGER,
        userRole TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL
      );
    `);
  } catch (err) {
    console.warn('⚠️ Failed to ensure assets schema:', err.message || err);
  }
}

function dropLegacyDocumentsTable() {
  try {
    const hasDocumentsTable = dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='documents'"
    ).length > 0;
    if (hasDocumentsTable) {
      db.exec('DROP TABLE IF EXISTS documents;');
      console.log('🧹 Dropped legacy documents table');
    }
  } catch (err) {
    console.warn('⚠️ Failed to drop legacy documents table:', err.message || err);
  }
}

// Prepared statements (initialized when the database is ready)
let insertOrUpdateSignature;
let selectSignaturesByRole;
let deleteSignatureById;

let selectUserByUsername;
let selectUserByEmail;
let selectUserById;
let insertUser;
let selectAllUsers;

function setupPreparedStatements() {
  insertOrUpdateSignature = db.prepare(`
    INSERT INTO signatures (id, sessionId, userId, username, name, image, userRole, createdAt, updatedAt)
    VALUES (:id, :sessionId, :userId, :username, :name, :image, :userRole, :createdAt, :updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      sessionId = excluded.sessionId,
      userId = excluded.userId,
      username = excluded.username,
      name = excluded.name,
      image = excluded.image,
      userRole = excluded.userRole,
      updatedAt = excluded.updatedAt
  `);

  selectSignaturesByRole = db.prepare(`
    SELECT * FROM signatures
    WHERE userRole = :userRole
      AND (:sessionId IS NULL OR sessionId = :sessionId)
      AND (:userId IS NULL OR userId = :userId)
    ORDER BY createdAt DESC
  `);

  deleteSignatureById = db.prepare(`DELETE FROM signatures WHERE id = :id`);

  selectUserByUsername = db.prepare('SELECT * FROM users WHERE username = :username');
  selectUserByEmail = db.prepare('SELECT * FROM users WHERE email = :email');
  selectUserById = db.prepare('SELECT * FROM users WHERE userId = :userId');
  insertUser = db.prepare(
    'INSERT INTO users (userId, username, email, passwordHash, role, createdAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt)'
  );
  selectAllUsers = db.prepare('SELECT userId, username, email, role, createdAt FROM users ORDER BY createdAt DESC');
}

function upsertSessionParticipant({ sessionId, socketId, userId, username, role }) {
  if (!sessionId) return null;

  const existing = dbGet('SELECT * FROM sessions WHERE sessionId = :sessionId', { sessionId });

  const participant = { socketId, userId, username, role, joinedAt: now() };
  let participants = [];
  let notaryIds = [];

  if (existing) {
    participants = JSON.parse(existing.participants || '[]');
    notaryIds = JSON.parse(existing.notaryIds || '[]');
  }

  // Replace or add participant
  participants = participants.filter((p) => p.socketId !== socketId);
  participants.push(participant);

  if (role === 'notary' && userId) {
    notaryIds = Array.from(new Set([...notaryIds, userId]));
  }

  const ownerId = role === 'owner' ? userId : existing?.ownerId;
  const ownerUsername = role === 'owner' ? username : existing?.ownerUsername;

  const data = {
    sessionId,
    ownerId,
    ownerUsername,
    notaryIds: JSON.stringify(notaryIds),
    participants: JSON.stringify(participants),
    active: 1,
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now(),
  };

  dbRun(
    `INSERT INTO sessions (sessionId, ownerId, ownerUsername, notaryIds, participants, active, createdAt, updatedAt)
     VALUES (:sessionId, :ownerId, :ownerUsername, :notaryIds, :participants, :active, :createdAt, :updatedAt)
     ON CONFLICT(sessionId) DO UPDATE SET
       ownerId = excluded.ownerId,
       ownerUsername = excluded.ownerUsername,
       notaryIds = excluded.notaryIds,
       participants = excluded.participants,
       active = excluded.active,
       updatedAt = excluded.updatedAt`,
    data
  );

  persistDatabase();
  return data;
}

function removeSessionParticipant(sessionId, socketId) {
  if (!sessionId) return null;
  const existing = dbGet('SELECT * FROM sessions WHERE sessionId = :sessionId', { sessionId });
  if (!existing) return null;

  const participants = JSON.parse(existing.participants || '[]').filter((p) => p.socketId !== socketId);
  const notaryIds = Array.from(
    new Set(participants.filter((p) => p.role === 'notary').map((p) => p.userId))
  );

  const owner = participants.find((p) => p.role === 'owner');
  const active = participants.length > 0 ? 1 : 0;

  dbRun(
    `UPDATE sessions SET participants = :participants, notaryIds = :notaryIds, ownerId = :ownerId, ownerUsername = :ownerUsername, active = :active, updatedAt = :updatedAt WHERE sessionId = :sessionId`,
    {
      participants: JSON.stringify(participants),
      notaryIds: JSON.stringify(notaryIds),
      ownerId: owner?.userId || null,
      ownerUsername: owner?.username || null,
      active,
      updatedAt: now(),
      sessionId,
    }
  );

  persistDatabase();
  return { sessionId, participants, notaryIds, ownerId: owner?.userId, ownerUsername: owner?.username, active };
}


// Store active sessions and users
const sessions = new Map();
const userSessions = new Map();

const normalizeRoomId = (value) => {
  if (!value) return "";
  const raw = String(value).trim();

  // If a full URL is accidentally sent instead of room id, extract sessionId.
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      const sid = parsed.searchParams.get('sessionId');
      if (sid) return sid;
    } catch {
      // Continue to fallback extraction.
    }
  }

  const match = raw.match(/notary-session-[A-Za-z0-9_-]+/);
  return match ? match[0] : raw;
};

const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const AUTH_SECRET = process.env.AUTH_SECRET || 'notary-dev-auth-secret';
const ADMIN_SEED_USER_ID = process.env.ADMIN_SEED_USER_ID || 'admin-seed-001';
const ADMIN_SEED_USERNAME = process.env.ADMIN_SEED_USERNAME || 'admin';
const ADMIN_SEED_EMAIL = process.env.ADMIN_SEED_EMAIL || 'admin@notary.local';
const ADMIN_SEED_PASSWORD = process.env.ADMIN_SEED_PASSWORD || 'Admin@123';

// User-related queries are executed via helper functions (dbGet/dbAll) to keep sql.js usage consistent.

function terminateLiveSessionByAdmin({ sessionId, adminName, adminUserId, reason, documentId }) {
  const normalizedSessionId = normalizeRoomId(sessionId);
  if (!normalizedSessionId) {
    return { ok: false, code: 400, error: 'sessionId is required' };
  }

  const memorySession = sessions.get(normalizedSessionId);
  const dbSession = dbGet('SELECT * FROM sessions WHERE sessionId = :sessionId', { sessionId: normalizedSessionId });

  const memoryUsers = Array.isArray(memorySession?.users) ? memorySession.users : [];
  const dbParticipants = (() => {
    try {
      const parsed = JSON.parse(dbSession?.participants || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

  if (!memorySession && !dbSession) {
    return { ok: false, code: 404, error: 'Live session not found' };
  }

  const participantMap = new Map();
  [...memoryUsers, ...dbParticipants].forEach((user) => {
    if (!user?.socketId) return;
    participantMap.set(user.socketId, {
      socketId: user.socketId,
      userId: user.userId || null,
      username: user.username || null,
      role: normalizeRole(user.role),
    });
  });
  const participants = Array.from(participantMap.values());

  let resolvedDocumentId = documentId || null;
  let updatedDocument = null;

  if (!resolvedDocumentId) {
    const candidate = dbGet(
      `SELECT * FROM owner_documents
       WHERE sessionId = :sessionId
       ORDER BY COALESCE(notaryReviewedAt, uploadedAt) DESC, uploadedAt DESC
       LIMIT 1`,
      { sessionId: normalizedSessionId }
    );
    resolvedDocumentId = candidate?.id || null;
  }

  if (resolvedDocumentId) {
    const existing = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id: resolvedDocumentId });
    if (existing && String(existing.status || '').trim().toLowerCase() !== 'notarized' && Number(existing.notarized) !== 1) {
      const nowMs = now();
      dbRun(
        `
        UPDATE owner_documents
        SET status = :status,
            inProcess = :inProcess,
            notarized = :notarized,
            notarizedAt = :notarizedAt,
            notaryReview = :notaryReview,
            notaryReviewedAt = :notaryReviewedAt
        WHERE id = :id
      `,
        {
          id: resolvedDocumentId,
          status: 'accepted',
          inProcess: 1,
          notarized: 0,
          notarizedAt: null,
          notaryReview: 'accepted',
          notaryReviewedAt: nowMs,
        }
      );
      updatedDocument = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id: resolvedDocumentId });
    } else {
      updatedDocument = existing;
    }
  }

  dbRun(
    `UPDATE sessions
     SET active = 0,
         participants = :participants,
         notaryIds = :notaryIds,
         updatedAt = :updatedAt
     WHERE sessionId = :sessionId`,
    {
      sessionId: normalizedSessionId,
      participants: JSON.stringify([]),
      notaryIds: JSON.stringify([]),
      updatedAt: now(),
    }
  );

  participants.forEach((participant) => {
    const sock = io.sockets.sockets.get(participant.socketId);
    if (sock) {
      sock.leave(normalizedSessionId);
    }

    const tracked = userSessions.get(participant.socketId);
    if (tracked && tracked.roomId === normalizedSessionId) {
      userSessions.delete(participant.socketId);
    }
  });

  sessions.delete(normalizedSessionId);
  persistDatabase();

  const terminatedAt = new Date().toISOString();
  const adminActorName = String(adminName || '').trim() || 'Admin';
  const terminationMessage = `Admin terminated this session${reason ? `: ${reason}` : ''}`;
  const payload = {
    sessionId: normalizedSessionId,
    documentId: resolvedDocumentId || null,
    status: updatedDocument?.status || 'accepted',
    reason: reason || null,
    message: terminationMessage,
    terminatedAt,
    terminatedBy: {
      userId: adminUserId || null,
      username: adminActorName,
      role: 'admin',
    },
    participants,
  };

  io.to(normalizedSessionId).emit('usersConnected', []);
  io.emit('adminSessionTerminated', payload);

  if (resolvedDocumentId) {
    io.emit('documentReviewUpdated', {
      id: resolvedDocumentId,
      documentId: resolvedDocumentId,
      sessionId: normalizedSessionId,
      notaryReview: 'accepted',
      notaryName: updatedDocument?.notaryName || 'Notary',
      notaryReviewedAt: updatedDocument?.notaryReviewedAt || now(),
      status: updatedDocument?.status || 'accepted',
    });
  }

  io.emit('notarySessionEnded', {
    documentId: resolvedDocumentId || null,
    sessionId: normalizedSessionId,
    status: updatedDocument?.status || 'accepted',
    notaryName: updatedDocument?.notaryName || 'Notary',
    notaryUserId: updatedDocument?.notaryId || null,
    endedAt: terminatedAt,
    endedByRole: 'admin',
    terminatedBy: payload.terminatedBy,
    reason: reason || null,
    message: terminationMessage,
  });

  return {
    ok: true,
    sessionId: normalizedSessionId,
    documentId: resolvedDocumentId || null,
    message: terminationMessage,
  };
}

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
    iat: Date.now(),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
};

const ensureSeedAdminUser = () => {
  try {
    const username = String(ADMIN_SEED_USERNAME || '').trim();
    const email = String(ADMIN_SEED_EMAIL || '').trim().toLowerCase();
    const password = String(ADMIN_SEED_PASSWORD || '');
    const userId = String(ADMIN_SEED_USER_ID || '').trim() || crypto.randomUUID();

    if (!username || !email || !password) {
      console.warn('⚠️ Admin seed skipped: missing ADMIN_SEED_* env values.');
      return;
    }

    const existingByUsername = dbGet('SELECT * FROM users WHERE username = :username', { username });
    const existingByEmail = dbGet('SELECT * FROM users WHERE email = :email', { email });
    const existingUser = existingByUsername || existingByEmail;
    const createdAt = now();

    const passwordHash = hashPassword(password);

    if (!existingUser) {
      dbRun(
        'INSERT INTO users (userId, username, email, passwordHash, role, createdAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt)',
        { userId, username, email, passwordHash, role: 'admin', createdAt }
      );
      appendUserToJson({ userId, username, email, passwordHash, role: 'admin', createdAt });
      console.log(`✅ Seeded admin user created: ${username}`);
      return;
    }

    dbRun(
      'UPDATE users SET role = :role, email = :email, passwordHash = :passwordHash WHERE userId = :userId',
      {
        role: 'admin',
        email,
        passwordHash,
        userId: existingUser.userId,
      }
    );
    syncUsersJsonFromDb();
    console.log(`✅ Seeded admin credentials refreshed for user: ${username}`);
  } catch (error) {
    console.warn('⚠️ Failed to ensure seeded admin user:', error?.message || error);
  }
};

// Auth API Endpoints
app.post('/api/auth/register', (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = normalizeRole(req.body.role);

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (!['owner', 'notary'].includes(role)) {
      return res.status(400).json({ error: 'Role must be owner or notary.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    const existingUsername = dbGet('SELECT * FROM users WHERE username = :username', { username });
    console.log('existingUsername lookup:', existingUsername);
    if (existingUsername) {
      return res.status(409).json({ error: 'Username is already taken.' });
    }

    const existingEmail = dbGet('SELECT * FROM users WHERE email = :email', { email });
    console.log('existingEmail lookup:', existingEmail);
    if (existingEmail) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = hashPassword(password);
    const userId = crypto.randomUUID();
    const createdAt = now();

    console.log('Registering user:', { username, email, role });

    dbRun(
      'INSERT INTO users (userId, username, email, passwordHash, role, createdAt) VALUES (:userId, :username, :email, :passwordHash, :role, :createdAt)',
      { userId, username, email, passwordHash, role, createdAt }
    );
    persistDatabase();
    appendUserToJson({ userId, username, email, passwordHash, role, createdAt });

    const token = createToken({ username, userId, role });
    return res.json({
      user: { userId, username, email, role },
      token,
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const user = dbGet('SELECT * FROM users WHERE username = :username', { username });
    console.log('Login attempt:', { username, userFound: Boolean(user) });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const passwordMatches = verifyPassword(password, user.passwordHash);
    console.log('Password matches:', passwordMatches);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = createToken({ username: user.username, userId: user.userId, role: user.role });
    return res.json({
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Failed to login user' });
  }
});

app.get('/api/users', (req, res) => {
  try {
    const users = dbAll('SELECT userId, username, email, role, createdAt FROM users ORDER BY createdAt DESC');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/overview', (req, res) => {
  try {
    const users = dbAll('SELECT userId, username, email, role, createdAt FROM users ORDER BY createdAt DESC');
    const documents = dbAll('SELECT * FROM owner_documents ORDER BY uploadedAt DESC');

    const activeUserMap = new Map();
    for (const [socketId, info] of userSessions.entries()) {
      if (!info?.userId) continue;
      const current = activeUserMap.get(info.userId) || {
        userId: info.userId,
        username: info.username,
        role: info.role,
        sessions: new Set(),
        sockets: new Set(),
      };
      current.sessions.add(info.roomId);
      current.sockets.add(socketId);
      activeUserMap.set(info.userId, current);
    }

    const usersWithWork = users.map((user) => {
      const role = normalizeRole(user.role);
      const ownedDocs = role === 'owner'
        ? documents.filter((doc) => doc.ownerId === user.userId)
        : [];
      const reviewedDocs = role === 'notary'
        ? documents.filter((doc) => {
            const byId = String(doc.notaryId || '').trim() === String(user.userId || '').trim();
            const byName = String(doc.notaryName || '').trim().toLowerCase() === String(user.username || '').trim().toLowerCase();
            return byId || byName;
          })
        : [];

      const activeMeta = activeUserMap.get(user.userId);
      const lastOwnerActivity = ownedDocs.reduce((acc, doc) => Math.max(acc, Number(doc.uploadedAt) || 0), 0);
      const lastNotaryActivity = reviewedDocs.reduce(
        (acc, doc) => Math.max(acc, Number(doc.notaryReviewedAt) || Number(doc.notarizedAt) || 0),
        0
      );

      return {
        ...user,
        isActive: Boolean(activeMeta),
        activeSessionIds: activeMeta ? Array.from(activeMeta.sessions) : [],
        activeSocketCount: activeMeta ? activeMeta.sockets.size : 0,
        lastActivityAt: Math.max(lastOwnerActivity, lastNotaryActivity, Number(user.createdAt) || 0) || null,
        work: {
          ownedDocuments: ownedDocs.length,
          ownedNotarizedDocuments: ownedDocs.filter((doc) => Number(doc.notarized) === 1).length,
          ownedInProcessDocuments: ownedDocs.filter((doc) => Number(doc.inProcess) === 1).length,
          reviewedDocuments: reviewedDocs.length,
          finalizedNotarizations: reviewedDocs.filter((doc) => String(doc.status || '').toLowerCase() === 'notarized').length,
        },
      };
    });

    const activeSessions = Array.from(sessions.entries()).map(([sessionId, session]) => ({
      sessionId,
      createdAt: session.created || null,
      userCount: Array.isArray(session.users) ? session.users.length : 0,
      users: Array.isArray(session.users)
        ? session.users.map((u) => ({
            socketId: u.socketId,
            userId: u.userId,
            username: u.username,
            role: normalizeRole(u.role),
          }))
        : [],
    }));

    const summary = {
      totalUsers: users.length,
      owners: users.filter((u) => normalizeRole(u.role) === 'owner').length,
      notaries: users.filter((u) => normalizeRole(u.role) === 'notary').length,
      admins: users.filter((u) => normalizeRole(u.role) === 'admin').length,
      totalDocuments: documents.length,
      notarizedDocuments: documents.filter((d) => Number(d.notarized) === 1).length,
      inProcessDocuments: documents.filter((d) => Number(d.inProcess) === 1).length,
      activeUsers: activeUserMap.size,
      activeSessions: activeSessions.length,
    };

    res.json({
      summary,
      users: usersWithWork,
      recentDocuments: documents.slice(0, 100),
      activeSessions,
    });
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    res.status(500).json({ error: 'Failed to fetch admin overview' });
  }
});

app.get('/api/admin/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const user = dbGet(
      'SELECT userId, username, email, role, createdAt FROM users WHERE userId = :userId',
      { userId }
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const documents = dbAll(
      `SELECT id, ownerId, ownerName, sessionId, name, status, uploadedAt, notaryId, notaryName
       FROM owner_documents
       WHERE ownerId = :userId OR notaryId = :userId
       ORDER BY uploadedAt DESC
       LIMIT 100`,
      { userId }
    );

    const sessionsForUser = Array.from(sessions.entries())
      .filter(([, session]) => Array.isArray(session.users) && session.users.some((u) => String(u.userId || '') === String(userId)))
      .map(([sessionId, session]) => ({
        sessionId,
        userCount: Array.isArray(session.users) ? session.users.length : 0,
        createdAt: session.created || null,
      }));

    return res.json({
      user,
      work: {
        totalDocuments: documents.length,
        ownedDocuments: documents.filter((d) => String(d.ownerId || '') === String(userId)).length,
        reviewedDocuments: documents.filter((d) => String(d.notaryId || '') === String(userId)).length,
      },
      recentDocuments: documents,
      liveSessions: sessionsForUser,
    });
  } catch (error) {
    console.error('Error fetching admin user details:', error);
    return res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

app.put('/api/admin/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const existing = dbGet('SELECT * FROM users WHERE userId = :userId', { userId });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const incomingUsername = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const incomingEmail = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const incomingRole = normalizeRole(req.body.role || existing.role);
    const incomingPassword = typeof req.body.password === 'string' ? req.body.password : '';

    if (!incomingUsername || !incomingEmail) {
      return res.status(400).json({ error: 'username and email are required' });
    }

    if (!['owner', 'notary', 'admin'].includes(incomingRole)) {
      return res.status(400).json({ error: 'role must be owner, notary, or admin' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(incomingEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const duplicateUsername = dbGet(
      'SELECT userId FROM users WHERE username = :username AND userId != :userId',
      { username: incomingUsername, userId }
    );
    if (duplicateUsername) {
      return res.status(409).json({ error: 'Username is already taken' });
    }

    const duplicateEmail = dbGet(
      'SELECT userId FROM users WHERE email = :email AND userId != :userId',
      { email: incomingEmail, userId }
    );
    if (duplicateEmail) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const passwordHash = incomingPassword ? hashPassword(incomingPassword) : existing.passwordHash;

    dbRun(
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
    persistDatabase();
    syncUsersJsonFromDb();

    const updated = dbGet('SELECT userId, username, email, role, createdAt FROM users WHERE userId = :userId', { userId });
    return res.json(updated);
  } catch (error) {
    console.error('Error updating user from admin:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const existing = dbGet('SELECT * FROM users WHERE userId = :userId', { userId });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedUsername = String(existing.username || '').trim().toLowerCase();
    if (existing.userId === ADMIN_SEED_USER_ID || normalizedUsername === String(ADMIN_SEED_USERNAME || '').trim().toLowerCase()) {
      return res.status(400).json({ error: 'Seeded admin account cannot be deleted' });
    }

    const sessionsToTerminate = Array.from(sessions.entries())
      .filter(([, session]) => Array.isArray(session.users) && session.users.some((u) => String(u.userId || '') === String(userId)))
      .map(([sessionId]) => sessionId);

    sessionsToTerminate.forEach((sessionId) => {
      terminateLiveSessionByAdmin({
        sessionId,
        adminName: 'Admin',
        adminUserId: null,
        reason: `User ${existing.username} was removed by admin`,
      });
    });

    dbRun('DELETE FROM users WHERE userId = :userId', { userId });
    persistDatabase();
    syncUsersJsonFromDb();

    return res.json({
      success: true,
      deletedUserId: userId,
      terminatedSessions: sessionsToTerminate,
    });
  } catch (error) {
    console.error('Error deleting user from admin:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/admin/sessions/:sessionId/terminate', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { adminName, adminUserId, reason, documentId } = req.body || {};

    const result = terminateLiveSessionByAdmin({
      sessionId,
      adminName,
      adminUserId,
      reason,
      documentId,
    });

    if (!result.ok) {
      return res.status(result.code || 500).json({ error: result.error || 'Failed to terminate session' });
    }

    return res.json(result);
  } catch (error) {
    console.error('Error terminating session from admin:', error);
    return res.status(500).json({ error: 'Failed to terminate session' });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Notarization Platform - Backend Server',
    status: 'Running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Notarization Platform - Backend Server',
    status: 'Running',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'Server is running', 
    sessions: sessions.size,
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Get all active sessions (for monitoring)
app.get('/api/sessions', (req, res) => {
  const sessionData = Array.from(sessions.entries()).map(([id, session]) => ({
    id,
    users: session.users.length,
    created: session.created
  }));
  res.json(sessionData);
});

// Helper for case-insensitive username matching
const escapeRegExp = (string) => String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Auth API Endpoints

// Get all signatures for a user role (optionally scoped to a session or user)
app.get('/api/signatures/:userRole', (req, res) => {
  try {
    const { userRole } = req.params;
    const { sessionId, userId } = req.query;

    const signatures = dbAll(
      `SELECT * FROM signatures
       WHERE userRole = :userRole
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:userId IS NULL OR userId = :userId)
       ORDER BY createdAt DESC`,
      { userRole, sessionId: sessionId || null, userId: userId || null }
    );

    res.json(signatures);
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

// Save a new signature
app.post('/api/signatures', (req, res) => {
  try {
    const { id, sessionId, userId, username, name, image, userRole } = req.body;

    console.log('🔐 POST /api/signatures received:', {
      id,
      sessionId,
      userId,
      username,
      name,
      userRole,
      imageLength: image?.length,
    });

    if (!id || !sessionId || !image || !userRole) {
      console.warn('❌ Missing required fields:', {
        hasId: !!id,
        hasSessionId: !!sessionId,
        hasImage: !!image,
        hasUserRole: !!userRole,
      });
      return res.status(400).json({ error: 'Missing required fields: id, sessionId, image, userRole' });
    }

    const nowMs = now();
    dbRun(
      `
      INSERT INTO signatures (id, sessionId, userId, username, name, image, userRole, createdAt, updatedAt)
      VALUES (:id, :sessionId, :userId, :username, :name, :image, :userRole, :createdAt, :updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        sessionId = excluded.sessionId,
        userId = excluded.userId,
        username = excluded.username,
        name = excluded.name,
        image = excluded.image,
        userRole = excluded.userRole,
        updatedAt = excluded.updatedAt
    `,
      {
        id,
        sessionId,
        userId: userId || null,
        username: username || null,
        name: name || 'Unnamed Signature',
        image,
        userRole,
        createdAt: nowMs,
        updatedAt: nowMs,
      }
    );
    persistDatabase();

    const saved = dbGet('SELECT * FROM signatures WHERE id = :id', { id });
    res.json(saved);
  } catch (error) {
    console.error('❌ Error saving signature:', error);
    res.status(500).json({ error: 'Failed to save signature', details: error.message });
  }
});

// Delete a signature
app.delete('/api/signatures/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = dbGet('SELECT * FROM signatures WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    dbRun('DELETE FROM signatures WHERE id = :id', { id });
    persistDatabase();

    res.json({ message: 'Signature deleted' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    res.status(500).json({ error: 'Failed to delete signature' });
  }
});

// Asset API Endpoints
app.get('/api/assets/:userRole', (req, res) => {
  try {
    const { userRole } = req.params;
    const { sessionId, userId } = req.query;

    const assets = dbAll(
      `SELECT * FROM assets
       WHERE userRole = :userRole
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:userId IS NULL OR userId = :userId)
       ORDER BY createdAt DESC`,
      { userRole, sessionId: sessionId || null, userId: userId || null }
    );

    res.json(assets);
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

app.post('/api/assets', (req, res) => {
  try {
    const {
      id,
      sessionId,
      userId,
      username,
      name,
      type,
      image,
      text,
      width,
      height,
      userRole,
    } = req.body;

    if (!id || !name || !type || !userRole) {
      return res.status(400).json({ error: 'Missing required fields: id, name, type, userRole' });
    }

    const nowMs = now();
    dbRun(
      `
      INSERT INTO assets (id, sessionId, userId, username, name, type, image, text, width, height, userRole, createdAt, updatedAt)
      VALUES (:id, :sessionId, :userId, :username, :name, :type, :image, :text, :width, :height, :userRole, :createdAt, :updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        sessionId = excluded.sessionId,
        userId = excluded.userId,
        username = excluded.username,
        name = excluded.name,
        type = excluded.type,
        image = excluded.image,
        text = excluded.text,
        width = excluded.width,
        height = excluded.height,
        userRole = excluded.userRole,
        updatedAt = excluded.updatedAt
    `,
      {
        id,
        sessionId: sessionId || null,
        userId: userId || null,
        username: username || null,
        name,
        type,
        image: image || null,
        text: text || null,
        width: Number(width) || null,
        height: Number(height) || null,
        userRole,
        createdAt: nowMs,
        updatedAt: nowMs,
      }
    );

    persistDatabase();
    const saved = dbGet('SELECT * FROM assets WHERE id = :id', { id });
    res.json(saved);
  } catch (error) {
    console.error('Error saving asset:', error);
    res.status(500).json({ error: 'Failed to save asset', details: error.message });
  }
});

app.delete('/api/assets/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = dbGet('SELECT * FROM assets WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    dbRun('DELETE FROM assets WHERE id = :id', { id });
    persistDatabase();

    res.json({ message: 'Asset deleted' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

// Document API Endpoints
// Save a new notarized document (tied to a session)
app.post('/api/documents', (req, res) => {
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
    } = req.body;

    const safeOwnerName = String(ownerName || '').trim() || 'Owner';

    if (!id || !sessionId || !ownerId || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, sessionId, ownerId, name' });
    }

    const nowMs = now();
    const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : nowMs;

    const status = notarized ? 'pending_review' : 'uploaded';
    const inProcess = ['pending_review', 'accepted', 'session_started'].includes(status) ? 1 : 0;

    dbRun(
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
        notarizedDataUrl: typeof req.body.notarizedDataUrl === 'string' ? req.body.notarizedDataUrl : null,
        uploadedAt: uploadedMs,
        inProcess,
        notarized: notarized ? 1 : 0,
        notarizedAt: notarized ? nowMs : null,
        notaryReview: notarized ? 'pending' : null,
        notaryReviewedAt: null,
        status,
      }
    );
    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });

    console.log(`📄 Document saved: ${name} in session ${sessionId} by ${safeOwnerName}`);

    if (notarized) {
      io.emit('documentNotarized', {
        id: document.id,
        sessionId: document.sessionId,
        ownerId: document.ownerId,
        ownerName: document.ownerName,
        name: document.name,
        size: document.size,
        type: document.type,
        uploadedAt: document.uploadedAt,
        notarized: Boolean(document.notarized),
        notaryReview: document.notaryReview || 'pending',
        notaryReviewedAt: document.notaryReviewedAt,
        notaryName: document.notaryName,
      });
      console.log(`📡 Broadcasted documentNotarized to all clients: ${document.id} in session ${document.sessionId}`);
    } else {
      io.emit('documentNotarizationCancelled', {
        documentId: document.id,
      });
      console.log(`📡 Broadcasted documentNotarizationCancelled event for ${id}`);
    }

    res.json(document);
  } catch (error) {
    console.error('Error saving document:', error);
    res.status(500).json({ error: 'Failed to save document', details: error.message });
  }
});

// Get documents (optionally scoped to a session or owner)
app.get('/api/documents', (req, res) => {
  try {
    const { sessionId, ownerId } = req.query;

    const documents = dbAll(
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

// Get all notarized documents (optionally scoped to a session or owner)
app.get('/api/documents/notarized', (req, res) => {
  try {
    const { sessionId, ownerId } = req.query;

    const documents = dbAll(
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

// Update notary review decision for a document
app.put('/api/documents/:id/review', (req, res) => {
  try {
    const { id } = req.params;
    const { notaryReview, notaryName } = req.body;

    if (!notaryReview || !['accepted', 'rejected', 'pending'].includes(notaryReview)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }

    const nowMs = now();

    // Map review to workflow state
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

    // Update owner documents (documents table has been removed).
    dbRun(
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

    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`✅ Document ${id} reviewed as ${notaryReview} by ${notaryName}`);

    io.emit('documentReviewUpdated', {
      id,
      documentId: id,
      sessionId: document.sessionId,
      ownerId: document.ownerId,
      notaryReview,
      notaryName,
      notaryReviewedAt: document.notaryReviewedAt,
      status,
    });

    res.json(document);
  } catch (error) {
    console.error('Error updating document review:', error);
    res.status(500).json({ error: 'Failed to update document review' });
  }
});

// Mark an owner document as fully notarized (after session completion)
app.put('/api/owner-documents/:id/notarize', (req, res) => {
  try {
    const { id } = req.params;
    const { notaryName, notarizedDataUrl } = req.body;

    const nowMs = now();

    // If a notarized PDF is provided, save it to disk and store path in DB.
    let notarizedPath = null;
    if (typeof notarizedDataUrl === 'string' && notarizedDataUrl.trim()) {
      const [, base64] = notarizedDataUrl.split(',');
      const buffer = Buffer.from(base64 || notarizedDataUrl, 'base64');
      const outDir = path.resolve(__dirname, 'data', 'notarized');
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
      }
      notarizedPath = path.join(outDir, `${id}.pdf`);
      try {
        fs.writeFileSync(notarizedPath, buffer);
      } catch (writeErr) {
        console.warn('⚠️ Failed to write notarized PDF file:', writeErr?.message || writeErr);
        notarizedPath = null;
      }
    }

    dbRun(
      `
      UPDATE owner_documents
      SET status = :status,
          inProcess = 0,
          notarized = 1,
          notarizedAt = :notarizedAt,
          notaryReview = 'accepted',
          notaryName = :notaryName,
          notarizedDataUrl = :notarizedDataUrl,
          notarizedPath = :notarizedPath
      WHERE id = :id
    `,
      {
        id,
        status: 'notarized',
        notarizedAt: nowMs,
        notaryName: notaryName || 'Unknown Notary',
        notarizedDataUrl: notarizedDataUrl || null,
        notarizedPath,
      }
    );
    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    io.emit('documentNotarized', {
      id: document.id,
      sessionId: document.sessionId,
      ownerId: document.ownerId,
      ownerName: document.ownerName,
      name: document.name,
      size: document.size,
      type: document.type,
      uploadedAt: document.uploadedAt,
      notarized: Boolean(document.notarized),
      status: document.status,
      notaryReview: document.notaryReview,
      notaryReviewedAt: document.notaryReviewedAt,
      notaryName: document.notaryName,
    });

    res.json(document);
  } catch (error) {
    console.error('Error marking owner document notarized:', error);
    res.status(500).json({ error: 'Failed to mark document as notarized' });
  }
});

// Owner document endpoints (stored separately from session documents)
app.post('/api/owner-documents', (req, res) => {
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
    } = req.body;

    const safeOwnerName = String(ownerName || '').trim() || 'Owner';

    if (!id || !ownerId || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, ownerId, name' });
    }

    const nowMs = now();
    const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : nowMs;
    const normalizedStatus = String(status || 'uploaded').trim().toLowerCase();

    // Derive helpers for backwards compatibility
    const isInProcess = ['pending_review', 'accepted', 'session_started'].includes(normalizedStatus);
    const isNotarized = normalizedStatus === 'notarized';

    dbRun(
      `
      INSERT INTO owner_documents (id, ownerId, ownerName, sessionId, name, size, type, dataUrl, uploadedAt, inProcess, notarized, notarizedAt, notaryId, notaryName, notaryReview, notaryReviewedAt, status)
      VALUES (:id, :ownerId, :ownerName, :sessionId, :name, :size, :type, :dataUrl, :uploadedAt, :inProcess, :notarized, :notarizedAt, :notaryId, :notaryName, :notaryReview, :notaryReviewedAt, :status)
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
        status = excluded.status
    `,
      {
        id,
        ownerId,
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
      }
    );
    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });

    console.log(`📄 Owner document saved: ${name} by ${safeOwnerName}`);

    if (isInProcess) {
      io.emit('documentNotarized', {
        id: document.id,
        sessionId: document.sessionId,
        ownerId: document.ownerId,
        ownerName: document.ownerName,
        name: document.name,
        size: document.size,
        type: document.type,
        uploadedAt: document.uploadedAt,
        notarized: Boolean(document.notarized),
        notaryReview: document.notaryReview || 'pending',
        notaryReviewedAt: document.notaryReviewedAt,
        notaryName: document.notaryName,
      });
      console.log(`📡 Broadcasted documentNotarized to all clients: ${document.id}`);
    } else {
      io.emit('documentNotarizationCancelled', {
        documentId: document.id,
      });
      console.log(`📡 Broadcasted documentNotarizationCancelled event for ${id}`);
    }

    res.json(document);
  } catch (error) {
    console.error('Error saving owner document:', error);
    res.status(500).json({ error: 'Failed to save owner document', details: error.message });
  }
});

app.get('/api/owner-documents', (req, res) => {
  try {
    const { ownerId, sessionId, inProcess, notarized, status } = req.query;

    const inProcessFilter = inProcess === undefined ? null : (inProcess === '1' || inProcess === 'true' ? 1 : 0);
    const notarizedFilter = notarized === undefined ? null : (notarized === '1' || notarized === 'true' ? 1 : 0);
    const statusFilter = typeof status === 'string' ? status.trim().toLowerCase() : null;

    const documents = dbAll(
      `SELECT * FROM owner_documents
       WHERE (:ownerId IS NULL OR ownerId = :ownerId)
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:inProcess IS NULL OR inProcess = :inProcess)
         AND (:notarized IS NULL OR notarized = :notarized)
         AND (:status IS NULL OR status = :status)
       ORDER BY uploadedAt DESC`,
      {
        ownerId: ownerId || null,
        sessionId: sessionId || null,
        inProcess: inProcessFilter,
        notarized: notarizedFilter,
        status: statusFilter,
      }
    );

    res.json(documents);
  } catch (error) {
    console.error('Error fetching owner documents:', error);
    res.status(500).json({ error: 'Failed to fetch owner documents' });
  }
});

app.get('/api/owner-documents/:id', (req, res) => {
  try {
    const { id } = req.params;
    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Owner document not found' });
    }
    res.json(document);
  } catch (error) {
    console.error('Error fetching owner document:', error);
    res.status(500).json({ error: 'Failed to fetch owner document' });
  }
});

app.get('/api/owner-documents/:id/notarized', (req, res) => {
  try {
    const { id } = req.params;
    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    const filePath = document.notarizedPath;
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Notarized document not found' });
    }

    res.download(filePath, `${document.name?.replace(/\.pdf$/i, '') || id}-notarized.pdf`, (err) => {
      if (err) {
        console.error('Error sending notarized file:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Failed to download notarized document' });
        }
      }
    });
  } catch (error) {
    console.error('Error downloading notarized document:', error);
    res.status(500).json({ error: 'Failed to download notarized document' });
  }
});

app.delete('/api/owner-documents/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });

    if (!existing) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    dbRun('DELETE FROM owner_documents WHERE id = :id', { id });
    persistDatabase();

    io.emit('documentDeleted', {
      id,
      documentId: id,
      ownerId: existing.ownerId,
      sessionId: existing.sessionId,
    });

    res.json({ success: true, id });
  } catch (error) {
    console.error('Error deleting owner document:', error);
    res.status(500).json({ error: 'Failed to delete owner document' });
  }
});

app.put('/api/owner-documents/:id/session-started', (req, res) => {
  try {
    const { id } = req.params;
    const { sessionId, notaryName, notaryUserId } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    dbRun(
      `
      UPDATE owner_documents
      SET status = :status,
          sessionId = :sessionId,
          inProcess = :inProcess,
          notarized = :notarized,
          notaryReview = :notaryReview,
          notaryName = :notaryName,
          notaryId = :notaryId
      WHERE id = :id
    `,
      {
        id,
        status: 'session_started',
        sessionId,
        inProcess: 1,
        notarized: 0,
        notaryReview: 'accepted',
        notaryName: notaryName || 'Unknown Notary',
        notaryId: notaryUserId || null,
      }
    );
    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    io.emit('notarySessionStarted', {
      documentId: document.id,
      sessionId: document.sessionId,
      notaryName: document.notaryName || notaryName || 'Unknown Notary',
      notaryUserId: document.notaryId || notaryUserId || null,
      timestamp: new Date().toISOString(),
    });

    res.json(document);
  } catch (error) {
    console.error('Error marking owner document session started:', error);
    res.status(500).json({ error: 'Failed to mark session started' });
  }
});

app.put('/api/owner-documents/:id/session-ended', (req, res) => {
  try {
    const { id } = req.params;
    const { sessionId, notaryName, notaryUserId } = req.body || {};

    const existing = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    let document = existing;

    if (String(existing.status || '').trim().toLowerCase() !== 'notarized' && !existing.notarized) {
      const nowMs = now();
      dbRun(
        `
        UPDATE owner_documents
        SET status = :status,
            inProcess = :inProcess,
            notarized = :notarized,
            notarizedAt = :notarizedAt,
            notaryReview = :notaryReview,
            notaryReviewedAt = :notaryReviewedAt,
            notaryName = :notaryName,
            notaryId = :notaryId
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
        }
      );
      persistDatabase();
      document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    }

    io.emit('documentReviewUpdated', {
      id: document.id,
      documentId: document.id,
      sessionId: document.sessionId || sessionId || null,
      notaryReview: document.notaryReview || 'accepted',
      notaryName: document.notaryName || notaryName || 'Unknown Notary',
      notaryReviewedAt: document.notaryReviewedAt,
      status: document.status,
    });

    io.emit('notarySessionEnded', {
      documentId: document.id,
      sessionId: document.sessionId || sessionId || null,
      status: document.status,
      notaryName: document.notaryName || notaryName || 'Unknown Notary',
      notaryUserId: document.notaryId || notaryUserId || null,
      endedAt: new Date().toISOString(),
    });

    res.json(document);
  } catch (error) {
    console.error('Error ending owner document session:', error);
    res.status(500).json({ error: 'Failed to end session' });
  }
});
app.put('/api/owner-documents/:id/review', (req, res) => {
  try {
    const { id } = req.params;
    const { notaryReview, notaryName } = req.body;

    if (!notaryReview || !['accepted', 'rejected', 'pending'].includes(notaryReview)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }

    const nowMs = now();
    const status =
      notaryReview === 'accepted'
        ? 'accepted'
        : notaryReview === 'rejected'
        ? 'rejected'
        : 'pending_review';
    const inProcess = status === 'accepted' || status === 'pending_review' ? 1 : 0;

    dbRun(
      `
      UPDATE owner_documents
      SET notaryReview = :notaryReview,
          notaryReviewedAt = :notaryReviewedAt,
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
        notaryName: notaryName || 'Unknown Notary',
        notaryReviewedAt: nowMs,
        status,
        inProcess,
        notarized: 0,
        notarizedAt: null,
      }
    );
    persistDatabase();

    const document = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    console.log(`✅ Owner document ${id} reviewed as ${notaryReview} by ${notaryName}`);

    io.emit('documentReviewUpdated', {
      id,
      documentId: id,
      sessionId: document.sessionId,
      ownerId: document.ownerId,
      notaryReview,
      notaryName,
      notaryReviewedAt: document.notaryReviewedAt,
      scheduledAt: document.scheduledAt,
      status: document.status,
    });

    res.json(document);
  } catch (error) {
    console.error('Error updating owner document review:', error);
    res.status(500).json({ error: 'Failed to update owner document review' });
  }
});

app.put('/api/owner-documents/:id/schedule', (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt } = req.body || {};

    const existing = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Owner document not found' });
    }

    const status = String(existing.status || '').trim().toLowerCase();
    if (status !== 'accepted') {
      return res.status(400).json({ error: 'Only accepted documents can be scheduled' });
    }

    const scheduledAtMs = new Date(scheduledAt).getTime();
    if (!Number.isFinite(scheduledAtMs)) {
      return res.status(400).json({ error: 'Invalid scheduledAt value' });
    }

    dbRun(
      `
      UPDATE owner_documents
      SET scheduledAt = :scheduledAt,
          inProcess = 1,
          status = :status,
          notarized = 0,
          notaryReview = :notaryReview
      WHERE id = :id
    `,
      {
        id,
        scheduledAt: scheduledAtMs,
        status: 'accepted',
        notaryReview: existing.notaryReview || 'accepted',
      }
    );
    persistDatabase();

    const updated = dbGet('SELECT * FROM owner_documents WHERE id = :id', { id });
    if (!updated) {
      return res.status(404).json({ error: 'Owner document not found after update' });
    }

    io.emit('documentReviewUpdated', {
      id: updated.id,
      documentId: updated.id,
      sessionId: updated.sessionId,
      ownerId: updated.ownerId,
      notaryReview: updated.notaryReview || 'accepted',
      notaryName: updated.notaryName || 'Unknown Notary',
      notaryReviewedAt: updated.notaryReviewedAt,
      status: updated.status,
      scheduledAt: updated.scheduledAt,
    });

    res.json(updated);
  } catch (error) {
    console.error('Error scheduling owner document meeting:', error);
    res.status(500).json({ error: 'Failed to schedule owner document meeting' });
  }
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`✅ New user connected: ${socket.id}`);

  // User joins a notarization session
  socket.on('joinSession', (data) => {
    const rawRoomId = data?.roomId;
    const roomId = normalizeRoomId(rawRoomId);
    const role = normalizeRole(data?.role);
    const userId = data?.userId || socket.id;
    const username = data?.username || userId;

    if (!roomId || !role) {
      console.warn(`⚠️ Invalid joinSession payload from ${socket.id}:`, data);
      return;
    }
    
    socket.join(roomId);
    userSessions.set(socket.id, { roomId, role, userId, username });

    // Persist session participant in SQLite.
    try {
      upsertSessionParticipant({
        sessionId: roomId,
        socketId: socket.id,
        userId,
        username,
        role,
      });
    } catch (err) {
      console.warn(`⚠️ Failed to persist session participant for ${roomId}:`, err.message || err);
    }

    // Create session if doesn't exist
    if (!sessions.has(roomId)) {
      sessions.set(roomId, { created: Date.now(), users: [] });
    }

    const session = sessions.get(roomId);
    session.users = session.users.filter((u) => u.socketId !== socket.id);
    session.users.push({ socketId: socket.id, role, userId, username });

    console.log(`👤 ${role} joined session ${roomId}`);

    // Notify all users in the session
    io.to(roomId).emit('usersConnected', session.users);

    // Send connection status confirmation specifically for the joining user
    const hasOwner = session.users.some(u => u.role === 'owner');
    const hasNotary = session.users.some(u => u.role === 'notary');
    socket.emit('sessionStatus', {
      sessionId: roomId,
      currentUser: { role, userId },
      ownerConnected: hasOwner,
      notaryConnected: hasNotary,
      totalUsers: session.users.length,
      allUsers: session.users
    });

    // If a document was already shared before this user joined, replay it immediately
    if (session.pdfDataUrl) {
      socket.emit('documentShared', {
        pdfDataUrl: session.pdfDataUrl,
        fileName: session.pdfFileName || 'document.pdf',
      });
    }
  });

  // Handle document sharing — store in session and relay to others
  socket.on('documentShared', (data) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      const session = sessions.get(userSession.roomId);
      if (session) {
        session.pdfDataUrl = data.pdfDataUrl;
        session.pdfFileName = data.fileName;
      }
      socket.to(userSession.roomId).emit('documentShared', data);
      console.log(`📤 Document shared to room: ${data.fileName}`);
    }
  });

  // Handle notary starting a session — broadcast to all connected clients (especially owner)
  socket.on('notarySessionStarted', (data) => {
    console.log('🔔 Notary started session:', data);

    // Persist session start state to owner document (so owner dashboard can reflect it on refresh)
    try {
      if (data?.documentId) {
        dbRun(
          `
          UPDATE owner_documents
          SET status = :status,
              sessionId = :sessionId,
              inProcess = :inProcess,
              notarized = :notarized,
              notaryReview = :notaryReview,
              notaryName = :notaryName,
              notaryId = :notaryId
          WHERE id = :id
        `,
          {
            id: data.documentId,
            status: 'session_started',
            sessionId: data.sessionId || null,
            inProcess: 1,
            notarized: 0,
            notaryReview: 'accepted',
            notaryName: data.notaryName || 'Unknown Notary',
            notaryId: data.notaryUserId || null,
          }
        );
      }
    } catch (err) {
      console.warn('⚠️ Failed to persist session started status for document:', data.documentId, err?.message || err);
    }

    persistDatabase();

    // Broadcast with complete context so owner knows to show "Join Session" button
    io.emit('notarySessionStarted', {
      documentId: data.documentId,
      sessionId: data.sessionId,
      notaryName: data.notaryName || 'Unknown Notary',
      notaryUserId: data.notaryUserId,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle notary ending a session — broadcast to all connected clients
  socket.on('notarySessionEnded', (data) => {
    console.log('🔔 Notary ended session:', data);
    io.emit('notarySessionEnded', data);
  });

  // Handle owner acknowledging session start
  socket.on('ownerAckSessionStart', (data) => {
    console.log('✅ Owner acknowledged session start:', data);
    io.emit('ownerReadyForSession', {
      documentId: data.documentId,
      sessionId: data.sessionId,
      timestamp: data.timestamp,
    });
  });

  // Handle element added (signature/stamp placement)
  socket.on('elementAdded', (element) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      socket.to(userSession.roomId).emit('elementAdded', element);
      console.log(`✏️ Element added: ${element.type} by ${element.user}`);
    }
  });

  // Handle element updated (position change)
  socket.on('elementUpdated', (element) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      socket.to(userSession.roomId).emit('elementUpdated', element);
    }
  });

  // Handle element removed
  socket.on('elementRemoved', (elementId) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      socket.to(userSession.roomId).emit('elementRemoved', elementId);
    }
  });

  // Handle user disconnect
  socket.on('disconnect', () => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      const session = sessions.get(userSession.roomId);
      if (session) {
        session.users = session.users.filter((u) => u.socketId !== socket.id);

        if (session.users.length === 0) {
          sessions.delete(userSession.roomId);
          console.log(`🔓 Session closed: ${userSession.roomId}`);
        } else {
          io.to(userSession.roomId).emit('usersConnected', session.users);
        }
      }

      try {
        removeSessionParticipant(userSession.roomId, socket.id);
      } catch (err) {
        console.warn(`⚠️ Failed to update session on disconnect for ${userSession.roomId}:`, err.message || err);
      }

      userSessions.delete(socket.id);
    }
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

async function startServer() {
  try {
    await initDatabase();
    setInterval(autoStartDueScheduledMeetings, 5000);

    server.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════╗
║  🔏 Notarization Platform - Server                 ║
║  Server running on: http://localhost:${PORT}        ║
║  Environment: ${NODE_ENV}                           ║
║  Frontend: ${FRONTEND_URL}                      ║
╚════════════════════════════════════════════════════╝
      `);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the running server or set PORT to a different value.`);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing server...');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Keep oversized payload errors explicit for client-side handling.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.name === 'PayloadTooLargeError')) {
    return res.status(413).json({ error: 'Uploaded payload is too large. Maximum size is 50MB.' });
  }
  return next(err);
});
