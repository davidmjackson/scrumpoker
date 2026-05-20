const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { getRoomState, touchRoom } = require('./roomState');
const { createLoginRateLimiter } = require('./loginRateLimiter');
const {
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleStartNextRound,
  handleVote
} = require('./wsHandlers');

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Prefer the proxy-forwarded client IP so the rate limiter keys on the real
// caller rather than the Nginx loopback address.
function getClientKey(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }

  return req?.socket?.remoteAddress || 'unknown';
}

function createWsServer({
  server,
  rooms,
  keysFile,
  logger = console,
  loginRateLimiter = createLoginRateLimiter()
}) {
  const participants = {};
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });

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
    // Count any broadcast as activity so live sessions are not swept by expireRooms.
    touchRoom(rooms, roomName);
    sendToRoom(roomName, getRoomState(rooms, participants, roomName));
  }

  function handleExit(userId) {
    const participant = participants[userId];
    if (participant) {
      handleParticipantExit({ userId, participants, rooms, sendRoomState });
    }
  }

  wss.on('connection', (ws, req) => {
    const userId = uuidv4();
    ws.userId = userId;
    ws.clientKey = getClientKey(req);

    sendToClient(ws, { type: 'yourId', payload: { id: userId } });

    ws.on('message', (message) => {
      let parsed;
      try {
        parsed = JSON.parse(message);
      } catch (err) {
        logger.error('Invalid message:', message);
        return sendToClient(ws, { type: 'error', payload: { message: 'Invalid JSON.' } });
      }

      const { type, payload } = parsed;
      const currentUser = participants[userId];

      switch (type) {
        case 'login': {
          if (loginRateLimiter.isBlocked(ws.clientKey)) {
            sendToClient(ws, {
              type: 'error',
              payload: { message: 'Too many login attempts. Please wait a few minutes and try again.' }
            });
            break;
          }

          handleLogin({
            ws,
            userId,
            payload,
            rooms,
            participants,
            keysFile,
            sendToClient,
            sendRoomState,
            onKeyLoadError: (err) => logger.error('Failed to load keys.json:', err)
          });

          if (participants[userId]) {
            loginRateLimiter.recordSuccess(ws.clientKey);
          } else {
            loginRateLimiter.recordFailure(ws.clientKey);
          }
          break;
        }

        case 'vote':
          handleVote({ ws, currentUser, payload, rooms, sendToClient, sendRoomState });
          break;

        case 'revealVotes':
          handleRevealVotes({ ws, currentUser, rooms, sendToClient, sendRoomState });
          break;

        case 'resetVotes':
          handleResetVotes({ ws, currentUser, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'endSession':
          handleEndSession({ ws, currentUser, participants, rooms, sendToClient, sendToRoom });
          break;

        case 'startNextRound':
          handleStartNextRound({ ws, currentUser, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'changeRole':
          handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState });
          break;

        case 'logout':
          handleExit(userId);
          break;

        default:
          sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
      }
    });

    ws.on('close', () => {
      handleExit(userId);
    });

    ws.on('error', (error) => {
      logger.error(`WebSocket error for user ${userId}:`, error);
      handleExit(userId);
    });
  });

  return {
    participants,
    sendRoomState,
    sendToClient,
    sendToRoom,
    wss
  };
}

module.exports = {
  createWsServer,
  sendToClient
};
