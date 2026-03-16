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
const socketIO = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

// Environment variables
const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// CORS configuration for production
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    FRONTEND_URL,
    'https://notary-platform.vercel.app', // Update with your Vercel domain
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

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/notary-platform';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch((err) => console.warn('⚠️  MongoDB connection warning:', err.message));

// Signature Schema
const signatureSchema = new mongoose.Schema({
  id: { type: String, unique: true, required: true },
  name: String,
  image: { type: String, required: true }, // Base64 data URL
  userRole: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Signature = mongoose.model('Signature', signatureSchema);

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
const USERS_DB_PATH = path.join(__dirname, 'data', 'users.json');

const ensureUsersDbFile = async () => {
  const dir = path.dirname(USERS_DB_PATH);
  await fs.mkdir(dir, { recursive: true });
  try {
    await fs.access(USERS_DB_PATH);
  } catch {
    await fs.writeFile(USERS_DB_PATH, '[]', 'utf8');
  }
};

const readUsers = async () => {
  await ensureUsersDbFile();
  const raw = await fs.readFile(USERS_DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeUsers = async (users) => {
  await ensureUsersDbFile();
  await fs.writeFile(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf8');
};

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

// Health check endpoint
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

// Auth API Endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const newPassword = String(req.body.newPassword || '');
    const role = normalizeRole(req.body.role);

    if (!username || !email || !password || !newPassword || !role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    if (!['owner', 'notary'].includes(role)) {
      return res.status(400).json({ error: 'Role must be owner or notary.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    if (password !== newPassword) {
      return res.status(400).json({ error: 'Password and New Password must match.' });
    }

    const users = await readUsers();
    const usernameTaken = users.some(
      (user) => String(user.username || '').toLowerCase() === username.toLowerCase()
    );

    if (usernameTaken) {
      return res.status(409).json({ error: 'Username is already registered.' });
    }

    const emailTaken = users.some(
      (user) => String(user.email || '').toLowerCase() === email
    );

    if (emailTaken) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    users.push({
      username,
      email,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
    });
    await writeUsers(users);

    return res.status(201).json({
      message: 'Registration successful.',
      user: {
        username,
        email,
        role,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Failed to register user.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const users = await readUsers();
    const user = users.find(
      (entry) => String(entry.username || '').toLowerCase() === username.toLowerCase()
    );

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    return res.json({
      token: createToken(user),
      user: {
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Failed to authenticate user.' });
  }
});

// Signature API Endpoints

// Get all signatures for a user role
app.get('/api/signatures/:userRole', async (req, res) => {
  try {
    const { userRole } = req.params;
    const signatures = await Signature.find({ userRole }).sort({ createdAt: -1 });
    res.json(signatures);
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

// Save a new signature
app.post('/api/signatures', async (req, res) => {
  try {
    const { id, name, image, userRole } = req.body;

    console.log('🔐 POST /api/signatures received:', { id, name, userRole, imageLength: image?.length });

    if (!id || !image || !userRole) {
      console.warn('❌ Missing required fields:', { hasId: !!id, hasImage: !!image, hasUserRole: !!userRole });
      return res.status(400).json({ error: 'Missing required fields: id, image, userRole' });
    }

    const signature = new Signature({
      id,
      name: name || 'Unnamed Signature',
      image,
      userRole,
    });

    console.log('💾 Saving signature to MongoDB...');
    await signature.save();
    console.log('✅ Signature saved successfully:', id);
    res.json(signature);
  } catch (error) {
    console.error('❌ Error saving signature:', error);
    res.status(500).json({ error: 'Failed to save signature', details: error.message });
  }
});

// Delete a signature
app.delete('/api/signatures/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await Signature.findOneAndDelete({ id });

    if (!result) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    res.json({ message: 'Signature deleted' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    res.status(500).json({ error: 'Failed to delete signature' });
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

    if (!roomId || !role) {
      console.warn(`⚠️ Invalid joinSession payload from ${socket.id}:`, data);
      return;
    }
    
    socket.join(roomId);
    userSessions.set(socket.id, { roomId, role, userId });

    // Create session if doesn't exist
    if (!sessions.has(roomId)) {
      sessions.set(roomId, { created: Date.now(), users: [] });
    }

    const session = sessions.get(roomId);
    session.users = session.users.filter((u) => u.socketId !== socket.id);
    session.users.push({ socketId: socket.id, role, userId });

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

  // Handle document upload notification
  socket.on('documentUploaded', (data) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      io.to(userSession.roomId).emit('documentUploaded', data);
      console.log(`📄 Document uploaded: ${data.fileName}`);
    }
  });

  // Handle full PDF data sharing — store in session and relay to others
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
      userSessions.delete(socket.id);
    }
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// Start server
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

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
