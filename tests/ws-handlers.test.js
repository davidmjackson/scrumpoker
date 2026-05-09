const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  handleChangeRole,
  handleEndSession,
  handleLogin,
  handleParticipantExit,
  handleResetVotes,
  handleRevealVotes,
  handleSetRoundItem,
  handleStartNextItem,
  handleVote
} = require('../lib/wsHandlers');
const { joinRoom } = require('../lib/roomState');
const { ROLES } = require('../lib/roles');

const testAccessKey = 'handler-key';

function withTempKeysFile(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-handlers-test-'));
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ team: testAccessKey }), 'utf8');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  return keysFile;
}

function createHarness(t) {
  const keysFile = withTempKeysFile(t);
  const rooms = new Map();
  const participants = {};
  const clientMessages = [];
  const roomMessages = [];
  const roomStates = [];

  return {
    clientMessages,
    keysFile,
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
  return {
    accessKey: testAccessKey,
    name: 'Alice',
    role: ROLES.FACILITATOR,
    room: 'planning',
    ...overrides
  };
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

test('handleLogin rejects missing fields and invalid access keys', (t) => {
  const harness = createHarness(t);
  const ws = { userId: 'alice' };

  handleLogin({
    ...harness,
    ws,
    userId: 'alice',
    payload: {},
    onKeyLoadError: () => {}
  });

  handleLogin({
    ...harness,
    ws,
    userId: 'alice',
    payload: loginPayload({ accessKey: 'bad-key' }),
    onKeyLoadError: () => {}
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Login requires key, name, role, and room.',
    'Invalid access key.'
  ]);
});

test('handleLogin creates participants and downgrades duplicate facilitator requests', (t) => {
  const harness = createHarness(t);

  handleLogin({
    ...harness,
    ws: { userId: 'alice' },
    userId: 'alice',
    payload: loginPayload({ name: 'Alice', role: ROLES.FACILITATOR }),
    onKeyLoadError: () => {}
  });

  handleLogin({
    ...harness,
    ws: { userId: 'bob' },
    userId: 'bob',
    payload: loginPayload({ name: 'Bob', role: ROLES.FACILITATOR }),
    onKeyLoadError: () => {}
  });

  const roomName = `planning-${testAccessKey}`;
  assert.equal(harness.rooms.get(roomName).facilitatorId, 'alice');
  assert.equal(harness.participants.alice.role, ROLES.FACILITATOR);
  assert.equal(harness.participants.bob.role, ROLES.VOTER);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
  assert.equal(harness.roomMessages.at(-1).message.payload.role, ROLES.VOTER);
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

test('handleRevealVotes and handleResetVotes update room state', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  room.currentItem = 'Checkout flow';
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
  assert.equal(room.roundHistory.length, 1);
  assert.equal(room.roundHistory[0].title, 'Checkout flow');
  assert.equal(room.roundHistory[0].average, '8.0');

  handleResetVotes({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  assert.equal(room.votesRevealed, false);
  assert.equal(voter.vote, null);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
});

test('handleStartNextItem clears the item and votes while preserving history', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  room.currentItem = 'Checkout flow';
  const facilitator = participant('alice', roomName, { role: ROLES.FACILITATOR, vote: '8' });
  const voter = participant('bob', roomName, { vote: '5' });
  harness.participants.alice = facilitator;
  harness.participants.bob = voter;

  handleStartNextItem({
    ...harness,
    ws: voter.ws,
    currentUser: voter
  });

  handleStartNextItem({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  handleRevealVotes({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  handleStartNextItem({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Only Facilitator can start the next item.',
    'Reveal votes before starting the next item.'
  ]);
  assert.equal(room.votesRevealed, false);
  assert.equal(room.currentItem, '');
  assert.equal(room.roundHistory.length, 1);
  assert.equal(room.roundHistory[0].title, 'Checkout flow');
  assert.equal(facilitator.vote, null);
  assert.equal(voter.vote, null);
  assert.deepEqual(harness.roomStates, [roomName, roomName]);
});

test('handleSetRoundItem enforces facilitator ownership and reveal lock', (t) => {
  const harness = createHarness(t);
  const roomName = 'planning-key';
  const room = joinRoom(harness.rooms, roomName, 'alice', 100);
  const facilitator = participant('alice', roomName, { role: ROLES.FACILITATOR });
  const voter = participant('bob', roomName);
  harness.participants.alice = facilitator;
  harness.participants.bob = voter;

  handleSetRoundItem({
    ...harness,
    ws: voter.ws,
    currentUser: voter,
    payload: { itemTitle: 'Checkout flow' }
  });

  handleSetRoundItem({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator,
    payload: { itemTitle: '  Checkout flow  ' }
  });

  room.votesRevealed = true;
  handleSetRoundItem({
    ...harness,
    ws: facilitator.ws,
    currentUser: facilitator,
    payload: { itemTitle: 'Next item' }
  });

  assert.deepEqual(harness.clientMessages.map(({ message }) => message.payload.message), [
    'Only Facilitator can set the current item.',
    'Reset votes before changing the current item.'
  ]);
  assert.equal(room.currentItem, 'Checkout flow');
  assert.deepEqual(harness.roomStates, [roomName]);
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
  harness.participants.alice = participant('alice', roomName, { role: ROLES.FACILITATOR });
  harness.participants.bob = participant('bob', roomName);

  handleParticipantExit({
    ...harness,
    userId: 'alice'
  });

  assert.equal(harness.participants.alice, undefined);
  assert.equal(harness.participants.bob.role, ROLES.FACILITATOR);
  assert.equal(room.facilitatorId, 'bob');
  assert.deepEqual(harness.roomStates, [roomName]);
});
