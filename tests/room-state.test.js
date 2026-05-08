const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ROOM_EXPIRY_MS,
  assignFacilitator,
  expireRooms,
  getRoomParticipants,
  getRoomState,
  joinRoom,
  leaveRoom,
  reassignFacilitatorIfLeaving
} = require('../lib/roomState');

function participant(id, roomName, overrides = {}) {
  return {
    id,
    ws: { socket: id },
    name: id,
    role: 'Voter',
    vote: null,
    roomName,
    ...overrides
  };
}

test('joinRoom creates and updates room membership', () => {
  const rooms = new Map();

  const createdRoom = joinRoom(rooms, 'alpha', 'alice', 100);
  const updatedRoom = joinRoom(rooms, 'alpha', 'bob', 150);

  assert.equal(createdRoom, updatedRoom);
  assert.deepEqual([...updatedRoom.users], ['alice', 'bob']);
  assert.equal(updatedRoom.lastActive, 150);
  assert.equal(updatedRoom.votesRevealed, false);
  assert.equal(updatedRoom.facilitatorId, null);
});

test('leaveRoom updates activity and removes empty rooms', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);

  const roomAfterAliceLeaves = leaveRoom(rooms, 'alpha', 'alice', 200);
  assert.deepEqual([...roomAfterAliceLeaves.users], ['bob']);
  assert.equal(roomAfterAliceLeaves.lastActive, 200);
  assert.equal(rooms.has('alpha'), true);

  const roomAfterBobLeaves = leaveRoom(rooms, 'alpha', 'bob', 300);
  assert.equal(roomAfterBobLeaves, null);
  assert.equal(rooms.has('alpha'), false);
});

test('expireRooms deletes rooms idle beyond the expiry window', () => {
  const rooms = new Map();
  joinRoom(rooms, 'stale', 'alice', 100);
  joinRoom(rooms, 'active', 'bob', 200);

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS + 1);

  assert.deepEqual(expired, ['stale']);
  assert.equal(rooms.has('stale'), false);
  assert.equal(rooms.has('active'), true);
});

test('expireRooms leaves rooms inside the expiry window', () => {
  const rooms = new Map();
  joinRoom(rooms, 'active', 'alice', 100);

  const expired = expireRooms(rooms, 100 + DEFAULT_ROOM_EXPIRY_MS);

  assert.deepEqual(expired, []);
  assert.equal(rooms.has('active'), true);
});

test('getRoomParticipants filters by room and strips sockets', () => {
  const participants = {
    alice: participant('alice', 'alpha', { vote: '5' }),
    bob: participant('bob', 'alpha'),
    oscar: participant('oscar', 'beta')
  };

  assert.deepEqual(getRoomParticipants(participants, 'alpha'), [
    {
      id: 'alice',
      name: 'alice',
      role: 'Voter',
      vote: '5',
      roomName: 'alpha'
    },
    {
      id: 'bob',
      name: 'bob',
      role: 'Voter',
      vote: null,
      roomName: 'alpha'
    }
  ]);
});

test('getRoomState projects room reveal and facilitator state', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  room.votesRevealed = true;
  room.facilitatorId = 'alice';

  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator', vote: '8' })
  };

  assert.deepEqual(getRoomState(rooms, participants, 'alpha'), {
    type: 'updateState',
    payload: {
      participants: [
        {
          id: 'alice',
          name: 'alice',
          role: 'Facilitator',
          vote: '8',
          roomName: 'alpha'
        }
      ],
      votesRevealed: true,
      facilitatorId: 'alice'
    }
  });
});

test('assignFacilitator chooses the first room member when needed', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);

  const participants = {
    alice: participant('alice', 'alpha'),
    bob: participant('bob', 'alpha')
  };

  const facilitatorId = assignFacilitator(rooms, participants, 'alpha');

  assert.equal(facilitatorId, 'alice');
  assert.equal(rooms.get('alpha').facilitatorId, 'alice');
  assert.equal(participants.alice.role, 'Facilitator');
  assert.equal(participants.bob.role, 'Voter');
});

test('reassignFacilitatorIfLeaving promotes the next room member', () => {
  const rooms = new Map();
  const room = joinRoom(rooms, 'alpha', 'alice', 100);
  joinRoom(rooms, 'alpha', 'bob', 100);
  room.facilitatorId = 'alice';

  const participants = {
    alice: participant('alice', 'alpha', { role: 'Facilitator' }),
    bob: participant('bob', 'alpha')
  };

  leaveRoom(rooms, 'alpha', 'alice', 200);
  reassignFacilitatorIfLeaving(rooms, participants, 'alpha', 'alice');

  assert.equal(rooms.get('alpha').facilitatorId, 'bob');
  assert.equal(participants.bob.role, 'Facilitator');
});
