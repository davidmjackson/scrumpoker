const test = require('node:test');
const assert = require('node:assert/strict');

const {
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
  sweepHeartbeat,
  trackSocket
} = require('../lib/heartbeat');
const { DEFAULT_ROOM_EXPIRY_MS, expireRooms, joinRoom } = require('../lib/roomState');

const OPEN = 1;
const CLOSED = 3;

function fakeSocket(readyState = OPEN) {
  return {
    readyState,
    isAlive: true,
    pings: 0,
    terminated: false,
    listeners: {},
    ping() {
      this.pings += 1;
    },
    terminate() {
      this.terminated = true;
      this.readyState = CLOSED;
    },
    on(event, handler) {
      this.listeners[event] = handler;
    }
  };
}

function participant(ws, roomName) {
  return { id: roomName, ws, name: 'u', role: 'Voter', vote: null, roomName };
}

test('trackSocket marks a socket alive and revives it on pong', () => {
  const ws = fakeSocket();
  ws.isAlive = false;

  trackSocket(ws);
  assert.equal(ws.isAlive, true);

  ws.isAlive = false;
  ws.listeners.pong();
  assert.equal(ws.isAlive, true);
});

test('sweepHeartbeat pings open sockets and marks them pending a pong', () => {
  const ws = fakeSocket();

  sweepHeartbeat({ sockets: [ws], participants: {}, rooms: new Map() });

  assert.equal(ws.pings, 1);
  assert.equal(ws.isAlive, false, 'socket awaits a pong before the next sweep');
  assert.equal(ws.terminated, false);
});

test('sweepHeartbeat terminates a socket that missed the previous pong', () => {
  const ws = fakeSocket();
  ws.isAlive = false;

  const result = sweepHeartbeat({ sockets: [ws], participants: {}, rooms: new Map() });

  assert.equal(ws.terminated, true);
  assert.equal(ws.pings, 0, 'a dead socket is not pinged again');
  assert.equal(result.terminated, 1);
});

test('a room with a connected participant survives past the expiry window', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 0);
  const ws = fakeSocket();
  trackSocket(ws);
  const participants = { alice: participant(ws, 'alpha') };

  // Nobody votes for the whole window — only the heartbeat keeps the room alive.
  for (let now = HEARTBEAT_INTERVAL_MS; now <= DEFAULT_ROOM_EXPIRY_MS * 2; now += HEARTBEAT_INTERVAL_MS) {
    sweepHeartbeat({ sockets: [ws], participants, rooms, now });
    ws.listeners.pong();
    assert.deepEqual(expireRooms(rooms, now, DEFAULT_ROOM_EXPIRY_MS, participants), []);
  }

  assert.equal(rooms.has('alpha'), true);
  assert.ok(participants.alice, 'participant is still in the room');
  assert.equal(ws.terminated, false, 'a responsive socket is never terminated');
});

test('sweepHeartbeat reports which rooms it kept alive', () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 0);
  const ws = fakeSocket();

  const result = sweepHeartbeat({
    sockets: [ws],
    participants: { alice: participant(ws, 'alpha') },
    rooms,
    now: 5000
  });

  assert.deepEqual(result.keptAlive, ['alpha']);
  assert.equal(rooms.get('alpha').lastActive, 5000);
});

test('an abandoned room still expires once its sockets are closed', () => {
  const rooms = new Map();
  joinRoom(rooms, 'ghost', 'alice', 0);
  const ws = fakeSocket(CLOSED);
  const participants = { alice: participant(ws, 'ghost') };

  const result = sweepHeartbeat({ sockets: [ws], participants, rooms, now: 1000 });
  assert.deepEqual(result.keptAlive, [], 'a closed socket does not keep a room alive');

  const expired = expireRooms(rooms, DEFAULT_ROOM_EXPIRY_MS + 1, DEFAULT_ROOM_EXPIRY_MS, participants);
  assert.deepEqual(expired, ['ghost']);
  assert.equal(rooms.has('ghost'), false);
});

test('a socket awaiting its pong does not keep a room alive', () => {
  const rooms = new Map();
  joinRoom(rooms, 'stalled', 'alice', 0);
  const ws = fakeSocket();
  ws.isAlive = false;

  const result = sweepHeartbeat({
    sockets: [ws],
    participants: { alice: participant(ws, 'stalled') },
    rooms,
    now: 1000
  });

  assert.deepEqual(result.keptAlive, []);
  assert.equal(rooms.get('stalled').lastActive, 0);
});

test('startHeartbeat sweeps on the interval until stopped', async () => {
  const rooms = new Map();
  joinRoom(rooms, 'alpha', 'alice', 0);
  const ws = fakeSocket();
  const wss = { clients: new Set([ws]) };

  const stop = startHeartbeat({
    wss,
    participants: { alice: participant(ws, 'alpha') },
    rooms,
    intervalMs: 5
  });

  await new Promise((resolve) => setTimeout(resolve, 30));
  stop();
  const pingsAtStop = ws.pings;

  assert.ok(pingsAtStop > 0, 'heartbeat pinged at least once');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(ws.pings, pingsAtStop, 'no sweeps after stop');
});

test('the heartbeat interval is well inside a proxy idle timeout', () => {
  assert.ok(HEARTBEAT_INTERVAL_MS <= 30_000, 'must beat a 60s proxy idle timeout with room to spare');
});
