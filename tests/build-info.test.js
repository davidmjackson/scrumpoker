const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getBuildInfo,
  normalizeCommit,
  readPackageVersion
} = require('../lib/buildInfo');

test('normalizeCommit trims and shortens commit identifiers', () => {
  assert.equal(normalizeCommit('  abcdef1234567890\n'), 'abcdef123456');
  assert.equal(normalizeCommit(''), null);
  assert.equal(normalizeCommit(null), null);
});

test('readPackageVersion reads package metadata from a base directory', (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-build-info-test-'));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '2.3.4' }), 'utf8');

  assert.equal(readPackageVersion(tempDir), '2.3.4');
});

test('getBuildInfo prefers explicit runtime environment values', () => {
  const info = getBuildInfo('/does/not/exist', {
    SCRUM_POKER_VERSION: '9.8.7',
    SCRUM_POKER_COMMIT: '1234567890abcdef'
  });

  assert.deepEqual(info, {
    version: '9.8.7',
    commit: '1234567890ab'
  });
});
