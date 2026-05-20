const test = require('node:test');
const assert = require('node:assert/strict');

const { createLoginRateLimiter } = require('../lib/loginRateLimiter');

test('blocks a client once failures reach the limit', () => {
  const limiter = createLoginRateLimiter({ maxFailures: 3, windowMs: 1000 });

  assert.equal(limiter.isBlocked('1.2.3.4', 0), false);
  limiter.recordFailure('1.2.3.4', 0);
  limiter.recordFailure('1.2.3.4', 10);
  assert.equal(limiter.isBlocked('1.2.3.4', 20), false);

  limiter.recordFailure('1.2.3.4', 30);
  assert.equal(limiter.isBlocked('1.2.3.4', 40), true);
});

test('failures outside the window stop counting', () => {
  const limiter = createLoginRateLimiter({ maxFailures: 2, windowMs: 1000 });

  limiter.recordFailure('host', 0);
  limiter.recordFailure('host', 100);
  assert.equal(limiter.isBlocked('host', 200), true);

  // The first two failures have aged out of the 1000ms window.
  assert.equal(limiter.isBlocked('host', 1200), false);
  assert.equal(limiter.size, 0);
});

test('a successful login clears recorded failures', () => {
  const limiter = createLoginRateLimiter({ maxFailures: 2, windowMs: 1000 });

  limiter.recordFailure('host', 0);
  limiter.recordSuccess('host');

  limiter.recordFailure('host', 10);
  assert.equal(limiter.isBlocked('host', 20), false);
});

test('limits are tracked independently per client key', () => {
  const limiter = createLoginRateLimiter({ maxFailures: 1, windowMs: 1000 });

  limiter.recordFailure('attacker', 0);
  assert.equal(limiter.isBlocked('attacker', 0), true);
  assert.equal(limiter.isBlocked('bystander', 0), false);
});
