// server.js

const {
  DEFAULT_ROOM_EXPIRY_MS,
  expireRooms,
  getRoomState
} = require('./lib/roomState');
const {
  AccessKeyError,
  createAccessKey,
  getKeysFilePath,
  isAdminKeyAuthorized,
  listAccessKeys,
  removeAccessKey
} = require('./lib/accessKeys');
const {
  handleChangeRole,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleVote
} = require('./lib/wsHandlers');

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

// Every minute: sweep out rooms idle for 60 minutes
setInterval(() => {
  expireRooms(rooms, Date.now(), DEFAULT_ROOM_EXPIRY_MS);
}, 60 * 1000);

const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

//console.log('✅ Required modules loaded');

const KEYS_FILE = getKeysFilePath(__dirname);


// Use PORT from env or default to 3000
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.SCRUM_POKER_ADMIN_KEY || '';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('etag', false);

const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self' data:",
  "img-src 'self' data:",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');

const permissionsPolicy = [
  'accelerometer=()',
  'camera=()',
  'geolocation=()',
  'gyroscope=()',
  'microphone=()',
  'payment=()',
  'usb=()'
].join(', ');

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Origin-Agent-Cluster', '?1');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', permissionsPolicy);
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
}

app.use((req, res, next) => {
  applySecurityHeaders(res);
  setNoCacheHeaders(res);
  next();
});

app.use(express.json({ limit: '8kb' }));

function requireAdminKey(req, res, next) {
  if (!ADMIN_KEY) {
    return res.status(503).json({ error: 'Admin key management is not configured.' });
  }

  const providedKey = req.get('x-scrum-poker-admin-key') || '';
  if (!isAdminKeyAuthorized(providedKey, ADMIN_KEY)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  next();
}

function sendAccessKeyError(res, err) {
  if (!(err instanceof AccessKeyError)) {
    return res.status(500).json({ error: 'Unable to manage access keys.' });
  }

  const statusByCode = {
    DUPLICATE_KEY_NAME: 409,
    INVALID_ACCESS_KEY: 400,
    INVALID_KEY_NAME: 400,
    KEY_NOT_FOUND: 404
  };

  return res.status(statusByCode[err.code] || 500).json({ error: err.message });
}

//console.log('✅ Express app created');

// ── 1) Serve static files from public/ ───────────────────────────────────
//app.use('/', express.static(path.join(__dirname, 'public')));


// add file security options to static middleware
app.use(
  '/',
  express.static(path.join(__dirname, 'public'), {

    dotfiles: 'ignore',    // never serve “.gitignore”, “.env”, etc.
    index: false,          // don’t auto-serve index.html on directory access
    extensions: ['html'],  // only resolve .html if a plain name is requested
    redirect: false,       // forbid trailing-slash redirects
    etag: false,
    lastModified: false,
    cacheControl: false,
    acceptRanges: false,
    setHeaders: (res) => {
      applySecurityHeaders(res);
      setNoCacheHeaders(res);
    }
  })
);

  app.get('/', (req, res) => {
    applySecurityHeaders(res);
    setNoCacheHeaders(res);
    res.sendFile(path.join(__dirname, 'public', 'index.html'), {
      lastModified: false,
      cacheControl: false,
      acceptRanges: false
    });
  });

  app.get(['/license', '/licence'], (req, res) => {
    applySecurityHeaders(res);
    setNoCacheHeaders(res);
    res.sendFile(path.join(__dirname, 'public', 'license.html'), {
      lastModified: false,
      cacheControl: false,
      acceptRanges: false
    });
  });

  app.get('/api/admin/keys', requireAdminKey, (_req, res) => {
    try {
      res.status(200).json({ keys: listAccessKeys(KEYS_FILE) });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.post('/api/admin/keys', requireAdminKey, (req, res) => {
    try {
      const key = createAccessKey(KEYS_FILE, req.body?.name);
      res.status(201).json({ key });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.delete('/api/admin/keys/:name', requireAdminKey, (req, res) => {
    try {
      const removed = removeAccessKey(KEYS_FILE, req.params.name);
      res.status(200).json({ removed });
    } catch (err) {
      sendAccessKeyError(res, err);
    }
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      rooms: rooms.size
    });
  });


// ── 2) Start an HTTP server, then attach WebSocketServer on /ws ──────────
const server = app.listen(PORT, '0.0.0.0',() => {
  //console.log(`✅ HTTP server listening on port ${PORT}`);
});
server.on('request', (_req, res) => {
  if (!res.headersSent) {
    res.removeHeader('Server');
  }
});

// WebSocketServer will only upgrade on the "/ws" path:
const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: false,
  maxPayload: 64 * 1024
});

//console.log('✅ WebSocketServer initialized');

// ── 3) Keep room state and helper functions ─────────────────────────────
let participants = {};     // { userId: { id, ws, name, role, vote } }


function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendToRoom(roomName, message) {
  const room = rooms.get(roomName);
  if (!room) return;

  room.users.forEach((id) => {
    const clientSocket = participants[id]?.ws;
    if (clientSocket?.readyState === WebSocket.OPEN) {
      sendToClient(clientSocket, message);
    }
  });
}

function sendRoomState(roomName) {
  sendToRoom(roomName, getRoomState(rooms, participants, roomName));
}

// ── 4) Handle WebSocket connections ───────────────────────────────────────
wss.on('connection', (ws) => {

  const userId = uuidv4();
  ws.userId = userId;
  //console.log(`Client connected: ${userId}`);

  // Send the client their assigned ID and the current room state
  sendToClient(ws, { type: 'yourId', payload: { id: userId } });
  // If the client sent a room in the payload, use that; otherwise, use the roomName from participants

  ws.on('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
      //console.log(`Received from ${userId}:`, parsed);
    } catch (err) {
      console.error('Invalid message:', message);
      return sendToClient(ws, { type: 'error', payload: { message: 'Invalid JSON.' } });
    }

    const { type, payload } = parsed;
    const currentUser = participants[userId];

    switch (type) {
      case 'login':
        handleLogin({
          ws,
          userId,
          payload,
          rooms,
          participants,
          keysFile: KEYS_FILE,
          sendToClient,
          sendToRoom,
          sendRoomState,
          onKeyLoadError: (err) => console.error('Failed to load keys.json:', err)
        });
        break;

      case 'vote':
        handleVote({ ws, currentUser, payload, rooms, sendToClient, sendRoomState });
        break;

      case 'revealVotes':
        handleRevealVotes({ ws, currentUser, rooms, sendToClient, sendRoomState });
        break;

      case 'resetVotes':
        handleResetVotes({ ws, currentUser, participants, rooms, sendToClient, sendRoomState });
        break;

      case 'changeRole':
        handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState });
        break;

      case 'logout':
        handleParticipantExit({ userId, participants, rooms, sendRoomState });
        break;

      default:
        //console.log(`Unknown message type received: ${type}`);
        sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
    }
  });

  ws.on('close', () => {
    const disc = participants[userId];
    if (disc) {
      handleParticipantExit({ userId, participants, rooms, sendRoomState });
    } else {
      //console.log(`Client disconnected (not logged in): ${userId}`);
    }
  });

ws.on('error', (error) => {
  console.error(`WebSocket error for user ${userId}:`, error);
  const errUser = participants[userId];
  if (errUser) {
    handleParticipantExit({ userId, participants, rooms, sendRoomState });
  }
});

});
