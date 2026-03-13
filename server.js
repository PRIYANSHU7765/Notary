/**
 * NOTARIZATION PLATFORM - Backend Server
 * Socket.io Server for Real-time Synchronization
 * 
 * Environment Variables:
 * - PORT: Server port (default: 5000)
 * - NODE_ENV: development or production
 * - FRONTEND_URL: Frontend domain for CORS
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

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
    FRONTEND_URL,
    'https://notary-platform.vercel.app', // Update with your Vercel domain
  ],
  methods: ['GET', 'POST'],
  credentials: true,
};

const io = socketIO(server, {
  cors: corsOptions,
  maxHttpBufferSize: 20e6, // allow up to 20 MB for PDF data transfers
});

app.use(cors(corsOptions));
app.use(express.json());

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
