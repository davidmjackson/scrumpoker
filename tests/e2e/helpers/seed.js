const path = require('path');
const fs = require('fs');
const { createSessionsStore } = require('@suite/auth-client/lib/sessions-db.js');

const DB = path.join(__dirname, '..', '.data', 'poker-sessions.db');

function seedSession({ id = 's-e2e', userId = 'u-e2e', teams = [{ id: 't1', name: 'Alpha', role: 'lead', company: 'Acme Co' }] } = {}) {
  fs.mkdirSync(path.dirname(DB), { recursive: true });
  const store = createSessionsStore(DB);
  // Delete any existing session with this id before inserting (idempotent upsert).
  store.delete(id);
  store.create({ id, userId, centralSessionId: 'c-e2e', expiresAt: Date.now() + 60 * 60 * 1000, entitled: true, teams });
  return { id, userId, teams };
}

module.exports = { seedSession, DB };
