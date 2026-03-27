/**
 * Socket.io Event Handlers
 * Real-time session synchronization and collaboration
 */

const { upsertSessionParticipant, removeSessionParticipant } = require('../db/sessionHelpers');
const { normalizeRoomId, normalizeRole } = require('../utils/normalizers');
const { dbGet } = require('../db');

// In-memory session tracking
const sessions = new Map();
const userSessions = new Map();
const liveMeetings = new Map();

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`🔌 User connected: ${socket.id}`);

    // Join session event
    socket.on('joinSession', (data) => {
      try {
        const { sessionId, userId, username, role } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);

        if (!normalizedSessionId) {
          socket.emit('error', { message: 'Invalid session ID' });
          return;
        }

        // Update database
        upsertSessionParticipant({
          sessionId: normalizedSessionId,
          socketId: socket.id,
          userId: userId || null,
          username: username || null,
          role: normalizeRole(role),
        });

        // Track in memory
        userSessions.set(socket.id, {
          roomId: normalizedSessionId,
          userId: userId || null,
          username: username || null,
          role: normalizeRole(role),
        });

        // Join socket room
        socket.join(normalizedSessionId);

        // Broadcast users connected
        io.to(normalizedSessionId).emit('usersConnected', {
          sessionId: normalizedSessionId,
          timestamp: new Date().toISOString(),
        });

        socket.emit('sessionJoined', { ok: true, sessionId: normalizedSessionId });
        console.log(`✅ User ${username} joined session ${normalizedSessionId}`);
      } catch (err) {
        console.error('Error joining session:', err.message);
        socket.emit('error', { message: err.message });
      }
    });

    // Document shared event
    socket.on('documentShared', (data) => {
      try {
        const { sessionId, documentId, documentData } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        io.to(normalizedSessionId).emit('documentShared', {
          documentId,
          documentData,
          sharedBy: socket.id,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Error sharing document:', err.message);
      }
    });

    // Element added event
    socket.on('elementAdded', (data) => {
      try {
        const { sessionId, element } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('elementAdded', { element, addedBy: socket.id });
      } catch (err) {
        console.error('Error adding element:', err.message);
      }
    });

    // Element updated event
    socket.on('elementUpdated', (data) => {
      try {
        const { sessionId, elementId, updates } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('elementUpdated', { elementId, updates, updatedBy: socket.id });
      } catch (err) {
        console.error('Error updating element:', err.message);
      }
    });

    // Element removed event
    socket.on('elementRemoved', (data) => {
      try {
        const { sessionId, elementId } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('elementRemoved', { elementId, removedBy: socket.id });
      } catch (err) {
        console.error('Error removing element:', err.message);
      }
    });

    // Live meeting started
    socket.on('liveMeetingStarted', (data) => {
      try {
        const { sessionId, meetingId } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        liveMeetings.set(meetingId, { sessionId: normalizedSessionId, startedAt: Date.now() });
        io.to(normalizedSessionId).emit('liveMeetingStarted', { meetingId, timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('Error starting live meeting:', err.message);
      }
    });

    // Live meeting ended
    socket.on('liveMeetingEnded', (data) => {
      try {
        const { sessionId, meetingId } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        liveMeetings.delete(meetingId);
        io.to(normalizedSessionId).emit('liveMeetingEnded', { meetingId, timestamp: new Date().toISOString() });
      } catch (err) {
        console.error('Error ending live meeting:', err.message);
      }
    });

    // WebRTC offer
    socket.on('liveMeetingOffer', (data) => {
      try {
        const { sessionId, offer } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('liveMeetingOffer', { offer, fromSocket: socket.id });
      } catch (err) {
        console.error('Error sending offer:', err.message);
      }
    });

    // WebRTC answer
    socket.on('liveMeetingAnswer', (data) => {
      try {
        const { sessionId, answer } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('liveMeetingAnswer', { answer, fromSocket: socket.id });
      } catch (err) {
        console.error('Error sending answer:', err.message);
      }
    });

    // ICE candidate
    socket.on('liveMeetingIceCandidate', (data) => {
      try {
        const { sessionId, candidate } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('liveMeetingIceCandidate', { candidate, fromSocket: socket.id });
      } catch (err) {
        console.error('Error sending ICE candidate:', err.message);
      }
    });

    // Document scroll sync
    socket.on('documentScrolled', (data) => {
      try {
        const { sessionId, scrollPosition } = data;
        const normalizedSessionId = normalizeRoomId(sessionId);
        socket.to(normalizedSessionId).emit('documentScrolled', { scrollPosition, scrolledBy: socket.id });
      } catch (err) {
        console.error('Error syncing scroll:', err.message);
      }
    });

    // Disconnect event
    socket.on('disconnect', () => {
      try {
        const tracked = userSessions.get(socket.id);
        if (tracked) {
          removeSessionParticipant(tracked.roomId, socket.id);
          io.to(tracked.roomId).emit('usersConnected', { sessionId: tracked.roomId });
        }
        userSessions.delete(socket.id);
        console.log(`🔌 User disconnected: ${socket.id}`);
      } catch (err) {
        console.error('Error handling disconnect:', err.message);
      }
    });
  });
}

module.exports = {
  registerSocketHandlers,
  sessions,
  userSessions,
  liveMeetings,
};
