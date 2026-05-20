// server.js

const {
  DEFAULT_ROOM_EXPIRY_MS,
  expireRooms
} = require('./lib/roomState');
const { getBuildInfo } = require('./lib/buildInfo');
const { getKeysFilePath } = require('./lib/accessKeys');
const { getActivityFilePath } = require('./lib/adminActivity');
const { createHttpApp } = require('./lib/httpApp');
const { createWsServer } = require('./lib/wsServer');

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

const path = require('path');

//console.log('✅ Required modules loaded');

const KEYS_FILE = getKeysFilePath(__dirname);
const ACTIVITY_FILE = getActivityFilePath(__dirname);


// Use PORT from env or default to 3000
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.SCRUM_POKER_ADMIN_KEY || '';
const app = createHttpApp({
  publicDir: path.join(__dirname, 'public'),
  keysFile: KEYS_FILE,
  activityFile: ACTIVITY_FILE,
  adminKey: ADMIN_KEY,
  buildInfo: getBuildInfo(__dirname),
  getRoomCount: () => rooms.size
});

//console.log('✅ Express app created');

// ── 2) Start an HTTP server, then attach WebSocketServer on /ws ──────────
const server = app.listen(PORT, '0.0.0.0',() => {
  //console.log(`✅ HTTP server listening on port ${PORT}`);
});
server.on('request', (_req, res) => {
  if (!res.headersSent) {
    res.removeHeader('Server');
  }
});

const { participants } = createWsServer({
  server,
  rooms,
  keysFile: KEYS_FILE
});

// Every minute: sweep out rooms idle for 60 minutes and drop their participants.
setInterval(() => {
  expireRooms(rooms, Date.now(), DEFAULT_ROOM_EXPIRY_MS, participants);
}, 60 * 1000);

//console.log('✅ WebSocketServer initialized');
