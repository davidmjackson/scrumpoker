const DEFAULT_ROOM_EXPIRY_MS = 60 * 60 * 1000;

function createRoom(now = Date.now()) {
  return {
    users: new Set(),
    lastActive: now,
    votesRevealed: false,
    facilitatorId: null
  };
}

function joinRoom(rooms, roomName, userId, now = Date.now()) {
  if (!rooms.has(roomName)) {
    rooms.set(roomName, createRoom(now));
  }

  const room = rooms.get(roomName);
  room.users.add(userId);
  room.lastActive = now;
  return room;
}

function leaveRoom(rooms, roomName, userId, now = Date.now()) {
  const room = rooms.get(roomName);
  if (!room) return null;

  room.users.delete(userId);
  room.lastActive = now;

  if (room.users.size === 0) {
    rooms.delete(roomName);
    return null;
  }

  return room;
}

function expireRooms(rooms, now = Date.now(), expiryMs = DEFAULT_ROOM_EXPIRY_MS) {
  const expiredRoomNames = [];

  for (const [roomName, room] of rooms.entries()) {
    if (now - room.lastActive > expiryMs) {
      rooms.delete(roomName);
      expiredRoomNames.push(roomName);
    }
  }

  return expiredRoomNames;
}

function getRoomParticipants(participants, roomName) {
  return Object.values(participants)
    .filter((participant) => participant.roomName === roomName)
    .map(({ ws, ...rest }) => rest);
}

function getRoomState(rooms, participants, roomName) {
  const room = rooms.get(roomName) || {};

  return {
    type: 'updateState',
    payload: {
      participants: getRoomParticipants(participants, roomName),
      votesRevealed: room.votesRevealed || false,
      facilitatorId: room.facilitatorId || null
    }
  };
}

function assignFacilitator(rooms, participants, roomName) {
  const room = rooms.get(roomName);
  if (!room) return null;

  if (!room.facilitatorId || !participants[room.facilitatorId]) {
    const nextFacilitatorId = Array.from(room.users).find((id) => participants[id]);
    if (nextFacilitatorId) {
      room.facilitatorId = nextFacilitatorId;
      participants[nextFacilitatorId].role = 'Facilitator';
    } else {
      room.facilitatorId = null;
    }
  } else {
    participants[room.facilitatorId].role = 'Facilitator';
  }

  return room.facilitatorId;
}

function reassignFacilitatorIfLeaving(rooms, participants, roomName, userId) {
  const room = rooms.get(roomName);
  if (!room) return null;

  if (room.facilitatorId === userId) {
    room.facilitatorId = null;
    assignFacilitator(rooms, participants, roomName);
  }

  return room;
}

module.exports = {
  DEFAULT_ROOM_EXPIRY_MS,
  assignFacilitator,
  createRoom,
  expireRooms,
  getRoomParticipants,
  getRoomState,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving
};
