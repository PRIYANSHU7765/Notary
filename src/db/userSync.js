/**
 * Database User Sync Module
 * Handles JSON persistence and syncing
 */

const fs = require('fs');
const path = require('path');

const usersJsonPath = path.resolve(__dirname, '../../data/users.json');

function ensureUsersJsonFile() {
  if (!fs.existsSync(path.dirname(usersJsonPath))) {
    fs.mkdirSync(path.dirname(usersJsonPath), { recursive: true });
  }
  if (!fs.existsSync(usersJsonPath)) {
    fs.writeFileSync(usersJsonPath, '[]', 'utf8');
  }
}

function appendUserToJson(user) {
  try {
    ensureUsersJsonFile();
    const raw = fs.readFileSync(usersJsonPath, 'utf8');
    const users = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    const exists = users.some((u) => u.username === user.username || u.email === user.email);
    if (!exists) {
      users.push({
        userId: user.userId,
        username: user.username,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        createdAt: new Date(user.createdAt).toISOString(),
      });
      fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
    }
  } catch (err) {
    console.warn('⚠️ Failed to write user to JSON store:', err.message || err);
  }
}

function loadUsersFromJson() {
  try {
    ensureUsersJsonFile();
    const raw = fs.readFileSync(usersJsonPath, 'utf8');
    const users = Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
    // Return users for processing in initDatabase context
    return users;
  } catch (err) {
    console.warn('⚠️ Failed to load users from JSON store:', err.message || err);
    return [];
  }
}

async function syncUsersJsonFromDb(dbAll) {
  try {
    ensureUsersJsonFile();
    const rawUsers = await dbAll(
      'SELECT userId, username, email, passwordHash, role, createdAt FROM users ORDER BY createdAt DESC'
    );
    const users = rawUsers.map((user) => ({
      userId: user.userId,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role,
      createdAt: new Date(Number(user.createdAt) || Date.now()).toISOString(),
    }));
    fs.writeFileSync(usersJsonPath, JSON.stringify(users, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Failed to sync users JSON store:', err.message || err);
  }
}

module.exports = {
  ensureUsersJsonFile,
  appendUserToJson,
  loadUsersFromJson,
  syncUsersJsonFromDb,
};
