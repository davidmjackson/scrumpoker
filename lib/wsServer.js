const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');
const { getRoomState, touchRoom, findRoomByToken } = require('./roomState');
const { authenticateUpgrade } = require('./upgradeAuth');
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

async function decideUpgrade({ verifySession, cookie, url, rooms }) {
  const sess = await authenticateUpgrade(verifySession, cookie);
  if (sess.ok) {
    const c = sess.context;
    return { ok: true, authed: true, hubUserId: c.userId, teams: c.teams || [], company: c.company || null };
  }
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  const token = new URLSearchParams(q).get('token');
  const anonRoom = findRoomByToken(rooms, token);
  if (anonRoom) return { ok: true, authed: false, anonRoom };
  return { ok: false, status: 401 };
}

function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function createWsServer({ server, rooms, auth, logger = console }) {
  const participants = {};
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 64 * 1024
  });

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const url = String(req.url || '');
    if (url !== '/ws' && !url.startsWith('/ws?')) {
      socket.destroy();
      return;
    }
    let decision;
    try {
      decision = await decideUpgrade({ verifySession: auth.verifySession, cookie: req.headers.cookie, url, rooms });
    } catch (err) {
      logger.error('WS upgrade auth error:', err);
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!decision.ok) {
      socket.write(`HTTP/1.1 ${decision.status} Unauthorized\r\n\r\n`);
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.authed = decision.authed;
      if (decision.authed) {
        ws.hubUserId = decision.hubUserId;
        ws.company = decision.company;
      } else {
        ws.anonRoom = decision.anonRoom;
      }
      wss.emit('connection', ws, req);
    });
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
          handleLogin({
            ws,
            userId,
            payload,
            rooms,
            participants,
            sendToClient,
            sendRoomState
          });
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
  sendToClient,
  decideUpgrade
};
