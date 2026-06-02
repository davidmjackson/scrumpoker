const test = require('node:test');
const assert = require('node:assert/strict');

const {
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleStartNextRound,
  handleVote
} = require('../lib/wsHandlers');
const { joinRoom } = require('../lib/roomState');
const { ROLES } = require('../lib/roles');

function createHarness(t) {
  const rooms = new Map();
  const participants = {};
  const clientMessages = [];
  const roomMessages = [];
  const roomStates = [];

  return {
    clientMessages,
    participants,
    rooms,
    roomMessages,
    roomStates,
    sendRoomState: (roomName) => roomStates.push(roomName),
    sendToClient: (ws, message) => clientMessages.push({ userId: ws.userId, message }),
    sendToRoom: (roomName, message) => roomMessages.push({ roomName, message })
  };
}

function loginPayload(overrides = {}) {
  return { name: 'Alice', role: ROLES.FACILITATOR, room: 'planning', ...overrides };
}

function wsWith(userId, company = { id: 'co1', name: 'Acme' }) {
  return { userId, authed: true, company, teams: [] };
}

function participant(id, roomName, overrides = {}) {
  return {
    id,
    ws: { userId: id },
    name: id,
    role: ROLES.VOTER,
    vote: null,
    roomName,
    ...overrides
  };
}

test('handleLogin rejects missing fields and no-company authed session', (t) => {
  const harness = createHarness(t);

  // Missing name — should error immediately
  handleLogin({
    ...harness,
    ws: wsWith('alice'),
    userId: 'alice',
    payload: {}
  });

  // Authed but company is null — must error
  handleLogin({
    ...harness,
    ws: { userId: 'alice', authed: true, company: null, teams: [] },
    userId: 'alice',
    payload: loginPayload()
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Login requires a name.',
    'No company on your session — re-launch poker from the hub.'
  ]);
});

test('handleLogin creates participants and downgrades duplicate facilitator requests', (t) => {
  const harness = createHarness(t);

  handleLogin({
    ...harness,
    ws: wsWith('alice'),
    userId: 'alice',
    payload: loginPayload({ name: 'Alice', role: ROLES.FACILITATOR })
  });

  handleLogin({
    ...harness,
    ws: wsWith('bob'),
    userId: 'bob',
    payload: loginPayload({ name: 'Bob', role: ROLES.FACILITATOR })
  });

  const roomName = 'co1-planning';
  assert.equal(harness.rooms.get(roomName).facilitatorId, 'alice');
  assert.equal(harness.participants.alice.role, ROLES.FACILITATOR);
  assert.equal(harness.participants.bob.role, ROLES.VOTER);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
});

test('handleVote enforces observer and revealed-vote restrictions', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  joinRoom(harness.rooms, roomName, 'alice', 100);
  const observer = participant('alice', roomName, { role: ROLES.OBSERVER });
  const voter = participant('bob', roomName);

  handleVote({
    ...harness,
    ws: observer.ws,
    currentUser: observer,
    payload: { vote: '5' }
  });

  handleVote({
    ...harness,
    ws: voter.ws,
    currentUser: voter,
    payload: { vote: '8' }
  });

  harness.rooms.get(roomName).votesRevealed = true;
  handleVote({
    ...harness,
    ws: voter.ws,
    currentUser: voter,
    payload: { vote: '13' }
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Observers cannot vote.',
    'Votes already revealed.'
  ]);
  assert.equal(voter.vote, '8');
  assert.deepEqual(harness.roomStates, [roomName]);
});

test('handleVote rejects values outside the voting deck', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  joinRoom(harness.rooms, roomName, 'bob', 100);
  const voter = participant('bob', roomName);

  handleVote({ ...harness, ws: voter.ws, currentUser: voter, payload: { vote: '999' } });
  handleVote({ ...harness, ws: voter.ws, currentUser: voter, payload: { vote: 8 } });
  handleVote({ ...harness, ws: voter.ws, currentUser: voter, payload: { vote: '?' } });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Invalid vote value.',
    'Invalid vote value.'
  ]);
  assert.equal(voter.vote, '?');
  assert.deepEqual(harness.roomStates, [roomName]);
});

test('handleRevealVotes and handleResetVotes update room state', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  const facilitator = participant('alice', roomName, { role: ROLES.FACILITATOR });
  const voter = participant('bob', roomName, { vote: '8' });
  harness.participants.alice = facilitator;
  harness.participants.bob = voter;

  handleRevealVotes({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  assert.equal(room.votesRevealed, true);

  handleResetVotes({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  assert.equal(room.votesRevealed, false);
  assert.equal(voter.vote, null);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
});

test('handleStartNextRound opens the next round after reveal', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  const facilitator = participant('alice', roomName, { role: ROLES.FACILITATOR, vote: '8' });
  const voter = participant('bob', roomName, { vote: '5' });
  harness.participants.alice = facilitator;
  harness.participants.bob = voter;

  handleStartNextRound({
    ...harness,
    ws: voter.ws,
    currentUser: voter
  });

  handleStartNextRound({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  handleRevealVotes({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  handleStartNextRound({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Only Facilitator can start the next round.',
    'Reveal votes before starting the next round.'
  ]);
  assert.equal(room.votesRevealed, false);
  assert.equal(facilitator.vote, null);
  assert.equal(voter.vote, null);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
});

test('handleChangeRole enforces facilitator-only changes to other users', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  joinRoom(harness.rooms, roomName, 'bob', 100);
  room.facilitatorId = 'alice';
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR });
  harness.participants.bob = participant('bob', roomName);

  handleChangeRole({
    ...harness,
    ws: harness.participants.bob.ws,
    currentUser: harness.participants.bob,
    payload: { targetUserId: 'alice', newRole: ROLES.VOTER }
  });

  handleChangeRole({
    ...harness,
    ws: harness.participants.alice.ws,
    currentUser: harness.participants.alice,
    payload: { targetUserId: 'bob', newRole: ROLES.FACILITATOR }
  });

  assert.equal(harness.clientMessages[0].message.payload.message, 'Only Facilitator can change others’ roles.');
  assert.equal(harness.participants.alice.role, ROLES.VOTER);
  assert.equal(harness.participants.bob.role, ROLES.FACILITATOR);
  assert.equal(room.facilitatorId, 'bob');
  assert.deepEqual(harness.roomStates, [roomName]);
});

test('handleChangeRole hands the facilitator role on when one steps down', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  joinRoom(harness.rooms, roomName, 'bob', 100);
  room.facilitatorId = 'alice';
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR });
  harness.participants.bob = participant('bob', roomName);

  handleChangeRole({
    ...harness,
    ws: harness.participants.alice.ws,
    currentUser: harness.participants.alice,
    payload: { targetUserId: 'alice', newRole: ROLES.VOTER }
  });

  assert.equal(harness.participants.alice.role, ROLES.VOTER);
  assert.equal(harness.participants.bob.role, ROLES.FACILITATOR);
  assert.equal(room.facilitatorId, 'bob');
  assert.deepEqual(harness.roomStates, [roomName]);
});

test('handleChangeRole blocks the only facilitator from stepping down', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  room.facilitatorId = 'alice';
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR });

  handleChangeRole({
    ...harness,
    ws: harness.participants.alice.ws,
    currentUser: harness.participants.alice,
    payload: { targetUserId: 'alice', newRole: ROLES.OBSERVER }
  });

  assert.equal(
    harness.clientMessages[0].message.payload.message,
    'Assign another facilitator before leaving the facilitator role.'
  );
  assert.equal(harness.participants.alice.role, ROLES.FACILITATOR);
  assert.equal(room.facilitatorId, 'alice');
  assert.deepEqual(harness.roomStates, []);
});

test('handleEndSession clears a room after notifying participants', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  joinRoom(harness.rooms, roomName, 'bob', 100);
  room.facilitatorId = 'alice';
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR });
  harness.participants.bob = participant('bob', roomName);

  handleEndSession({
    ...harness,
    ws: harness.participants.bob.ws,
    currentUser: harness.participants.bob
  });

  assert.equal(harness.clientMessages[0].message.payload.message, 'Only Facilitator can end the session.');
  assert.equal(harness.rooms.has(roomName), true);

  handleEndSession({
    ...harness,
    ws: harness.participants.alice.ws,
    currentUser: harness.participants.alice
  });

  assert.deepEqual(harness.roomMessages.at(-1), {
    roomName,
    message: {
      type: 'sessionEnded',
      payload: {
        message: 'Session ended by facilitator.'
      }
    }
  });
  assert.equal(harness.participants.alice, undefined);
  assert.equal(harness.participants.bob, undefined);
  assert.equal(harness.rooms.has(roomName), false);
});

test('handleParticipantExit removes participants and reassigns facilitator', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  joinRoom(harness.rooms, roomName, 'bob', 100);
  room.facilitatorId = 'alice';
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR, authed: true });
  harness.participants.bob = participant('bob', roomName, { authed: true });

  handleParticipantExit({
    ...harness,
    userId: 'alice'
  });

  assert.equal(harness.participants.alice, undefined);
  assert.equal(harness.participants.bob.role, ROLES.FACILITATOR);
  assert.equal(room.facilitatorId, 'bob');
  assert.deepEqual(harness.roomStates, [roomName]);
});

test('handleLogin joins a room namespaced by company id', (t) => {
  const h = createHarness(t);
  const ws = wsWith('u1');
  handleLogin({ ws, userId: 'u1', payload: loginPayload(), rooms: h.rooms, participants: h.participants, sendToClient: h.sendToClient, sendRoomState: h.sendRoomState });
  assert.ok(h.participants['u1']);
  assert.equal(h.participants['u1'].roomName, 'co1-planning');
  assert.deepEqual(h.roomStates, ['co1-planning']);
});

test('handleLogin rejects authed login missing role', (t) => {
  const h = createHarness(t);
  const ws = wsWith('u1');
  handleLogin({ ws, userId: 'u1', payload: loginPayload({ role: undefined }), rooms: h.rooms, participants: h.participants, sendToClient: h.sendToClient, sendRoomState: h.sendRoomState });
  assert.equal(h.participants['u1'], undefined);
  assert.equal(h.clientMessages.at(-1).message.payload.message, 'Login requires name, role and room.');
});

test('handleLogin rejects authed login with invalid role', (t) => {
  const h = createHarness(t);
  const ws = wsWith('u1');
  handleLogin({ ws, userId: 'u1', payload: loginPayload({ role: 'Overlord' }), rooms: h.rooms, participants: h.participants, sendToClient: h.sendToClient, sendRoomState: h.sendRoomState });
  assert.equal(h.participants['u1'], undefined);
  assert.equal(h.clientMessages.at(-1).message.payload.message, 'Invalid role.');
});

test('authed login is company-scoped and ignores teamId', (t) => {
  const harness = createHarness(t);
  const ws = { userId: 'alice', authed: true, company: { id: 'co1', name: 'Acme' }, teams: [] };
  handleLogin({ ws, userId: 'alice', payload: { name: 'Alice', role: ROLES.FACILITATOR, room: 'planning' }, rooms: harness.rooms, participants: harness.participants, sendToClient: harness.sendToClient, sendRoomState: harness.sendRoomState });
  assert.ok(harness.rooms.has('co1-planning'));
  assert.equal(harness.participants.alice.authed, true);
  assert.equal(harness.participants.alice.role, ROLES.FACILITATOR);
});

test('anonymous login forces Voter, ignores requested role/room, binds to ws.anonRoom', (t) => {
  const harness = createHarness(t);
  harness.rooms.set('co1-planning', { users: new Set(), lastActive: Date.now(), votesRevealed: false, facilitatorId: null, shareToken: 'tok' });
  const ws = { userId: 'bob', authed: false, anonRoom: 'co1-planning' };
  handleLogin({ ws, userId: 'bob', payload: { name: 'Bob', role: ROLES.FACILITATOR, room: 'evil-room' }, rooms: harness.rooms, participants: harness.participants, sendToClient: harness.sendToClient, sendRoomState: harness.sendRoomState });
  assert.equal(harness.participants.bob.roomName, 'co1-planning');
  assert.equal(harness.participants.bob.role, ROLES.VOTER);
  assert.equal(harness.participants.bob.authed, false);
  assert.notEqual(harness.rooms.get('co1-planning').facilitatorId, 'bob');
});

test('authed login with no company errors', (t) => {
  const harness = createHarness(t);
  const ws = { userId: 'c', authed: true, company: null, teams: [] };
  handleLogin({ ws, userId: 'c', payload: { name: 'C', role: ROLES.VOTER, room: 'r' }, rooms: harness.rooms, participants: harness.participants, sendToClient: harness.sendToClient, sendRoomState: harness.sendRoomState });
  assert.equal(harness.participants.c, undefined);
  assert.match(harness.clientMessages.at(-1).message.payload.message, /company/i);
});

test('anonymous login to a missing room errors (closed/invalid link)', (t) => {
  const harness = createHarness(t);
  const ws = { userId: 'd', authed: false, anonRoom: 'gone-room' };
  handleLogin({ ws, userId: 'd', payload: { name: 'D' }, rooms: harness.rooms, participants: harness.participants, sendToClient: harness.sendToClient, sendRoomState: harness.sendRoomState });
  assert.equal(harness.participants.d, undefined);
  assert.match(harness.clientMessages.at(-1).message.payload.message, /closed|invalid/i);
});
