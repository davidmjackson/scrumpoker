const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  getActivityFilePath,
  getKeyFingerprint,
  listAdminActivity,
  logAdminActivity
} = require('../lib/adminActivity');

function withTempDir(t) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-activity-test-'));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  return tempDir;
}

test('getActivityFilePath defaults to admin-activity.jsonl in the given base directory', () => {
  assert.equal(
    getActivityFilePath('/srv/scrumpoker', {}),
    path.join('/srv/scrumpoker', 'admin-activity.jsonl')
  );
});

test('getActivityFilePath honors SCRUM_POKER_ACTIVITY_FILE', () => {
  const activityFile = '/tmp/custom-activity.jsonl';

  assert.equal(
    getActivityFilePath('/srv/scrumpoker', { SCRUM_POKER_ACTIVITY_FILE: activityFile }),
    activityFile
  );
});

test('getKeyFingerprint returns a stable short hash without exposing the key', () => {
  const fingerprint = getKeyFingerprint('secret-access-key');

  assert.equal(fingerprint, getKeyFingerprint('secret-access-key'));
  assert.equal(fingerprint.length, 12);
  assert.notEqual(fingerprint, 'secret-access-key');
});

test('logAdminActivity appends entries and listAdminActivity returns newest first', (t) => {
  const tempDir = withTempDir(t);
  const activityFile = path.join(tempDir, 'admin-activity.jsonl');

  const first = logAdminActivity(
    activityFile,
    { action: 'created', teamName: 'Alpha Team', keyValue: 'alpha-key' },
    new Date('2026-05-08T10:00:00.000Z')
  );
  const second = logAdminActivity(
    activityFile,
    { action: 'rotated', teamName: 'Alpha Team', keyValue: 'alpha-key' },
    new Date('2026-05-08T11:00:00.000Z')
  );

  assert.equal(first.action, 'created');
  assert.equal(second.action, 'rotated');
  assert.equal(fs.readFileSync(activityFile, 'utf8').split('\n').filter(Boolean).length, 2);
  assert.deepEqual(listAdminActivity(activityFile), [second, first]);
  assert.deepEqual(listAdminActivity(activityFile, 1), [second]);
});

test('listAdminActivity ignores malformed lines and missing files', (t) => {
  const tempDir = withTempDir(t);
  const activityFile = path.join(tempDir, 'admin-activity.jsonl');
  fs.writeFileSync(
    activityFile,
    [
      '{not-json',
      JSON.stringify({
        id: 'event-1',
        createdAt: '2026-05-08T10:00:00.000Z',
        action: 'removed',
        teamName: 'Alpha Team',
        keyFingerprint: 'abc123'
      })
    ].join('\n'),
    'utf8'
  );

  assert.deepEqual(listAdminActivity(path.join(tempDir, 'missing.jsonl')), []);
  assert.deepEqual(listAdminActivity(activityFile), [
    {
      id: 'event-1',
      createdAt: '2026-05-08T10:00:00.000Z',
      action: 'removed',
      teamName: 'Alpha Team',
      keyFingerprint: 'abc123'
    }
  ]);
});
