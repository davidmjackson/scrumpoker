const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ROLES,
  ROLE_VALUES,
  canChangeRole,
  canResetVotes,
  canRevealVotes,
  canVote,
  getAssignedLoginRole,
  isFacilitator,
  isObserver,
  isValidRole
} = require('../lib/roles');

test('ROLE_VALUES lists all supported roles', () => {
  assert.deepEqual(ROLE_VALUES, [
    ROLES.VOTER,
    ROLES.OBSERVER,
    ROLES.FACILITATOR
  ]);
});

test('isValidRole accepts only supported roles', () => {
  assert.equal(isValidRole(ROLES.VOTER), true);
  assert.equal(isValidRole(ROLES.OBSERVER), true);
  assert.equal(isValidRole(ROLES.FACILITATOR), true);
  assert.equal(isValidRole('Admin'), false);
  assert.equal(isValidRole(undefined), false);
});

test('role type checks identify observers and facilitators', () => {
  assert.equal(isObserver(ROLES.OBSERVER), true);
  assert.equal(isObserver(ROLES.VOTER), false);
  assert.equal(isFacilitator(ROLES.FACILITATOR), true);
  assert.equal(isFacilitator(ROLES.VOTER), false);
});

test('voters and facilitators can vote', () => {
  assert.equal(canVote(ROLES.VOTER), true);
  assert.equal(canVote(ROLES.FACILITATOR), true);
  assert.equal(canVote(ROLES.OBSERVER), false);
});

test('only facilitators can reveal or reset votes', () => {
  assert.equal(canRevealVotes(ROLES.FACILITATOR), true);
  assert.equal(canRevealVotes(ROLES.VOTER), false);
  assert.equal(canResetVotes(ROLES.FACILITATOR), true);
  assert.equal(canResetVotes(ROLES.OBSERVER), false);
});

test('role changes are self-service unless changing another user', () => {
  assert.equal(canChangeRole(ROLES.VOTER, 'alice', 'alice'), true);
  assert.equal(canChangeRole(ROLES.OBSERVER, 'alice', 'alice'), true);
  assert.equal(canChangeRole(ROLES.FACILITATOR, 'alice', 'bob'), true);
  assert.equal(canChangeRole(ROLES.VOTER, 'alice', 'bob'), false);
});

test('requested facilitator is downgraded when a facilitator already exists', () => {
  assert.equal(getAssignedLoginRole(ROLES.FACILITATOR, null), ROLES.FACILITATOR);
  assert.equal(getAssignedLoginRole(ROLES.FACILITATOR, 'alice'), ROLES.VOTER);
  assert.equal(getAssignedLoginRole(ROLES.OBSERVER, 'alice'), ROLES.OBSERVER);
});
