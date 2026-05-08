// server.js

const {
  DEFAULT_ROOM_EXPIRY_MS,
  expireRooms,
  getRoomState
} = require('./lib/roomState');
const { getKeysFilePath } = require('./lib/accessKeys');
const { createHttpApp } = require('./lib/httpApp');
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
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

//console.log('✅ Required modules loaded');

const KEYS_FILE = getKeysFilePath(__dirname);


// Use PORT from env or default to 3000
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.SCRUM_POKER_ADMIN_KEY || '';
const app = createHttpApp({
  publicDir: path.join(__dirname, 'public'),
  keysFile: KEYS_FILE,
  adminKey: ADMIN_KEY,
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
