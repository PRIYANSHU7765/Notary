/**
 * Assets Routes
 */
const express = require('express');
const { now, dbAll, dbGet, dbRun, persistDatabase } = require('../db');

const router = express.Router();

router.get('/:userRole', async (req, res) => {
  try {
    const { userRole } = req.params;
    const { sessionId, userId } = req.query;

    const assets = await dbAll(
      `SELECT * FROM assets
       WHERE userRole = :userRole
         AND (:sessionId IS NULL OR sessionId = :sessionId)
         AND (:userId IS NULL OR userId = :userId)
       ORDER BY createdAt DESC`,
      { userRole, sessionId: sessionId || null, userId: userId || null }
    );

    res.json(assets);
  } catch (error) {
    console.error('Error fetching assets:', error);
    res.status(500).json({ error: 'Failed to fetch assets' });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      id,
      sessionId,
      userId,
      username,
      name,
      type,
      image,
      text,
      width,
      height,
      userRole,
    } = req.body || {};

    if (!id || !name || !type || !userRole) {
      return res.status(400).json({ error: 'Missing required fields: id, name, type, userRole' });
    }

    const nowMs = now();
    await dbRun(
      `
      INSERT INTO assets (id, sessionId, userId, username, name, type, image, text, width, height, userRole, createdAt, updatedAt)
      VALUES (:id, :sessionId, :userId, :username, :name, :type, :image, :text, :width, :height, :userRole, :createdAt, :updatedAt)
      ON CONFLICT(id) DO UPDATE SET
        sessionId = excluded.sessionId,
        userId = excluded.userId,
        username = excluded.username,
        name = excluded.name,
        type = excluded.type,
        image = excluded.image,
        text = excluded.text,
        width = excluded.width,
        height = excluded.height,
        userRole = excluded.userRole,
        updatedAt = excluded.updatedAt
    `,
      {
        id,
        sessionId: sessionId || null,
        userId: userId || null,
        username: username || null,
        name,
        type,
        image: image || null,
        text: text || null,
        width: Number(width) || null,
        height: Number(height) || null,
        userRole,
        createdAt: nowMs,
        updatedAt: nowMs,
      }
    );
    await persistDatabase();

    const saved = await dbGet('SELECT * FROM assets WHERE id = :id', { id });
    res.json(saved);
  } catch (error) {
    console.error('Error saving asset:', error);
    res.status(500).json({ error: 'Failed to save asset', details: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await dbGet('SELECT * FROM assets WHERE id = :id', { id });
    if (!existing) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    await dbRun('DELETE FROM assets WHERE id = :id', { id });
    await persistDatabase();

    res.json({ message: 'Asset deleted' });
  } catch (error) {
    console.error('Error deleting asset:', error);
    res.status(500).json({ error: 'Failed to delete asset' });
  }
});

module.exports = router;
