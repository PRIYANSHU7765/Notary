/**
 * Error Handler Middleware
 * Centralized error handling for oversized payloads
 */

function errorHandler(err, req, res, next) {
  if (err.message && err.message.includes('request entity too large')) {
    return res.status(413).json({
      ok: false,
      error: 'Payload too large',
      details: 'Request body exceeds maximum allowed size (200MB)',
    });
  }

  // Log unexpected errors
  console.error('❌ Unhandled error:', err.message || err);

  res.status(500).json({
    ok: false,
    error: 'Internal server error',
  });
}

module.exports = {
  errorHandler,
};
