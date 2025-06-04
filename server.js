// server.js

console.log('⏳ server.js is starting');

// Map<roomName: string, { users: Set<string>, lastActive: number }>
const rooms = new Map();

function joinRoom(roomName, userId) {
  const now = Date.now();
  if (!rooms.has(roomName)) {
    // Create new room if missing
    rooms.set(roomName, { users: new Set(), lastActive: now });
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


const path = require('path');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { v4: uuidv4 } = require('uuid');

console.log('✅ Required modules loaded');

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
let votesRevealed = false;
let facilitatorId = null;

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

function getRoomState() {
  const participantList = Object.values(participants).map(({ ws, ...rest }) => rest);
  return {
    type: 'updateState',
    payload: {
      participants: participantList,
      votesRevealed,
      facilitatorId,
    },
  };
}

function assignFacilitator() {
  if (!facilitatorId || !participants[facilitatorId]) {
    const ids = Object.keys(participants);
    if (ids.length > 0) {
      facilitatorId = ids[0];
      if (participants[facilitatorId]) {
        participants[facilitatorId].role = 'Facilitator';
        console.log(`Assigned Facilitator role to: ${participants[facilitatorId].name}`);
      } else {
        facilitatorId = null;
      }
    } else {
      facilitatorId = null;
      console.log('No users left, clearing facilitator.');
    }
  } else if (participants[facilitatorId]) {
    participants[facilitatorId].role = 'Facilitator';
  }
}

// ── 4) Handle WebSocket connections ───────────────────────────────────────
wss.on('connection', (ws) => {

  const userId = uuidv4();
  ws.userId = userId;
  console.log(`Client connected: ${userId}`);

  // Send the client their assigned ID and the current room state
  sendToClient(ws, { type: 'yourId', payload: { id: userId } });
  sendToClient(ws, getRoomState());

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


        if ( !payload || !payload.name || !payload.role || !payload.room) {
          return sendToClient(ws, { type: 'error',payload: { message: 'Login requires name, role, and room.' } });
        }

              // ─── 5.3.1) Extract name, role, and room from payload
        const { name, role, room } = payload;

        // ─── 5.3.2) Store user info on the WebSocket and in participants
        //    (userId was already set at connection time)
        ws.name = name;
        ws.role = role;
        ws.roomName = room;
        participants[userId] = {
          id: userId,
          ws: ws,
          name: name,
          role: role,
          vote: null,
          roomName: room
        };

        // ─── 5.3.3) Add this user to our in‐memory rooms Map
        joinRoom(room, userId);

        // ─── 5.3.4) Build a “userJoined” payload including all users currently in that room
        const joinedPayload = {
          type: 'userJoined',
          payload: {
            userId: userId,
            name: name,
            role: role,
            allUsersInRoom: Array.from(rooms.get(room).users).map((id) => {
              const p = participants[id];
              return { userId: id, name: p.name, role: p.role };
            })
          }
        };

        // ─── 5.3.5) Broadcast that payload to every socket in the same room
          rooms.get(room).users.forEach((id) => {
            const clientSocket = participants[id].ws;
            if (
              clientSocket &&
              clientSocket.readyState === WebSocket.OPEN
            ) {
              sendToClient(clientSocket, joinedPayload);
            }
          });

        console.log(`User logged in: ${payload.name} (${userId}), Role: ${payload.role}`);

          // ─── 5.4.1) Use the existing `room` from payload (no `const room = …`)
          const roomState = getRoomState(room);
          rooms.get(room).users.forEach((id) => {
            const clientSocket = participants[id].ws;
            if (clientSocket.readyState === WebSocket.OPEN) {
              sendToClient(clientSocket, roomState);
            }
          });


        break;

      case 'vote':
        if (!currentUser) return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        if (currentUser.role === 'Observer') {
          return sendToClient(ws, { type: 'error', payload: { message: 'Observers cannot vote.' } });
        }
        if (votesRevealed) {
          return sendToClient(ws, { type: 'error', payload: { message: 'Votes already revealed.' } });
        }
        if (payload && typeof payload.vote !== 'undefined') {
          currentUser.vote = payload.vote;
          console.log(`User ${currentUser.name} voted: ${payload.vote}`);
          broadcast(getRoomState());
        } else {
          sendToClient(ws, { type: 'error', payload: { message: 'Invalid vote payload.' } });
        }
        break;

      case 'revealVotes':
        if (!currentUser) return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        if (currentUser.role !== 'Facilitator') {
          return sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitator can reveal votes.' } });
        }
        votesRevealed = true;
        console.log(`Votes revealed by ${currentUser.name}`);
        broadcast(getRoomState());
        break;

      case 'resetVotes':
        if (!currentUser) return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        if (currentUser.role !== 'Facilitator') {
          return sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitator can reset votes.' } });
        }
        votesRevealed = false;
        Object.values(participants).forEach(p => (p.vote = null));
        console.log(`Votes reset by ${currentUser.name}`);
        broadcast(getRoomState());
        break;

      case 'changeRole':
        if (!currentUser) return sendToClient(ws, { type: 'error', payload: { message: 'Not logged in.' } });
        const { targetUserId, newRole } = payload || {};
        if (!newRole) return sendToClient(ws, { type: 'error', payload: { message: 'Missing new role.' } });
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
          return sendToClient(ws, { type: 'error', payload: { message: 'Only Facilitator can change others’ roles.' } });
        }
        if (newRole === 'Facilitator') {
          if (facilitatorId && facilitatorId !== uid && participants[facilitatorId]) {
            participants[facilitatorId].role = 'Voter';
          }
          facilitatorId = uid;
        } else if (uid === facilitatorId && newRole !== 'Facilitator') {
          facilitatorId = null;
        }
        target.role = newRole;
        console.log(`Role for ${target.name} changed to ${newRole} by ${currentUser.name}`);
        broadcast(getRoomState());
        break;

      case 'logout':
        if (participants[userId]) {
          console.log(`User logged out: ${participants[userId].name} (${userId})`);
          delete participants[userId];
          if (userId === facilitatorId) {
            facilitatorId = null;
            assignFacilitator();
          }
          broadcast(getRoomState());
        }
        break;

      default:
        console.log(`Unknown message type received: ${type}`);
        sendToClient(ws, { type: 'error', payload: { message: `Unknown type: ${type}` } });
    }
  });

  ws.on('close', () => {
    const disc = participants[userId];
    if (disc) {
      console.log(`Client disconnected: ${disc.name} (${userId})`);
      delete participants[userId];
      if (userId === facilitatorId) {
        console.log('Facilitator disconnected. Reassigning...');
        facilitatorId = null;
        assignFacilitator();
      }
      broadcast(getRoomState());
    } else {
      console.log(`Client disconnected (not logged in): ${userId}`);
    }
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for user ${userId}:`, error);
    if (participants[userId]) {
      delete participants[userId];
      if (userId === facilitatorId) {
        facilitatorId = null;
        assignFacilitator();
      }
      broadcast(getRoomState());
    }
  });
});
