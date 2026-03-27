/**
 * Signatures Routes
 */
const express = require('express');
const { now, dbAll, dbGet, dbRun, persistDatabase } = require('../db');

const router = express.Router();

router.get('/:userRole', async (req, res) => {
  try {
    const { userRole } = req.params;
    const { sessionId, userId } = req.query;

    const signatures = await dbAll(
      `SELECT * FROM signatures
       WHERE userRole = :userRole
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:userId IS NULL OR userId = :userId)
       ORDER BY createdAt DESC`,
      { userRole, sessionId: sessionId || null, userId: userId || null }
    );

    res.json(signatures);
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ error: 'Failed to fetch signatures' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { id, sessionId, userId, username, name, image, userRole } = req.body || {};

    if (!id || !sessionId || !image || !userRole) {
      return res.status(400).json({ error: 'Missing required fields: id, sessionId, image, userRole' });
    }

    const nowMs = now();
    await dbRun(
      `
      INSERT INTO signatures (id, sessionId, userId, username, name, image, userRole, createdAt, updatedAt)
      VALUES (:id, :sessionId, :userId, :username, :name, :image, :userRole, :createdAt, :updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        sessionId = excluded.sessionId,
        userId = excluded.userId,
        username = excluded.username,
        name = excluded.name,
        image = excluded.image,
        userRole = excluded.userRole,
        updatedAt = excluded.updatedAt
    `,
      {
        id,
        sessionId,
        userId: userId || null,
        username: username || null,
        name: name || 'Unnamed Signature',
        image,
        userRole,
        createdAt: nowMs,
        updatedAt: nowMs,
      }
    );
    await persistDatabase();

    const saved = await dbGet('SELECT * FROM signatures WHERE id = :id', { id });
    res.json(saved);
  } catch (error) {
    console.error('Error saving signature:', error);
    res.status(500).json({ error: 'Failed to save signature', details: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM signatures WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Signature not found' });
    }

    await dbRun('DELETE FROM signatures WHERE id = :id', { id });
    await persistDatabase();

    res.json({ message: 'Signature deleted' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    res.status(500).json({ error: 'Failed to delete signature' });
  }
});

module.exports = router;
