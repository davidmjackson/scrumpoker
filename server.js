// server.js

const {
  DEFAULT_ROOM_EXPIRY_MS,
  assignFacilitator,
  expireRooms,
  getRoomState,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving
} = require('./lib/roomState');

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

// Every minute: sweep out rooms idle for 60 minutes
setInterval(() => {
  expireRooms(rooms, Date.now(), DEFAULT_ROOM_EXPIRY_MS);
}, 60 * 1000);

const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

//console.log('✅ Required modules loaded');

const KEYS_FILE = process.env.SCRUM_POKER_KEYS_FILE
  ? path.resolve(process.env.SCRUM_POKER_KEYS_FILE)
  : path.join(__dirname, 'keys.json');


function loadKeys() {
  try {
    const data = fs.readFileSync(KEYS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Failed to load keys.json:', err);
    return {};
  }
}


// Use PORT from env or default to 3000
const PORT = process.env.PORT || 3000;
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
  res.removeHeader('Server');
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


function broadcast(message) {
  const data = JSON.stringify(message);
  //console.log(`Broadcasting: ${data}`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}


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

        // 1) Ensure all fields including accessKey
        if (
          !payload ||
          !payload.name ||
          !payload.role ||
          !payload.room ||
          !payload.accessKey
        ) {
          return sendToClient(ws, {
            type: 'error',
            payload: { message: 'Login requires key, name, role, and room.' }
          });
        }

        const { name, role, room, accessKey } = payload;
        const allowedRoles = ['Voter', 'Observer', 'Facilitator'];
        if (!allowedRoles.includes(role)) {
          return sendToClient(ws, {
            type: 'error',
            payload: { message: 'Invalid role.' }
          });
        }

        const internalRoom = `${room}-${accessKey}`;

        // 2) Validate accessKey against saved keys
        const allKeys = loadKeys();
        const valid = Object.values(allKeys).includes(accessKey);

        if (!valid) {
          return sendToClient(ws, {
            type: 'error',
            payload: { message: 'Invalid access key.' }
          });
        }

        // 3) (Existing) Continue with login
        ws.name = name;
        ws.role = role;
        ws.roomName = internalRoom;
        joinRoom(rooms, internalRoom, userId);

        let assignedRole = role;
        const roomForLogin = rooms.get(internalRoom);
        if (assignedRole === 'Facilitator') {
          if (!roomForLogin.facilitatorId) {
            roomForLogin.facilitatorId = userId;
          } else {
            assignedRole = 'Voter';
          }
        }

        participants[userId] = {
          id: userId,
          ws: ws,
          name: name,
          role: assignedRole,
          vote: null,
          roomName: internalRoom
        };

        assignFacilitator(rooms, participants, internalRoom);

        // Broadcast updated room state…
        sendRoomState(internalRoom);

        const joinedPayload = {
          type: 'userJoined',
          payload: {
            userId: userId,
            name: name,
            role: assignedRole,
            allUsersInRoom: Array.from(rooms.get(internalRoom).users).map((id) => {
              const p = participants[id];
              return { userId: id, name: p.name, role: p.role };
            })
          }
        };
        sendToRoom(internalRoom, joinedPayload);

        //console.log(`User logged in: ${name} (${userId}), Room: ${room}`);
        break;

        case 'vote': {
          if (!currentUser) {
            return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
          }
          if (currentUser.role === 'Observer') {
            return sendToClient(ws, { type: 'error', payload: { message: 'Observers cannot vote.' } });
          }

          // 7.1) Use per‐room votesRevealed instead of the old global
          const roomNameVote = currentUser.roomName;
          const roomObjVote = rooms.get(roomNameVote) || {};
          if (roomObjVote.votesRevealed) {
            return sendToClient(ws, { type: 'error', payload: { message: 'Votes already revealed.' } });
          }

          if (payload && typeof payload.vote !== 'undefined') {
            // 7.2) Record the vote
            currentUser.vote = payload.vote;
            //console.log(`User ${currentUser.name} voted: ${payload.vote}`);

            // 7.3) Send the updated state only to users in this room
            sendRoomState(roomNameVote);
          } else {
            sendToClient(ws, { type: 'error', payload: { message: 'Invalid vote payload.' } });
          }
          break;
      }

        case 'revealVotes': {
          if (!currentUser) {
            return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
          }
          if (currentUser.role !== 'Facilitator') {
            return sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitator can reveal votes.' } });
          }

          // 8.1) Mark votesRevealed for this room only
          const roomNameReveal = currentUser.roomName;
          const roomObjReveal = rooms.get(roomNameReveal);
          if (roomObjReveal) {
            roomObjReveal.votesRevealed = true;
          }

          //console.log(`Votes revealed by ${currentUser.name} in room "${roomNameReveal}"`);

          // 8.2) Send updated state only to sockets in this room
          sendRoomState(roomNameReveal);

          break;
        }

      case 'resetVotes': {
        if (!currentUser) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        }
        if (currentUser.role !== 'Facilitator') {
          return sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitator can reset votes.' } });
        }

        // 9.1) Get the room name and its object
        const roomNameReset = currentUser.roomName;
        const roomObjReset = rooms.get(roomNameReset);

        // 9.2) Mark votesRevealed = false for this room only
        if (roomObjReset) {
          roomObjReset.votesRevealed = false;
        }

        // 9.3) Clear each participant’s vote only in this room
        Object.values(participants)
          .filter((p) => p.roomName === roomNameReset)
          .forEach((p) => {
            p.vote = null;
          });

        //console.log(`Votes reset by ${currentUser.name} in room "${roomNameReset}"`);

        // 9.4) Send the updated state only to sockets in this room
        sendRoomState(roomNameReset);

        break;
      }

      case 'changeRole': {
        if (!currentUser) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        }
        const { targetUserId, newRole } = payload || {};
        if (!newRole) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Missing new role.' } });
        }
        const allowed = ['Voter', 'Observer', 'Facilitator'];
        if (!allowed.includes(newRole)) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Invalid role.' } });
        }
        const uid = targetUserId || currentUser.id;
        const target = participants[uid];
        if (!target) {
          return sendToClient(ws, { type: 'error', payload: { message: 'User not found.' } });
        }
        if (uid !== currentUser.id && currentUser.role !== 'Facilitator') {
          return sendToClient(ws, {
            type: 'error',
            payload: { message: 'Only Facilitator can change others’ roles.' }
          });
        }

        // 10.1) Determine which room this change affects
        const roomNameCR = currentUser.roomName;
        const roomObjCR = rooms.get(roomNameCR);
        if (!roomObjCR) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Room not found.' } });
        }
        if (target.roomName !== roomNameCR) {
          return sendToClient(ws, {
            type: 'error',
            payload: { message: 'Target user is not in your room.' }
          });
        }

        // 10.2) Update facilitatorId for this room only
        if (newRole === 'Facilitator') {
          if (roomObjCR.facilitatorId && roomObjCR.facilitatorId !== uid) {
            participants[roomObjCR.facilitatorId].role = 'Voter';
          }
          roomObjCR.facilitatorId = uid;
        } else if (uid === roomObjCR.facilitatorId && newRole !== 'Facilitator') {
          roomObjCR.facilitatorId = null;
        }

        // 10.3) Set the new role on the target
        target.role = newRole;
        //console.log(`Role for ${target.name} changed to ${newRole} by ${currentUser.name} in room "${roomNameCR}"`);

        // 10.4) Send updated state only to that room
        sendRoomState(roomNameCR);

        break;
      }

        case 'logout': {
          const leavingUser = participants[userId];
          if (leavingUser) {
            const roomNameLO = leavingUser.roomName;
            //console.log(`User logged out: ${leavingUser.name} (${userId}) from room "${roomNameLO}"`);

            // 11.1) Remove user and reassign facilitator within the room if needed
            leaveRoom(rooms, roomNameLO, userId);
            const roomObjLO = reassignFacilitatorIfLeaving(rooms, participants, roomNameLO, userId);

            // 11.3) Delete from participants
            delete participants[userId];

            // 11.4) Send updated state only to users still in that room
            if (roomObjLO) {
              sendRoomState(roomNameLO);
            }
          }
          break;
        }

      default:
        //console.log(`Unknown message type received: ${type}`);
        sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
    }
  });

  ws.on('close', () => {
    const disc = participants[userId];
    if (disc) {
      const roomNameDC = disc.roomName;
      //console.log(`Client disconnected: ${disc.name} (${userId}) from room "${roomNameDC}"`);

      // 12.1) Remove user and reassign facilitator within the room if needed
      leaveRoom(rooms, roomNameDC, userId);
      const roomObjDC = reassignFacilitatorIfLeaving(rooms, participants, roomNameDC, userId);

      // 12.3) Delete from participants
      delete participants[userId];

      // 12.4) Send updated state only to remaining users in that room
      if (roomObjDC) {
        sendRoomState(roomNameDC);
      }
    } else {
      //console.log(`Client disconnected (not logged in): ${userId}`);
    }
  });

ws.on('error', (error) => {
  console.error(`WebSocket error for user ${userId}:`, error);
  const errUser = participants[userId];
  if (errUser) {
    const roomNameErr = errUser.roomName;
    //console.log(`WebSocket error cleanup: ${errUser.name} (${userId}) in room "${roomNameErr}"`);

    // 13.1) Remove user and reassign facilitator within the room if needed
    leaveRoom(rooms, roomNameErr, userId);
    const roomObjErr = reassignFacilitatorIfLeaving(rooms, participants, roomNameErr, userId);

    // 13.3) Delete from participants
    delete participants[userId];

    // 13.4) Send updated state only to remaining users in that room
    if (roomObjErr) {
      sendRoomState(roomNameErr);
    }
  }
});

});
