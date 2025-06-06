// server.js

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

function joinRoom(roomName, userId) {
  const now = Date.now();
  if (!rooms.has(roomName)) {
    // Create new room if missing, with its own reveal and facilitator fields
    rooms.set(roomName, {
      users: new Set(),
      lastActive: now,
      votesRevealed: false,
      facilitatorId: null
    });
  }
  const room = rooms.get(roomName);
  room.users.add(userId);
  room.lastActive = now;
}

function leaveRoom(roomName, userId) {
  if (!rooms.has(roomName)) return;
  const room = rooms.get(roomName);
  room.users.delete(userId);
  room.lastActive = Date.now();
  // Optional: you can immediately delete an empty room here,
  // but we’ll rely on the periodic cleanup to remove expired rooms.
}

// Every minute: sweep out rooms idle for ≥5 minutes
setInterval(() => {
  const now = Date.now();
  const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  for (const [roomName, data] of rooms.entries()) {
    if (now - data.lastActive > EXPIRY_MS) {
      rooms.delete(roomName);
      console.log(`Expired room deleted: ${roomName}`);
    }
  }
}, 60 * 1000);

const fs = require('fs');
const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

console.log('✅ Required modules loaded');

const KEYS_FILE = path.join(__dirname, 'keys.json');


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

console.log('✅ Express app created');

// ── 1) Serve static files from public/ ───────────────────────────────────
app.use('/', express.static(path.join(__dirname, 'public')));

// ── 2) Start an HTTP server, then attach WebSocketServer on /ws ──────────
const server = app.listen(PORT, '0.0.0.0',() => {
  console.log(`✅ HTTP server listening on port ${PORT}`);
});

// WebSocketServer will only upgrade on the "/ws" path:
const wss = new WebSocketServer({ server, path: '/ws' });

console.log('✅ WebSocketServer initialized');

// ── 3) Keep room state and helper functions ─────────────────────────────
let participants = {};     // { userId: { id, ws, name, role, vote } }


function broadcast(message) {
  const data = JSON.stringify(message);
  console.log(`Broadcasting: ${data}`);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}


function sendToClient(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    const data = JSON.stringify(message);

   const clientName = participants[ws.userId] && participants[ws.userId].name ? participants[ws.userId].name : 'Unknown';
  console.log(`Sending to client ${clientName}: ${data}`);
   
ws.send(data);
  }
}

function getRoomState(roomName) {
  // 1) Gather only participants in this room
  const participantList = Object.values(participants)
    .filter((p) => p.roomName === roomName)
    .map(({ ws, ...rest }) => rest);

  // 2) Read the room’s votesRevealed and facilitatorId (we’ll store these in `rooms` later)
  const roomObj = rooms.get(roomName) || {};
  const votesRevealedInRoom = roomObj.votesRevealed || false;
  const facilitatorIdInRoom = roomObj.facilitatorId || null;

  return {
    type: 'updateState',
    payload: {
      participants: participantList,
      votesRevealed: votesRevealedInRoom,
      facilitatorId: facilitatorIdInRoom,
    },
  };
}

function assignFacilitator(roomName) {
  const roomObj = rooms.get(roomName);
  if (!roomObj) return;

  // If there is no current facilitator for this room (or they’ve disconnected), choose a new one
  if (!roomObj.facilitatorId || !participants[roomObj.facilitatorId]) {
    const ids = Array.from(roomObj.users);
    if (ids.length > 0) {
      roomObj.facilitatorId = ids[0];
      participants[ids[0]].role = 'Facilitator';
      console.log(`Assigned Facilitator in "${roomName}" to: ${participants[ids[0]].name}`);
    } else {
      roomObj.facilitatorId = null;
      console.log(`No users left in "${roomName}", cleared facilitator.`);
    }
  } else if (participants[roomObj.facilitatorId]) {
    // Ensure they still have the “Facilitator” role
    participants[roomObj.facilitatorId].role = 'Facilitator';
  }
}

// ── 4) Handle WebSocket connections ───────────────────────────────────────
wss.on('connection', (ws) => {

  const userId = uuidv4();
  ws.userId = userId;
  console.log(`Client connected: ${userId}`);

  // Send the client their assigned ID and the current room state
  sendToClient(ws, { type: 'yourId', payload: { id: userId } });
  // If the client sent a room in the payload, use that; otherwise, use the roomName from participants

  ws.on('message', (message) => {
    let parsed;
    try {
      parsed = JSON.parse(message);
      console.log(`Received from ${userId}:`, parsed);
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
        participants[userId] = {
          id: userId,
          ws: ws,
          name: name,
          role: role,
          vote: null,
          roomName: internalRoom
        };

        joinRoom(internalRoom, userId);

        // Broadcast updated room state…
        const roomState = getRoomState(internalRoom);

        rooms.get(internalRoom).users.forEach((id) => {
          const clientSocket = participants[id].ws;
          if (clientSocket.readyState === WebSocket.OPEN) {
            sendToClient(clientSocket, roomState);
          }
        });

        const joinedPayload = {
          type: 'userJoined',
          payload: {
            userId: userId,
            name: name,
            role: role,
            allUsersInRoom: Array.from(rooms.get(internalRoom).users).map((id) => {
              const p = participants[id];
              return { userId: id, name: p.name, role: p.role };
            })
          }
        };
        rooms.get(internalRoom).users.forEach((id) => {
          const clientSocket = participants[id].ws;
          if (clientSocket && clientSocket.readyState === WebSocket.OPEN) {
            sendToClient(clientSocket, joinedPayload);
          }
        });

        console.log(`User logged in: ${name} (${userId}), Room: ${room}`);
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
            console.log(`User ${currentUser.name} voted: ${payload.vote}`);

            // 7.3) Send the updated state only to users in this room
            {
              const roomState = getRoomState(roomNameVote);
              rooms.get(roomNameVote).users.forEach((id) => {
                const clientSocket = participants[id].ws;
                if (clientSocket.readyState === WebSocket.OPEN) {
                  sendToClient(clientSocket, roomState);
                }
              });
            }
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

          console.log(`Votes revealed by ${currentUser.name} in room "${roomNameReveal}"`);

          // 8.2) Send updated state only to sockets in this room
          {
            const roomState = getRoomState(roomNameReveal);
            rooms.get(roomNameReveal).users.forEach((id) => {
              const clientSocket = participants[id].ws;
              if (clientSocket.readyState === WebSocket.OPEN) {
                sendToClient(clientSocket, roomState);
              }
            });
          }

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

        console.log(`Votes reset by ${currentUser.name} in room "${roomNameReset}"`);

        // 9.4) Send the updated state only to sockets in this room
        {
          const roomState = getRoomState(roomNameReset);
          rooms.get(roomNameReset).users.forEach((id) => {
            const clientSocket = participants[id].ws;
            if (clientSocket.readyState === WebSocket.OPEN) {
              sendToClient(clientSocket, roomState);
            }
          });
        }

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
        console.log(`Role for ${target.name} changed to ${newRole} by ${currentUser.name} in room "${roomNameCR}"`);

        // 10.4) Send updated state only to that room
        {
          const roomStateCR = getRoomState(roomNameCR);
          rooms.get(roomNameCR).users.forEach((id) => {
            const clientSocket = participants[id].ws;
            if (clientSocket.readyState === WebSocket.OPEN) {
              sendToClient(clientSocket, roomStateCR);
            }
          });
        }

        break;
      }

        case 'logout': {
          const leavingUser = participants[userId];
          if (leavingUser) {
            const roomNameLO = leavingUser.roomName;
            console.log(`User logged out: ${leavingUser.name} (${userId}) from room "${roomNameLO}"`);

            // 11.1) Remove user from the room's Set
            leaveRoom(roomNameLO, userId);

            // 11.2) If they were that room's facilitator, clear and reassign within the room
            const roomObjLO = rooms.get(roomNameLO);
            if (roomObjLO && roomObjLO.facilitatorId === userId) {
              roomObjLO.facilitatorId = null;
              // Optionally pick a new facilitator among remaining users:
              if (roomObjLO.users.size > 0) {
                const [newFacilitatorId] = roomObjLO.users.values();
                roomObjLO.facilitatorId = newFacilitatorId;
                participants[newFacilitatorId].role = 'Facilitator';
              }
            }

            // 11.3) Delete from participants
            delete participants[userId];

            // 11.4) Send updated state only to users still in that room
            if (roomObjLO) {
              const roomStateLO = getRoomState(roomNameLO);
              roomObjLO.users.forEach((id) => {
                const clientSocket = participants[id].ws;
                if (clientSocket.readyState === WebSocket.OPEN) {
                  sendToClient(clientSocket, roomStateLO);
                }
              });
            }
          }
          break;
        }

      default:
        console.log(`Unknown message type received: ${type}`);
        sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
    }
  });

  ws.on('close', () => {
    const disc = participants[userId];
    if (disc) {
      const roomNameDC = disc.roomName;
      console.log(`Client disconnected: ${disc.name} (${userId}) from room "${roomNameDC}"`);

      // 12.1) Remove user from their room
      leaveRoom(roomNameDC, userId);

      // 12.2) If they were that room’s facilitator, clear & reassign within the room
      const roomObjDC = rooms.get(roomNameDC);
      if (roomObjDC && roomObjDC.facilitatorId === userId) {
        roomObjDC.facilitatorId = null;
        if (roomObjDC.users.size > 0) {
          const [newFacilitatorId] = roomObjDC.users.values();
          roomObjDC.facilitatorId = newFacilitatorId;
          participants[newFacilitatorId].role = 'Facilitator';
        }
      }

      // 12.3) Delete from participants
      delete participants[userId];

      // 12.4) Send updated state only to remaining users in that room
      if (roomObjDC) {
        const roomStateDC = getRoomState(roomNameDC);
        roomObjDC.users.forEach((id) => {
          const clientSocket = participants[id].ws;
          if (clientSocket.readyState === WebSocket.OPEN) {
            sendToClient(clientSocket, roomStateDC);
          }
        });
      }
    } else {
      console.log(`Client disconnected (not logged in): ${userId}`);
    }
  });

ws.on('error', (error) => {
  console.error(`WebSocket error for user ${userId}:`, error);
  const errUser = participants[userId];
  if (errUser) {
    const roomNameErr = errUser.roomName;
    console.log(`WebSocket error cleanup: ${errUser.name} (${userId}) in room "${roomNameErr}"`);

    // 13.1) Remove user from their room’s Set
    leaveRoom(roomNameErr, userId);

    // 13.2) If they were that room’s facilitator, clear & reassign within the room
    const roomObjErr = rooms.get(roomNameErr);
    if (roomObjErr && roomObjErr.facilitatorId === userId) {
      roomObjErr.facilitatorId = null;
      if (roomObjErr.users.size > 0) {
        const [newFacilitatorId] = roomObjErr.users.values();
        roomObjErr.facilitatorId = newFacilitatorId;
        participants[newFacilitatorId].role = 'Facilitator';
      }
    }

    // 13.3) Delete from participants
    delete participants[userId];

    // 13.4) Send updated state only to remaining users in that room
    if (roomObjErr) {
      const roomStateErr = getRoomState(roomNameErr);
      roomObjErr.users.forEach((id) => {
        const clientSocket = participants[id].ws;
        if (clientSocket.readyState === WebSocket.OPEN) {
          sendToClient(clientSocket, roomStateErr);
        }
      });
    }
  }
});

});
