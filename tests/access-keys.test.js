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
  isAdminKeyAuthorized,
  isValidAccessKey,
  listAccessKeys,
  loadKeys,
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

test('getKeysFilePath defaults to keys.json in the given base directory', () => {
  assert.equal(
    getKeysFilePath('/srv/scrumpoker', {}),
    path.join('/srv/scrumpoker', 'keys.json')
  );
});

test('getKeysFilePath honors SCRUM_POKER_KEYS_FILE', () => {
  const keysFile = '/tmp/custom-keys.json';

  assert.equal(
    getKeysFilePath('/srv/scrumpoker', { SCRUM_POKER_KEYS_FILE: keysFile }),
    keysFile
  );
});

test('loadKeys reads a JSON object from disk', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ team: 'secret-key' }), 'utf8');

  assert.deepEqual(loadKeys(keysFile), { team: 'secret-key' });
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

test('loadKeys ignores non-object JSON values', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify(['secret-key']), 'utf8');

  assert.deepEqual(loadKeys(keysFile), {});
});

test('isValidAccessKey checks saved key values', () => {
  const keys = {
    alpha: 'alpha-key',
    beta: 'beta-key'
  };

  assert.equal(isValidAccessKey(keys, 'alpha-key'), true);
  assert.equal(isValidAccessKey(keys, 'missing-key'), false);
});

test('loadKeys filters suspended metadata keys', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(
    keysFile,
    JSON.stringify({
      alpha: 'alpha-key',
      beta: { value: 'beta-key', active: false }
    }),
    'utf8'
  );

  assert.deepEqual(loadKeys(keysFile), { alpha: 'alpha-key' });
  assert.equal(isValidAccessKey(loadKeys(keysFile), 'alpha-key'), true);
  assert.equal(isValidAccessKey(loadKeys(keysFile), 'beta-key'), false);
});

test('getInternalRoomName combines public room and access key', () => {
  assert.equal(getInternalRoomName('planning', 'alpha-key'), 'planning-alpha-key');
});

test('generateAccessKey creates alphanumeric key values', () => {
  const key = generateAccessKey();

  assert.equal(key.length, 12);
  assert.match(key, /^[A-Za-z0-9]+$/);
});

test('createAccessKey stores a generated key and prevents duplicates', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');

  const created = createAccessKey(keysFile, 'Alpha Team');

  assert.equal(created.name, 'Alpha Team');
  assert.equal(created.value.length, 12);
  assert.deepEqual(loadKeys(keysFile), { 'Alpha Team': created.value });
  assert.throws(
    () => createAccessKey(keysFile, 'Alpha Team'),
    /already exists/
  );
});

test('createAccessKey rejects values below the minimum length', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');

  assert.throws(
    () => createAccessKey(keysFile, 'Short Team', 'tiny'),
    /at least 12 characters/
  );
  assert.deepEqual(loadKeys(keysFile), {});
});

test('createAccessKey records a creation timestamp', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  const now = new Date('2026-05-20T10:00:00.000Z');

  const created = createAccessKey(keysFile, 'Timed Team', generateAccessKey(), now);

  assert.equal(created.createdAt, '2026-05-20T10:00:00.000Z');
  assert.equal(listAccessKeys(keysFile)[0].createdAt, '2026-05-20T10:00:00.000Z');
});

test('listAccessKeys flags keys shorter than the minimum length as weak', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(
    keysFile,
    JSON.stringify({ legacy: 'ABiMWb', strong: 'StrongKey123456' }),
    'utf8'
  );

  const keys = listAccessKeys(keysFile);

  assert.equal(keys.find((key) => key.name === 'legacy').weak, true);
  assert.equal(keys.find((key) => key.name === 'strong').weak, false);
});

test('isValidAccessKey rejects non-string candidates', () => {
  const keys = { alpha: 'a-long-enough-key' };

  assert.equal(isValidAccessKey(keys, 'a-long-enough-key'), true);
  assert.equal(isValidAccessKey(keys, 1234567890), false);
  assert.equal(isValidAccessKey(keys, null), false);
});

test('listAccessKeys returns keys sorted by name', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ beta: 'two', alpha: 'one' }), 'utf8');

  assert.deepEqual(listAccessKeys(keysFile), [
    { name: 'alpha', value: 'one', active: true, createdAt: null, weak: true },
    { name: 'beta', value: 'two', active: true, createdAt: null, weak: true }
  ]);
});

test('removeAccessKey deletes one stored key', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ alpha: 'one', beta: 'two' }), 'utf8');

  const removed = removeAccessKey(keysFile, 'alpha');

  assert.deepEqual(removed, { name: 'alpha', value: 'one', active: true });
  assert.deepEqual(loadKeys(keysFile), { beta: 'two' });
});

test('updateAccessKeyStatus suspends and restores a stored key', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ alpha: 'one', beta: 'two' }), 'utf8');

  const suspended = updateAccessKeyStatus(keysFile, 'alpha', false);

  assert.deepEqual(suspended, { name: 'alpha', value: 'one', active: false });
  assert.deepEqual(loadKeys(keysFile), { beta: 'two' });
  assert.deepEqual(listAccessKeys(keysFile), [
    { name: 'alpha', value: 'one', active: false, createdAt: null, weak: true },
    { name: 'beta', value: 'two', active: true, createdAt: null, weak: true }
  ]);

  const restored = updateAccessKeyStatus(keysFile, 'alpha', true);

  assert.deepEqual(restored, { name: 'alpha', value: 'one', active: true });
  assert.deepEqual(loadKeys(keysFile), { alpha: 'one', beta: 'two' });
});

test('rotateAccessKey replaces one stored key and preserves status', (t) => {
  const tempDir = withTempDir(t);
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(
    keysFile,
    JSON.stringify({
      alpha: 'one',
      beta: { value: 'two', active: false }
    }),
    'utf8'
  );

  const rotatedActive = rotateAccessKey(keysFile, 'alpha', 'three');

  assert.deepEqual(rotatedActive, {
    name: 'alpha',
    value: 'three',
    previousValue: 'one',
    active: true
  });
  assert.deepEqual(loadKeys(keysFile), { alpha: 'three' });

  const rotatedSuspended = rotateAccessKey(keysFile, 'beta', 'four');

  assert.deepEqual(rotatedSuspended, {
    name: 'beta',
    value: 'four',
    previousValue: 'two',
    active: false
  });
  assert.deepEqual(loadKeys(keysFile), { alpha: 'three' });
  assert.deepEqual(listAccessKeys(keysFile), [
    { name: 'alpha', value: 'three', active: true, createdAt: null, weak: true },
    { name: 'beta', value: 'four', active: false, createdAt: null, weak: true }
  ]);
});

test('isAdminKeyAuthorized validates admin keys without accepting blanks', () => {
  assert.equal(isAdminKeyAuthorized('admin-secret', 'admin-secret'), true);
  assert.equal(isAdminKeyAuthorized('wrong-secret', 'admin-secret'), false);
  assert.equal(isAdminKeyAuthorized('', 'admin-secret'), false);
  assert.equal(isAdminKeyAuthorized('admin-secret', ''), false);
});
