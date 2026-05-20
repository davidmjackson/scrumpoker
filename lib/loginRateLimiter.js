// Throttles access-key brute-force attempts over the WebSocket login flow.
// Only failed logins are counted, so a legitimate user mistyping a key a few
// times is never penalised once they succeed.

const DEFAULT_MAX_FAILURES = 20;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

function createLoginRateLimiter({
  maxFailures = DEFAULT_MAX_FAILURES,
  windowMs = DEFAULT_WINDOW_MS
} = {}) {
  // Map<clientKey: string, failureTimestamps: number[]>
  const failuresByKey = new Map();

  function recentFailures(key, now) {
    const timestamps = (failuresByKey.get(key) || []).filter(
      (timestamp) => now - timestamp < windowMs
    );

    if (timestamps.length > 0) {
      failuresByKey.set(key, timestamps);
    } else {
      failuresByKey.delete(key);
    }

    return timestamps;
  }

  return {
    isBlocked(key, now = Date.now()) {
      return recentFailures(key, now).length >= maxFailures;
    },

    recordFailure(key, now = Date.now()) {
      const timestamps = recentFailures(key, now);
      timestamps.push(now);
      failuresByKey.set(key, timestamps);
    },

    recordSuccess(key) {
      failuresByKey.delete(key);
    },

    get size() {
      return failuresByKey.size;
    }
  };
}

module.exports = {
  DEFAULT_MAX_FAILURES,
  DEFAULT_WINDOW_MS,
  createLoginRateLimiter
};
