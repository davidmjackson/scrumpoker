const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const repoRoot = path.resolve(__dirname, '..');
const testAccessKey = 'test-access-key';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, getLogs) {
  const deadline = Date.now() + 5000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return response.json();
      }
      lastError = new Error(`Health returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not become healthy: ${lastError?.message || 'unknown error'}\n${getLogs()}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function startServer(t, options = {}) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-test-'));
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ baseline: testAccessKey }), 'utf8');

  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SCRUM_POKER_KEYS_FILE: keysFile,
      ...(options.adminKey ? { SCRUM_POKER_ADMIN_KEY: options.adminKey } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  t.after(async () => {
    await stopProcess(child);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  await waitForHealth(port, () => output);
  return { keysFile, port };
}

function waitForMessage(ws, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      ws.off('close', onClose);
    }

    function onMessage(raw) {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch (error) {
        cleanup();
        reject(error);
        return;
      }

      if (predicate(message)) {
        cleanup();
        resolve(message);
      }
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onClose() {
      cleanup();
      reject(new Error('WebSocket closed before expected message'));
    }

    ws.on('message', onMessage);
    ws.on('error', onError);
    ws.on('close', onClose);
  });
}

async function connectClient(t, port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  t.after(() => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  });

  const idMessage = await waitForMessage(
    ws,
    (message) => message.type === 'yourId' && message.payload?.id
  );

  return {
    id: idMessage.payload.id,
    ws
  };
}

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function waitForState(ws, predicate, timeoutMs) {
  return waitForMessage(
    ws,
    (message) => message.type === 'updateState' && predicate(message.payload),
    timeoutMs
  ).then((message) => message.payload);
}

function findParticipant(state, name) {
  return state.participants.find((participant) => participant.name === name);
}

async function login(client, payload) {
  const statePromise = waitForState(
    client.ws,
    (state) => Boolean(findParticipant(state, payload.name))
  );

  send(client.ws, 'login', {
    accessKey: testAccessKey,
    ...payload
  });

  return statePromise;
}

test('health endpoint reports a running app', async (t) => {
  const { port } = await startServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(typeof body.uptime, 'number');
  assert.equal(body.rooms, 0);
});

test('admin page is served without exposing key data', async (t) => {
  const { port } = await startServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/admin`);
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(body, /Team access/);
  assert.doesNotMatch(body, /test-access-key/);
});

test('admin key API requires configured admin authentication', async (t) => {
  const { port } = await startServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/api/admin/keys`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error, 'Admin key management is not configured.');
});

test('admin key API lists, creates, and removes access keys', async (t) => {
  const adminKey = 'admin-test-secret';
  const { port } = await startServer(t, { adminKey });
  const baseUrl = `http://127.0.0.1:${port}/api/admin/keys`;

  const unauthorized = await fetch(baseUrl);
  assert.equal(unauthorized.status, 401);

  const headers = {
    'content-type': 'application/json',
    'x-scrum-poker-admin-key': adminKey
  };

  const initial = await fetch(baseUrl, { headers });
  const initialBody = await initial.json();

  assert.equal(initial.status, 200);
  assert.deepEqual(initialBody.keys, [{ name: 'baseline', value: testAccessKey }]);

  const created = await fetch(baseUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'Gamma Team' })
  });
  const createdBody = await created.json();

  assert.equal(created.status, 201);
  assert.equal(createdBody.key.name, 'Gamma Team');
  assert.match(createdBody.key.value, /^[A-Za-z0-9]{12}$/);

  const afterCreate = await fetch(baseUrl, { headers });
  const afterCreateBody = await afterCreate.json();
  assert.equal(afterCreateBody.keys.length, 2);

  const removed = await fetch(`${baseUrl}/${encodeURIComponent('Gamma Team')}`, {
    method: 'DELETE',
    headers
  });
  const removedBody = await removed.json();

  assert.equal(removed.status, 200);
  assert.equal(removedBody.removed.name, 'Gamma Team');

  const afterRemove = await fetch(baseUrl, { headers });
  const afterRemoveBody = await afterRemove.json();
  assert.deepEqual(afterRemoveBody.keys, [{ name: 'baseline', value: testAccessKey }]);
});

test('WebSocket workflow covers login, voting, reveal, reset, and role limits', async (t) => {
  const { port } = await startServer(t);

  const alice = await connectClient(t, port);
  const aliceInitialState = await login(alice, {
    name: 'Alice',
    role: 'Facilitator',
    room: 'baseline'
  });

  assert.equal(findParticipant(aliceInitialState, 'Alice').role, 'Facilitator');
  assert.equal(aliceInitialState.facilitatorId, alice.id);

  const bob = await connectClient(t, port);
  const aliceSeesBob = waitForState(alice.ws, (state) => Boolean(findParticipant(state, 'Bob')));
  const bobInitialState = await login(bob, {
    name: 'Bob',
    role: 'Voter',
    room: 'baseline'
  });
  await aliceSeesBob;

  assert.equal(findParticipant(bobInitialState, 'Bob').role, 'Voter');
  assert.equal(bobInitialState.participants.length, 2);

  const oscar = await connectClient(t, port);
  await login(oscar, {
    name: 'Oscar',
    role: 'Observer',
    room: 'baseline'
  });

  const observerVoteError = waitForMessage(
    oscar.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Observers cannot vote.'
  );
  send(oscar.ws, 'vote', { vote: '8' });
  await observerVoteError;

  const voterRevealError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Only Facilitator can reveal votes.'
  );
  send(bob.ws, 'revealVotes', {});
  await voterRevealError;

  const aliceSeesBobVote = waitForState(
    alice.ws,
    (state) => findParticipant(state, 'Bob')?.vote === '5' && state.votesRevealed === false
  );
  send(bob.ws, 'vote', { vote: '5' });
  await aliceSeesBobVote;

  const bobSeesReveal = waitForState(
    bob.ws,
    (state) => state.votesRevealed === true && findParticipant(state, 'Bob')?.vote === '5'
  );
  send(alice.ws, 'revealVotes', {});
  await bobSeesReveal;

  const bobSeesReset = waitForState(
    bob.ws,
    (state) => state.votesRevealed === false && state.participants.every((participant) => participant.vote === null)
  );
  send(alice.ws, 'resetVotes', {});
  await bobSeesReset;

  const bobRoleChanged = waitForState(
    bob.ws,
    (state) => findParticipant(state, 'Bob')?.role === 'Observer'
  );
  send(alice.ws, 'changeRole', { targetUserId: bob.id, newRole: 'Observer' });
  await bobRoleChanged;

  const nonFacilitatorRoleError = waitForMessage(
    bob.ws,
    (message) => message.type === 'error' && message.payload?.message.includes('Only Facilitator')
  );
  send(bob.ws, 'changeRole', { targetUserId: alice.id, newRole: 'Voter' });
  await nonFacilitatorRoleError;
});

test('invalid access keys are rejected', async (t) => {
  const { port } = await startServer(t);
  const client = await connectClient(t, port);

  const errorPromise = waitForMessage(
    client.ws,
    (message) => message.type === 'error' && message.payload?.message === 'Invalid access key.'
  );
  send(client.ws, 'login', {
    accessKey: 'not-valid',
    name: 'Mallory',
    role: 'Voter',
    room: 'baseline'
  });

  await errorPromise;
});
