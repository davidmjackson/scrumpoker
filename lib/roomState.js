const { ROLES } = require('./roles');

const DEFAULT_ROOM_EXPIRY_MS = 60 * 60 * 1000;
const MAX_ROUND_HISTORY = 20;

function createRoom(now = Date.now()) {
  return {
    users: new Set(),
    lastActive: now,
    votesRevealed: false,
    facilitatorId: null,
    currentItem: '',
    roundHistory: []
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
      facilitatorId: room.facilitatorId || null,
      currentItem: room.currentItem || '',
      roundHistory: Array.isArray(room.roundHistory) ? room.roundHistory : []
    }
  };
}

function buildVoteGroups(votes) {
  const groups = new Map();

  votes.forEach(({ name, vote }) => {
    if (!groups.has(vote)) {
      groups.set(vote, []);
    }
    groups.get(vote).push(name);
  });

  return Array.from(groups.entries())
    .map(([vote, names]) => ({ vote, names: names.sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => {
      const aNumber = Number(a.vote);
      const bNumber = Number(b.vote);
      const aIsNumber = Number.isFinite(aNumber);
      const bIsNumber = Number.isFinite(bNumber);

      if (aIsNumber && bIsNumber) return bNumber - aNumber;
      if (aIsNumber) return -1;
      if (bIsNumber) return 1;
      return String(a.vote).localeCompare(String(b.vote));
    });
}

function createRoundHistoryEntry(room, participants, roomName, now = Date.now()) {
  const votes = getRoomParticipants(participants, roomName)
    .filter((participant) =>
      [ROLES.VOTER, ROLES.FACILITATOR].includes(participant.role) &&
      participant.vote !== null &&
      typeof participant.vote !== 'undefined'
    )
    .map(({ name, role, vote }) => ({ name, role, vote: String(vote) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const numericVotes = votes
    .map(({ vote }) => Number(vote))
    .filter((vote) => Number.isFinite(vote));
  const average = numericVotes.length > 0
    ? (numericVotes.reduce((sum, vote) => sum + vote, 0) / numericVotes.length).toFixed(1)
    : null;

  return {
    id: `${now}-${room.roundHistory.length + 1}`,
    title: room.currentItem || 'Untitled item',
    revealedAt: new Date(now).toISOString(),
    average,
    voteCount: votes.length,
    votes,
    groups: buildVoteGroups(votes)
  };
}

function recordRoundHistory(room, participants, roomName, now = Date.now()) {
  if (!room || !Array.isArray(room.roundHistory)) return null;

  const entry = createRoundHistoryEntry(room, participants, roomName, now);
  room.roundHistory = [entry, ...room.roundHistory].slice(0, MAX_ROUND_HISTORY);
  return entry;
}

function setCurrentItem(room, itemTitle) {
  if (!room) return null;

  room.currentItem = String(itemTitle || '').trim();
  return room.currentItem;
}

function assignFacilitator(rooms, participants, roomName) {
  const room = rooms.get(roomName);
  if (!room) return null;

  if (!room.facilitatorId || !participants[room.facilitatorId]) {
    const nextFacilitatorId = Array.from(room.users).find((id) => participants[id]);
    if (nextFacilitatorId) {
      room.facilitatorId = nextFacilitatorId;
      participants[nextFacilitatorId].role = ROLES.FACILITATOR;
    } else {
      room.facilitatorId = null;
    }
  } else {
    participants[room.facilitatorId].role = ROLES.FACILITATOR;
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
  MAX_ROUND_HISTORY,
  assignFacilitator,
  createRoom,
  expireRooms,
  getRoomParticipants,
  getRoomState,
  joinRoom,
  leaveRoom,
  recordRoundHistory,
  reassignFacilitatorIfLeaving,
  setCurrentItem
};
