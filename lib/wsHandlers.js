const {
  getInternalRoomName,
  isValidAccessKey,
  loadKeys
} = require('./accessKeys');
const {
  assignFacilitator,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving
} = require('./roomState');
const {
  ROLES,
  canChangeRole,
  canResetVotes,
  canRevealVotes,
  canVote,
  getAssignedLoginRole,
  isFacilitator,
  isValidRole
} = require('./roles');

function sendError(sendToClient, ws, message) {
  sendToClient(ws, { type: 'error', payload: { message } });
}

function handleLogin({
  ws,
  userId,
  payload,
  rooms,
  participants,
  keysFile,
  sendToClient,
  sendToRoom,
  sendRoomState,
  onKeyLoadError = () => {}
}) {
  if (
    !payload ||
    !payload.name ||
    !payload.role ||
    !payload.room ||
    !payload.accessKey
  ) {
    return sendError(sendToClient, ws, 'Login requires key, name, role, and room.');
  }

  const { name, role, room, accessKey } = payload;
  if (!isValidRole(role)) {
    return sendError(sendToClient, ws, 'Invalid role.');
  }

  const internalRoom = getInternalRoomName(room, accessKey);
  const allKeys = loadKeys(keysFile, onKeyLoadError);

  if (!isValidAccessKey(allKeys, accessKey)) {
    return sendError(sendToClient, ws, 'Invalid access key.');
  }

  ws.name = name;
  ws.role = role;
  ws.roomName = internalRoom;
  joinRoom(rooms, internalRoom, userId);

  const roomForLogin = rooms.get(internalRoom);
  const assignedRole = getAssignedLoginRole(role, roomForLogin.facilitatorId);
  if (isFacilitator(assignedRole)) {
    roomForLogin.facilitatorId = userId;
  }

  participants[userId] = {
    id: userId,
    ws,
    name,
    role: assignedRole,
    vote: null,
    roomName: internalRoom
  };

  assignFacilitator(rooms, participants, internalRoom);
  sendRoomState(internalRoom);

  sendToRoom(internalRoom, {
    type: 'userJoined',
    payload: {
      userId,
      name,
      role: assignedRole,
      allUsersInRoom: Array.from(rooms.get(internalRoom).users).map((id) => {
        const participant = participants[id];
        return { userId: id, name: participant.name, role: participant.role };
      })
    }
  });
}

function handleVote({ ws, currentUser, payload, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canVote(currentUser.role)) {
    return sendError(sendToClient, ws, 'Observers cannot vote.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName) || {};
  if (room.votesRevealed) {
    return sendError(sendToClient, ws, 'Votes already revealed.');
  }

  if (payload && typeof payload.vote !== 'undefined') {
    currentUser.vote = payload.vote;
    sendRoomState(roomName);
  } else {
    sendError(sendToClient, ws, 'Invalid vote payload.');
  }
}

function handleRevealVotes({ ws, currentUser, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canRevealVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can reveal votes.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (room) {
    room.votesRevealed = true;
  }
  sendRoomState(roomName);
}

function resetParticipantVotes(participants, roomName) {
  Object.values(participants)
    .filter((participant) => participant.roomName === roomName)
    .forEach((participant) => {
      participant.vote = null;
    });
}

function handleStartNextRound({ ws, currentUser, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can start the next round.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }
  if (!room.votesRevealed) {
    return sendError(sendToClient, ws, 'Reveal votes before starting the next round.');
  }

  room.votesRevealed = false;
  resetParticipantVotes(participants, roomName);
  sendRoomState(roomName);
}

function handleResetVotes({ ws, currentUser, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can reset votes.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (room) {
    room.votesRevealed = false;
  }

  resetParticipantVotes(participants, roomName);

  sendRoomState(roomName);
}

function handleEndSession({ ws, currentUser, participants, rooms, sendToClient, sendToRoom }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }
  if (!canResetVotes(currentUser.role)) {
    return sendError(sendToClient, ws, 'Only Facilitator can end the session.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }

  sendToRoom(roomName, {
    type: 'sessionEnded',
    payload: {
      message: 'Session ended by facilitator.'
    }
  });

  Object.keys(participants).forEach((userId) => {
    if (participants[userId].roomName === roomName) {
      delete participants[userId];
    }
  });
  rooms.delete(roomName);
}

function handleChangeRole({ ws, currentUser, payload, participants, rooms, sendToClient, sendRoomState }) {
  if (!currentUser) {
    return sendError(sendToClient, ws, 'Not logged in.');
  }

  const { targetUserId, newRole } = payload || {};
  if (!newRole) {
    return sendError(sendToClient, ws, 'Missing new role.');
  }
  if (!isValidRole(newRole)) {
    return sendError(sendToClient, ws, 'Invalid role.');
  }

  const uid = targetUserId || currentUser.id;
  const target = participants[uid];
  if (!target) {
    return sendError(sendToClient, ws, 'User not found.');
  }
  if (!canChangeRole(currentUser.role, currentUser.id, uid)) {
    return sendError(sendToClient, ws, 'Only Facilitator can change others’ roles.');
  }

  const roomName = currentUser.roomName;
  const room = rooms.get(roomName);
  if (!room) {
    return sendError(sendToClient, ws, 'Room not found.');
  }
  if (target.roomName !== roomName) {
    return sendError(sendToClient, ws, 'Target user is not in your room.');
  }

  if (isFacilitator(newRole)) {
    if (room.facilitatorId && room.facilitatorId !== uid) {
      participants[room.facilitatorId].role = ROLES.VOTER;
    }
    room.facilitatorId = uid;
  } else if (uid === room.facilitatorId) {
    room.facilitatorId = null;
  }

  target.role = newRole;
  sendRoomState(roomName);
}

function handleParticipantExit({ userId, participants, rooms, sendRoomState }) {
  const participant = participants[userId];
  if (!participant) return null;

  const roomName = participant.roomName;
  leaveRoom(rooms, roomName, userId);
  const room = reassignFacilitatorIfLeaving(rooms, participants, roomName, userId);

  delete participants[userId];

  if (room) {
    sendRoomState(roomName);
  }

  return room;
}

module.exports = {
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleStartNextRound,
  handleVote
};
