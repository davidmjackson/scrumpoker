const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getInternalRoomName,
  getKeysFilePath,
  isValidAccessKey,
  loadKeys
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
  assert.equal(errors.length, 2);
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

test('getInternalRoomName combines public room and access key', () => {
  assert.equal(getInternalRoomName('planning', 'alpha-key'), 'planning-alpha-key');
});
