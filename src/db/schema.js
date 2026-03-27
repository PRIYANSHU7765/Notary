/**
 * Database Schema Definitions
 * SQL table creation statements
 */

const initSql = `
CREATE TABLE IF NOT EXISTS users (
  userId TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  otpVerified INTEGER NOT NULL DEFAULT 0,
  kbaStatus TEXT NOT NULL DEFAULT 'draft',
  kbaApprovedAt INTEGER,
  kbaRejectedReason TEXT,
  kbaUpdatedAt INTEGER,
  phoneNumber TEXT
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  destination TEXT NOT NULL,
  channel TEXT NOT NULL,
  otpHash TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  maxAttempts INTEGER NOT NULL DEFAULT 5,
  verifiedAt INTEGER,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS kba_submissions (
  userId TEXT PRIMARY KEY,
  documentType TEXT NOT NULL,
  fileNameFront TEXT NOT NULL,
  mimeTypeFront TEXT,
  filePathFront TEXT NOT NULL,
  fileNameBack TEXT NOT NULL,
  mimeTypeBack TEXT,
  filePathBack TEXT NOT NULL,
  submittedAt INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'kba_pending_review',
  rejectionReason TEXT,
  reviewedAt INTEGER,
  reviewedBy TEXT,
  metadata TEXT
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
  terminated INTEGER DEFAULT 0,
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
  status TEXT NOT NULL DEFAULT 'uploaded',
  sessionAmount REAL NOT NULL DEFAULT 0,
  paymentStatus TEXT NOT NULL DEFAULT 'not_required',
  paymentRequestedAt INTEGER,
  paymentRequestedBy TEXT,
  paymentPaidAt INTEGER,
  paymentTransactionId TEXT,
  paymentMethod TEXT
);

CREATE TABLE IF NOT EXISTS notary_calls (
  id TEXT PRIMARY KEY,
  notaryId TEXT NOT NULL,
  notaryName TEXT NOT NULL,
  documentId TEXT NOT NULL,
  documentName TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  ownerName TEXT NOT NULL,
  sessionId TEXT,
  callType TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'initiated',
  amount REAL NOT NULL DEFAULT 0,
  startedAt INTEGER,
  completedAt INTEGER,
  duration INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (documentId) REFERENCES owner_documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recordings (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  userId TEXT,
  username TEXT,
  userRole TEXT,
  fileName TEXT NOT NULL,
  mimeType TEXT,
  sizeBytes INTEGER,
  provider TEXT NOT NULL DEFAULT 'onedrive',
  providerFileId TEXT,
  providerUrl TEXT,
  shareUrl TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded',
  errorMessage TEXT,
  startedAt INTEGER,
  endedAt INTEGER,
  durationMs INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
`;

module.exports = { initSql };
