/**
 * NOTARIZATION PLATFORM - Modular Backend Server
 * Socket.io Server for Real-time Synchronization
 * 
 * This is the new entry point after modularization.
 * It imports and initializes all modules, then starts the server.
 */

require('dotenv').config();

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
});

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');

// Import configuration
const {
  PORT,
  NODE_ENV,
  FRONTEND_URL,
  STATIC_ALLOWED_ORIGINS,
  isAllowedOrigin,
} = require('./utils/env');

// Import database
const { initDatabase } = require('./db');

// Import services
const { registerSocketHandlers } = require('./socket/handlers');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

// Import API routes
const apiRoutes = require('./api');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Socket.io setup
const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  methods: ['GET', 'POST', 'DELETE', 'PUT'],
  credentials: true,
};

const io = socketIO(server, {
  cors: corsOptions,
  maxHttpBufferSize: 20e6, // 20 MB for PDF data transfers
});

// Express middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// API routes
app.use('/api', apiRoutes);

// Socket.io handlers
registerSocketHandlers(io);

// Error handling middleware (must be last)
app.use(errorHandler);

// Server startup
async function startServer() {
  try {
    console.log(`🚀 Notarization Platform Backend`);
    console.log(`📍 Environment: ${NODE_ENV}`);
    console.log(`🔧 Initializing database...`);

    // Initialize database
    await initDatabase();

    // Start HTTP server
    server.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📊 Frontend: ${FRONTEND_URL}`);
      console.log(`🔌 Socket.io ready for connections`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('⏹️  SIGTERM received, shutting down gracefully');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err.message);
    process.exit(1);
  }
}

// Start the server
startServer();

module.exports = { app, server, io };
