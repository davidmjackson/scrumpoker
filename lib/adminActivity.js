const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_ACTIVITY_LIMIT = 20;
const MAX_ACTIVITY_LIMIT = 100;
const ACTIVITY_ACTIONS = new Set(['created', 'suspended', 'restored', 'rotated', 'removed']);

class AdminActivityError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AdminActivityError';
    this.code = code;
  }
}

function getActivityFilePath(baseDir, env = process.env) {
  return env.SCRUM_POKER_ACTIVITY_FILE
    ? path.resolve(env.SCRUM_POKER_ACTIVITY_FILE)
    : path.join(baseDir, 'admin-activity.jsonl');
}

function getKeyFingerprint(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return '';
  }

  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function normalizeLimit(limit) {
  const parsed = Number.parseInt(limit, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_ACTIVITY_LIMIT;
  }

  return Math.min(parsed, MAX_ACTIVITY_LIMIT);
}

function normalizeAction(action) {
  if (!ACTIVITY_ACTIONS.has(action)) {
    throw new AdminActivityError('Admin activity action is invalid.', 'INVALID_ACTIVITY_ACTION');
  }

  return action;
}

function normalizeTeamName(teamName) {
  if (typeof teamName !== 'string' || teamName.trim().length === 0) {
    throw new AdminActivityError('Admin activity team name is required.', 'INVALID_ACTIVITY_TEAM');
  }

  return teamName.trim();
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  if (!ACTIVITY_ACTIONS.has(raw.action) || typeof raw.createdAt !== 'string') {
    return null;
  }

  if (Number.isNaN(Date.parse(raw.createdAt))) {
    return null;
  }

  const teamName = typeof raw.teamName === 'string' ? raw.teamName.trim() : '';
  if (!teamName) {
    return null;
  }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
    createdAt: raw.createdAt,
    action: raw.action,
    teamName,
    keyFingerprint: typeof raw.keyFingerprint === 'string' ? raw.keyFingerprint : ''
  };
}

function logAdminActivity(activityFile, event, now = new Date()) {
  const action = normalizeAction(event?.action);
  const teamName = normalizeTeamName(event?.teamName);
  const entry = {
    id: crypto.randomUUID(),
    createdAt: now.toISOString(),
    action,
    teamName,
    keyFingerprint: typeof event?.keyFingerprint === 'string' && event.keyFingerprint
      ? event.keyFingerprint
      : getKeyFingerprint(event?.keyValue)
  };
  const directory = path.dirname(activityFile);

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.appendFileSync(activityFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (err) {
    throw new AdminActivityError('Unable to write admin activity log.', 'ACTIVITY_WRITE_FAILED');
  }

  return entry;
}

function listAdminActivity(activityFile, limit = DEFAULT_ACTIVITY_LIMIT) {
  let data;

  try {
    data = fs.readFileSync(activityFile, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }

    throw new AdminActivityError('Unable to read admin activity log.', 'ACTIVITY_READ_FAILED');
  }

  const entries = data
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeEntry(JSON.parse(line));
      } catch (_err) {
        return null;
      }
    })
    .filter(Boolean);

  return entries.slice(-normalizeLimit(limit)).reverse();
}

module.exports = {
  AdminActivityError,
  getActivityFilePath,
  getKeyFingerprint,
  listAdminActivity,
  logAdminActivity
};
