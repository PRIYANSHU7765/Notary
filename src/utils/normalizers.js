/**
 * Normalization Utilities
 * Helper functions to normalize common types
 */

const normalizeRoomId = (value) => {
  if (!value) return '';
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

const normalizeRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  // Backward compatibility for legacy records and tokens.
  if (normalized === 'owner') return 'signer';
  return normalized;
};

const normalizeKbaStatus = (value) => String(value || '').trim().toLowerCase();

module.exports = {
  normalizeRoomId,
  normalizeRole,
  normalizeKbaStatus,
};
