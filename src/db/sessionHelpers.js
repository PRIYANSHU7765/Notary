/**
 * Database Session Management
 * Session participant tracking in database
 */

const { dbGet, dbRun, persistDatabase, now } = require('./index');
const { normalizeRole } = require('../utils/normalizers');
const crypto = require('crypto');

async function upsertSessionParticipant({ sessionId, socketId, userId, username, role }) {
  if (!sessionId) throw new Error('sessionId required');

  const existing = await dbGet('SELECT * FROM sessions WHERE sessionId = :sessionId', { sessionId });

  if (existing && Number(existing.terminated) === 1) {
    throw new Error('Session is terminated');
  }

  const participant = { socketId, userId, username, role, joinedAt: now() };
  let participants = [];
  let notaryIds = [];

  if (existing) {
    try {
      participants = JSON.parse(existing.participants || '[]');
      notaryIds = JSON.parse(existing.notaryIds || '[]');
    } catch {
      // Reset if corrupt
    }
  }

  participants = participants.filter((p) => p.socketId !== socketId);
  participants.push(participant);

  if (role === 'notary' && userId) {
    notaryIds = Array.from(new Set([...notaryIds, userId]));
  }

  const ownerId = role === 'signer' ? (userId || null) : (existing?.ownerId || null);
  const ownerUsername = role === 'signer' ? (username || null) : (existing?.ownerUsername || null);

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

  await dbRun(
    `INSERT INTO sessions (sessionId, ownerId, ownerUsername, notaryIds, participants, active, createdAt, updatedAt)
     VALUES (:sessionId, :ownerId, :ownerUsername, :notaryIds, :participants, :active, :createdAt, :updatedAt)
     ON CONFLICT (sessionId) DO UPDATE SET
       ownerId = EXCLUDED.ownerId,
       ownerUsername = EXCLUDED.ownerUsername,
       notaryIds = EXCLUDED.notaryIds,
       participants = EXCLUDED.participants,
       active = EXCLUDED.active,
       updatedAt = EXCLUDED.updatedAt`,
    data
  );

  await persistDatabase();
  return data;
}

async function removeSessionParticipant(sessionId, socketId) {
  if (!sessionId) throw new Error('sessionId required');
  const existing = await dbGet('SELECT * FROM sessions WHERE sessionId = :sessionId', { sessionId });
  if (!existing) return null;

  const participants = JSON.parse(existing.participants || '[]').filter((p) => p.socketId !== socketId);
  const notaryIds = Array.from(
    new Set(participants.filter((p) => p.role === 'notary').map((p) => p.userId))
  );

  const signer = participants.find((p) => p.role === 'signer');
  const active = participants.length > 0 ? 1 : 0;

  await dbRun(
    `UPDATE sessions SET participants = :participants, notaryIds = :notaryIds, ownerId = :ownerId, ownerUsername = :ownerUsername, active = :active, updatedAt = :updatedAt WHERE sessionId = :sessionId`,
    {
      participants: JSON.stringify(participants),
      notaryIds: JSON.stringify(notaryIds),
      ownerId: signer?.userId || null,
      ownerUsername: signer?.username || null,
      active,
      updatedAt: now(),
      sessionId,
    }
  );

  await persistDatabase();
  return { sessionId, participants, notaryIds, ownerId: signer?.userId, ownerUsername: signer?.username, active };
}

module.exports = {
  upsertSessionParticipant,
  removeSessionParticipant,
};
