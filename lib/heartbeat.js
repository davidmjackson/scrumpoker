const { touchRoom } = require('./roomState');

// Well under the 60s idle timeout that proxies between the browser and Node
// tend to default to, so a silent discussion never looks like a dead socket.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const OPEN = 1;

function trackSocket(ws) {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  return ws;
}

function responsive(ws) {
  return ws && ws.readyState === OPEN && ws.isAlive !== false;
}

// A room is busy while someone is still connected to it, whether or not anyone
// is voting — otherwise expireRooms deletes rooms out from under a long
// discussion. Sockets that miss two consecutive pings are dropped, so a room
// only stops being touched once its participants are genuinely gone.
function sweepHeartbeat({ sockets, participants, rooms, now = Date.now() }) {
  const keptAlive = new Set();
  for (const participant of Object.values(participants)) {
    if (responsive(participant.ws)) {
      keptAlive.add(participant.roomName);
    }
  }
  for (const roomName of keptAlive) {
    touchRoom(rooms, roomName, now);
  }

  let terminated = 0;
  for (const ws of sockets) {
    if (ws.isAlive === false) {
      terminated += 1;
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }

  return { keptAlive: [...keptAlive], terminated };
}

function startHeartbeat({ wss, participants, rooms, intervalMs = HEARTBEAT_INTERVAL_MS }) {
  const timer = setInterval(() => {
    sweepHeartbeat({ sockets: wss.clients, participants, rooms });
  }, intervalMs);

  if (typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

module.exports = {
  HEARTBEAT_INTERVAL_MS,
  startHeartbeat,
  sweepHeartbeat,
  trackSocket
};
