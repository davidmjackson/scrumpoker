// server.js
const path = require('path');
const { createAuthClient } = require('@suite/auth-client');
const {
  DEFAULT_ROOM_EXPIRY_MS,
  expireRooms
} = require('./lib/roomState');
const { getBuildInfo } = require('./lib/buildInfo');
const { createHttpApp } = require('./lib/httpApp');
const { createWsServer } = require('./lib/wsServer');

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

const PORT = process.env.PORT || 3005;
const publicDir = path.join(__dirname, 'public');

const auth = createAuthClient({
  appName: process.env.APP_NAME || 'poker',
  hubBaseUrl: process.env.HUB_BASE_URL,
  hubApiKey: process.env.HUB_API_KEY,
  cookieName: 'poker_session',
  cookieDomain: process.env.COOKIE_DOMAIN,
  dbPath: process.env.APP_SESSIONS_DB || path.join(__dirname, 'data', 'poker-sessions.db'),
});

const app = createHttpApp({
  publicDir,
  auth,
  buildInfo: getBuildInfo(__dirname),
  getRoomCount: () => rooms.size
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Scrum Poker listening on :${PORT}`);
});
server.on('request', (_req, res) => {
  if (!res.headersSent) {
    res.removeHeader('Server');
  }
});

const { participants } = createWsServer({ server, rooms, auth });

setInterval(() => {
  expireRooms(rooms, Date.now(), DEFAULT_ROOM_EXPIRY_MS, participants);
}, 60 * 1000);
