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

const express = require('express');
const http = require('http');
const net = require('net');
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
app.use(express.json());

// Setup SQLite database (using sql.js in Node to avoid native build tool requirements)
const dbPath = path.resolve(__dirname, 'data', 'notary.db');
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

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  ownerId TEXT,
  ownerName TEXT NOT NULL,
  notaryId TEXT,
  notaryName TEXT,
  name TEXT NOT NULL,
  size INTEGER,
  type TEXT,
  uploadedAt INTEGER NOT NULL,
  notarized INTEGER NOT NULL DEFAULT 0,
  notarizedAt INTEGER,
  notaryReview TEXT DEFAULT 'pending',
  notaryReviewedAt INTEGER
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

function dbAll(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbRun(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(normalizeParams(params));
  stmt.step();
  stmt.free();
}

async function initDatabase() {
  SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, 'node_modules', 'sql.js', 'dist', file),
  });

  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(new Uint8Array(buffer));
  } else {
    db = new SQL.Database();
  }

  db.exec(initSql);
  setupPreparedStatements();
  persistDatabase();
}

// Prepared statements (initialized when the database is ready)
let insertOrUpdateSignature;
let selectSignaturesByRole;
let deleteSignatureById;

let insertOrUpdateDocument;
let selectDocuments;
let selectNotarizedDocuments;
let updateDocumentReview;
let selectDocumentById;

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

  insertOrUpdateDocument = db.prepare(`
    INSERT INTO documents (id, sessionId, ownerId, ownerName, notaryId, notaryName, name, size, type, uploadedAt, notarized, notarizedAt, notaryReview, notaryReviewedAt)
    VALUES (:id, :sessionId, :ownerId, :ownerName, :notaryId, :notaryName, :name, :size, :type, :uploadedAt, :notarized, :notarizedAt, :notaryReview, :notaryReviewedAt)
    ON CONFLICT(id) DO UPDATE SET
      sessionId = excluded.sessionId,
      ownerId = excluded.ownerId,
      ownerName = excluded.ownerName,
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
  `);

  selectDocuments = db.prepare(`
    SELECT * FROM documents
    WHERE (:sessionId IS NULL OR sessionId = :sessionId)
      AND (:ownerId IS NULL OR ownerId = :ownerId)
    ORDER BY uploadedAt DESC
  `);

  selectNotarizedDocuments = db.prepare(`
    SELECT * FROM documents
    WHERE notarized = 1
      AND (:sessionId IS NULL OR sessionId = :sessionId)
      AND (:ownerId IS NULL OR ownerId = :ownerId)
    ORDER BY uploadedAt DESC
  `);

  updateDocumentReview = db.prepare(`
    UPDATE documents
    SET notaryReview = :notaryReview,
        notaryReviewedAt = :notaryReviewedAt,
        notaryName = :notaryName
    WHERE id = :id
  `);

  selectDocumentById = db.prepare(`SELECT * FROM documents WHERE id = :id`);

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

// User-related queries are executed via helper functions (dbGet/dbAll) to keep sql.js usage consistent.

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
    insertOrUpdateSignature.run({
      id,
      sessionId,
      userId: userId || null,
      username: username || null,
      name: name || 'Unnamed Signature',
      image,
      userRole,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
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
    const result = deleteSignatureById.run({ id });
    persistDatabase();

    // sql.js doesn't always expose `changes` in the same way; check for errors instead
    if (!result || typeof result.changes === 'undefined' || result.changes === 0) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.json({ message: 'Signature deleted' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    res.status(500).json({ error: 'Failed to delete signature' });
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
      notaryId,
      notaryName,
      name,
      size,
      type,
      uploadedAt,
      notarized,
    } = req.body;

    const safeOwnerName = String(ownerName || '').trim() || 'Owner';

    if (!id || !sessionId || !name) {
      return res.status(400).json({ error: 'Missing required fields: id, sessionId, name' });
    }

    const nowMs = now();
    const uploadedMs = uploadedAt ? new Date(uploadedAt).getTime() : nowMs;

    insertOrUpdateDocument.run({
      id,
      sessionId,
      ownerId: ownerId || null,
      ownerName: safeOwnerName,
      notaryId: notaryId || null,
      notaryName: notaryName || null,
      name,
      size: Number(size) || 0,
      type: type || 'application/octet-stream',
      uploadedAt: uploadedMs,
      notarized: notarized ? 1 : 0,
      notarizedAt: notarized ? nowMs : null,
      notaryReview: notarized ? 'pending' : null,
      notaryReviewedAt: null,
    });
    persistDatabase();

    const document = dbGet('SELECT * FROM documents WHERE id = :id', { id });

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
      `SELECT * FROM documents
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
      `SELECT * FROM documents
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
    updateDocumentReview.run({
      id,
      notaryReview,
      notaryName: notaryName || 'Unknown Notary',
      notaryReviewedAt: nowMs,
    });
    persistDatabase();

    const document = dbGet('SELECT * FROM documents WHERE id = :id', { id });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    console.log(`✅ Document ${id} reviewed as ${notaryReview} by ${notaryName}`);

    io.emit('documentReviewUpdated', {
      id: id,
      documentId: id,
      sessionId: document.sessionId,
      ownerId: document.ownerId,
      notaryReview,
      notaryName,
      notaryReviewedAt: document.notaryReviewedAt,
    });

    res.json(document);
  } catch (error) {
    console.error('Error updating document review:', error);
    res.status(500).json({ error: 'Failed to update document review' });
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

    // Persist session in MongoDB
    void upsertSessionParticipant({
      sessionId: roomId,
      socketId: socket.id,
      userId,
      username,
      role,
    }).catch((err) => {
      console.warn(`⚠️ Failed to persist session participant for ${roomId}:`, err.message || err);
    });

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

async function findAvailablePort(start) {
  let port = start;
  const maxAttempts = 5;
  for (let i = 0; i < maxAttempts; i += 1) {
    const inUse = await new Promise((resolve) => {
      const tester = net.createServer()
        .once('error', () => resolve(true))
        .once('listening', () => {
          tester.close(() => resolve(false));
        })
        .listen(port);
    });

    if (!inUse) return port;
    port += 1;
  }
  return start;
}

async function startServer() {
  try {
    await initDatabase();

    const availablePort = await findAvailablePort(PORT);
    if (availablePort !== PORT) {
      console.warn(`Port ${PORT} is in use; switching to ${availablePort}.`);
    }

    server.listen(availablePort, () => {
      console.log(`
╔════════════════════════════════════════════════════╗
║  🔏 Notarization Platform - Server                 ║
║  Server running on: http://localhost:${availablePort}        ║
║  Environment: ${NODE_ENV}                           ║
║  Frontend: ${FRONTEND_URL}                      ║
╚════════════════════════════════════════════════════╝
      `);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${availablePort} is already in use. Stop the running server or set PORT to a different value.`);
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
