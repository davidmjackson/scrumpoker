const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createAccessKey,
  generateAccessKey,
  getInternalRoomName,
  getKeysFilePath,
  hashAccessKey,
  isAdminKeyAuthorized,
  isValidAccessKey,
  listAccessKeys,
  loadKeys,
  migrateKeysFile,
  removeAccessKey,
  rotateAccessKey,
  updateAccessKeyStatus
} = require('../lib/accessKeys');

function withTempDir(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-keys-test-'));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  return tempDir;
}

function keysPath(t) {
  return path.join(withTempDir(t), 'keys.json');
}

function readStore(keysFile) {
  return JSON.parse(fs.readFileSync(keysFile, 'utf8'));
}

test('getKeysFilePath defaults to keys.json in the given base directory', () => {
  assert.equal(
    getKeysFilePath('/srv/scrumpoker', {}),
    path.join('/srv/scrumpoker', 'keys.json')
  );
});

test('getKeysFilePath honors SCRUM_POKER_KEYS_FILE', () => {
  assert.equal(
    getKeysFilePath('/srv/scrumpoker', { SCRUM_POKER_KEYS_FILE: '/tmp/custom-keys.json' }),
    '/tmp/custom-keys.json'
  );
});

test('generateAccessKey creates 12-character alphanumeric values', () => {
  const key = generateAccessKey();
  assert.equal(key.length, 12);
  assert.match(key, /^[A-Za-z0-9]+$/);
});

test('hashAccessKey is deterministic per salt and salt-dependent', () => {
  assert.equal(hashAccessKey('key-value', 'salt-a'), hashAccessKey('key-value', 'salt-a'));
  assert.notEqual(hashAccessKey('key-value', 'salt-a'), hashAccessKey('key-value', 'salt-b'));
  assert.match(hashAccessKey('key-value', 'salt-a'), /^[0-9a-f]{64}$/);
});

test('createAccessKey stores a salted hash, never the raw value', (t) => {
  const keysFile = keysPath(t);

  const created = createAccessKey(keysFile, 'Alpha Team');

  assert.equal(created.name, 'Alpha Team');
  assert.equal(created.value.length, 12);
  assert.equal(created.fingerprint.length, 12);

  const stored = readStore(keysFile)['Alpha Team'];
  assert.equal(typeof stored.hash, 'string');
  assert.equal(typeof stored.salt, 'string');
  assert.equal(stored.value, undefined);
  assert.doesNotMatch(fs.readFileSync(keysFile, 'utf8'), new RegExp(created.value));

  assert.equal(isValidAccessKey(loadKeys(keysFile), created.value), true);
  assert.equal(isValidAccessKey(loadKeys(keysFile), 'wrong-key-value'), false);
});

test('createAccessKey rejects short values and duplicate names', (t) => {
  const keysFile = keysPath(t);

  assert.throws(() => createAccessKey(keysFile, 'Short', 'tiny'), /at least 12 characters/);

  createAccessKey(keysFile, 'Alpha Team');
  assert.throws(() => createAccessKey(keysFile, 'Alpha Team'), /already exists/);
});

test('createAccessKey records a creation timestamp', (t) => {
  const keysFile = keysPath(t);
  const now = new Date('2026-05-20T10:00:00.000Z');

  const created = createAccessKey(keysFile, 'Timed Team', generateAccessKey(), now);

  assert.equal(created.createdAt, '2026-05-20T10:00:00.000Z');
  assert.equal(listAccessKeys(keysFile)[0].createdAt, '2026-05-20T10:00:00.000Z');
});

test('isValidAccessKey verifies a legacy plaintext keys file', (t) => {
  const keysFile = keysPath(t);
  fs.writeFileSync(keysFile, JSON.stringify({
    team: 'legacy-plaintext-key',
    off: { value: 'inactive-key-value', active: false }
  }), 'utf8');

  const keys = loadKeys(keysFile);
  assert.equal(isValidAccessKey(keys, 'legacy-plaintext-key'), true);
  assert.equal(isValidAccessKey(keys, 'inactive-key-value'), false);
  assert.equal(isValidAccessKey(keys, 'no-such-key'), false);
  assert.equal(isValidAccessKey(keys, null), false);
});

test('isValidAccessKey verifies a hashed key and rejects suspended keys', (t) => {
  const keysFile = keysPath(t);
  const created = createAccessKey(keysFile, 'Hashed Team');

  assert.equal(isValidAccessKey(loadKeys(keysFile), created.value), true);

  updateAccessKeyStatus(keysFile, 'Hashed Team', false);
  assert.equal(isValidAccessKey(loadKeys(keysFile), created.value), false);
});

test('migrateKeysFile converts a plaintext keys file to hashed storage', (t) => {
  const keysFile = keysPath(t);
  fs.writeFileSync(keysFile, JSON.stringify({
    alpha: 'alpha-plaintext-key',
    beta: { value: 'beta-plaintext-key', active: false }
  }), 'utf8');

  assert.deepEqual(migrateKeysFile(keysFile), { migrated: 2, total: 2 });

  const stored = readStore(keysFile);
  assert.equal(typeof stored.alpha.hash, 'string');
  assert.equal(stored.alpha.value, undefined);
  assert.equal(typeof stored.beta.hash, 'string');
  assert.doesNotMatch(fs.readFileSync(keysFile, 'utf8'), /plaintext-key/);

  assert.equal(isValidAccessKey(loadKeys(keysFile), 'alpha-plaintext-key'), true);

  // Re-running is a no-op once everything is hashed.
  assert.deepEqual(migrateKeysFile(keysFile), { migrated: 0, total: 2 });
});

test('listAccessKeys omits values and flags weak keys', (t) => {
  const keysFile = keysPath(t);
  fs.writeFileSync(keysFile, JSON.stringify({
    weakly: 'ABiMWb',
    strong: 'StrongKey123456'
  }), 'utf8');

  const listed = listAccessKeys(keysFile);
  assert.deepEqual(listed.map((key) => key.name), ['strong', 'weakly']);
  assert.equal(listed.every((key) => key.value === undefined), true);
  assert.equal(listed.find((key) => key.name === 'weakly').weak, true);
  assert.equal(listed.find((key) => key.name === 'strong').weak, false);
});

test('rotateAccessKey issues a new value and invalidates the old one', (t) => {
  const keysFile = keysPath(t);
  const created = createAccessKey(keysFile, 'Alpha Team');

  const rotated = rotateAccessKey(keysFile, 'Alpha Team');

  assert.equal(rotated.name, 'Alpha Team');
  assert.notEqual(rotated.value, created.value);
  assert.equal(rotated.fingerprint.length, 12);

  const keys = loadKeys(keysFile);
  assert.equal(isValidAccessKey(keys, rotated.value), true);
  assert.equal(isValidAccessKey(keys, created.value), false);
});

test('rotateAccessKey preserves status and creation date', (t) => {
  const keysFile = keysPath(t);
  createAccessKey(keysFile, 'Alpha Team', generateAccessKey(), new Date('2026-01-02T03:04:05.000Z'));
  updateAccessKeyStatus(keysFile, 'Alpha Team', false);

  rotateAccessKey(keysFile, 'Alpha Team');

  const listed = listAccessKeys(keysFile)[0];
  assert.equal(listed.active, false);
  assert.equal(listed.createdAt, '2026-01-02T03:04:05.000Z');
});

test('updateAccessKeyStatus suspends and restores a key', (t) => {
  const keysFile = keysPath(t);
  const created = createAccessKey(keysFile, 'Alpha Team');

  const suspended = updateAccessKeyStatus(keysFile, 'Alpha Team', false);
  assert.equal(suspended.name, 'Alpha Team');
  assert.equal(suspended.active, false);
  assert.equal(suspended.fingerprint.length, 12);

  updateAccessKeyStatus(keysFile, 'Alpha Team', true);
  assert.equal(isValidAccessKey(loadKeys(keysFile), created.value), true);
});

test('removeAccessKey deletes a stored key', (t) => {
  const keysFile = keysPath(t);
  createAccessKey(keysFile, 'Alpha Team');
  createAccessKey(keysFile, 'Beta Team');

  const removed = removeAccessKey(keysFile, 'Alpha Team');
  assert.equal(removed.name, 'Alpha Team');
  assert.equal(removed.fingerprint.length, 12);
  assert.deepEqual(listAccessKeys(keysFile).map((key) => key.name), ['Beta Team']);
  assert.throws(() => removeAccessKey(keysFile, 'Alpha Team'), /No key found/);
});

test('loadKeys returns an empty object for missing or invalid key files', (t) => {
  const tempDir = withTempDir(t);
  const invalidFile = path.join(tempDir, 'invalid.json');
  fs.writeFileSync(invalidFile, '{not-json', 'utf8');

  const errors = [];
  assert.deepEqual(loadKeys(path.join(tempDir, 'missing.json'), (err) => errors.push(err)), {});
  assert.deepEqual(loadKeys(invalidFile, (err) => errors.push(err)), {});
  assert.equal(errors.length, 1);
});

test('getInternalRoomName combines public room and access key', () => {
  assert.equal(getInternalRoomName('planning', 'alpha-key'), 'planning-alpha-key');
});

test('isAdminKeyAuthorized validates admin keys without accepting blanks', () => {
  assert.equal(isAdminKeyAuthorized('admin-secret', 'admin-secret'), true);
  assert.equal(isAdminKeyAuthorized('wrong-secret', 'admin-secret'), false);
  assert.equal(isAdminKeyAuthorized('', 'admin-secret'), false);
  assert.equal(isAdminKeyAuthorized('admin-secret', ''), false);
});
