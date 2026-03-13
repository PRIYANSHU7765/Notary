/**
 * NOTARIZATION PLATFORM - Backend Server
 * Socket.io Server for Real-time Synchronization
 * 
 * To run this server:
 * 1. Make sure Node.js is installed
 * 2. Create a new folder for backend (e.g., notary-server)
 * 3. Copy this file into that folder
 * 4. Run: npm install express socket.io cors
 * 5. Run: node server.js
 * 6. Your server will run on http://localhost:5000
 */

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIO(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

// Store active sessions and users
const sessions = new Map();
const userSessions = new Map();

// Serve a simple health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Server is running', sessions: sessions.size });
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`✅ New user connected: ${socket.id}`);

  // User joins a notarization session
  socket.on('joinSession', (data) => {
    const { roomId, role, userId } = data;
    
    socket.join(roomId);
    userSessions.set(socket.id, { roomId, role, userId });

    // Create session if doesn't exist
    if (!sessions.has(roomId)) {
      sessions.set(roomId, { created: Date.now(), users: [] });
    }

    const session = sessions.get(roomId);
    session.users.push({ socketId: socket.id, role, userId });

    console.log(`👤 ${role} joined session ${roomId}`);

    // Notify all users in the session
    io.to(roomId).emit('usersConnected', session.users);
  });

  // Handle document upload notification
  socket.on('documentUploaded', (data) => {
    const userSession = userSessions.get(socket.id);
    if (userSession) {
      io.to(userSession.roomId).emit('documentUploaded', data);
      console.log(`📄 Document uploaded: ${data.fileName}`);
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
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║  🔏 Notarization Platform - Server                 ║
║  Server running on: http://localhost:${PORT}        ║
║  Environment: ${process.env.NODE_ENV || 'development'}              ║
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
