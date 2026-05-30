const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticateUpgrade } = require('../lib/upgradeAuth');

test('rejects (401) when verifySession returns null', async () => {
  const r = await authenticateUpgrade(async () => null, 'poker_session=x');
  assert.deepEqual(r, { ok: false, status: 401 });
});

test('rejects (401) when the user is not entitled', async () => {
  const r = await authenticateUpgrade(async () => ({ userId: 'u1', entitled: false, teams: [] }), 'c');
  assert.deepEqual(r, { ok: false, status: 401 });
});

test('accepts and returns context when entitled', async () => {
  const ctx = { userId: 'u1', entitled: true, teams: [{ id: 't1', name: 'Alpha', role: 'lead' }] };
  const r = await authenticateUpgrade(async () => ctx, 'c');
  assert.deepEqual(r, { ok: true, context: ctx });
});

test('propagates when verifySession throws', async () => {
  const boom = new Error('hub down');
  await assert.rejects(() => authenticateUpgrade(async () => { throw boom; }, 'c'), boom);
});
