/**
 * File Utilities
 * File handling, sanitization, and parsing helpers
 */

const fs = require('fs');
const path = require('path');

const sanitizeFileName = (fileName) => {
  const base = String(fileName || 'recording.webm').trim() || 'recording.webm';
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.length > 180 ? safe.slice(0, 180) : safe;
};

const parseDataUrlPayload = (dataUrl) => {
  const raw = String(dataUrl || '').trim();
  if (!raw) {
    throw new Error('Recording payload is empty');
  }

  const match = raw.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64Payload: match[2] };
  }

  return { mimeType: 'application/octet-stream', base64Payload: raw };
};

const ensureDirExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const ensureFileExists = (filePath, defaultContent = '') => {
  if (!fs.existsSync(filePath)) {
    ensureDirExists(path.dirname(filePath));
    fs.writeFileSync(filePath, defaultContent, 'utf8');
  }
};

const escapeRegExp = (string) => String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = {
  sanitizeFileName,
  parseDataUrlPayload,
  ensureDirExists,
  ensureFileExists,
  escapeRegExp,
};
