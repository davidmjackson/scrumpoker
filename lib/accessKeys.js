const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCESS_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_ACCESS_KEY_LENGTH = 12;
const MIN_ACCESS_KEY_LENGTH = 12;
const ACCESS_KEY_SALT_BYTES = 16;
const KEY_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

class AccessKeyError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AccessKeyError';
    this.code = code;
  }
}

function getKeysFilePath(baseDir, env = process.env) {
  return env.SCRUM_POKER_KEYS_FILE
    ? path.resolve(env.SCRUM_POKER_KEYS_FILE)
    : path.join(baseDir, 'keys.json');
}

// Accept a stored timestamp only if it parses; legacy keys have none.
function normalizeStoredDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
}

function isWeakAccessKey(value) {
  return typeof value !== 'string' || value.length < MIN_ACCESS_KEY_LENGTH;
}

function generateSalt() {
  return crypto.randomBytes(ACCESS_KEY_SALT_BYTES).toString('hex');
}

// Salted SHA-256. Access keys are high-entropy random tokens, so a fast hash
// is sufficient and a per-key salt blocks rainbow tables. SHA-256 also keeps
// login fast: a candidate is checked against every stored key, so a slow KDF
// would make each login O(N) expensive.
function hashAccessKey(value, salt) {
  return crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function isHashedRecord(record) {
  return Boolean(record) && typeof record.hash === 'string' && typeof record.salt === 'string';
}

function fingerprintOf(record) {
  return isHashedRecord(record) ? record.hash.slice(0, 12) : '';
}

function validateKeyStore(rawKeys) {
  if (!rawKeys || typeof rawKeys !== 'object' || Array.isArray(rawKeys)) {
    throw new AccessKeyError('Keys file must contain a JSON object.', 'KEYS_INVALID');
  }

  const invalidShape = () => new AccessKeyError(
    'Keys file must contain key metadata objects.',
    'KEYS_INVALID'
  );

  const keys = {};
  Object.entries(rawKeys).forEach(([name, value]) => {
    // Legacy plaintext shorthand: "name": "key-value".
    if (typeof value === 'string') {
      keys[name] = { value, active: true, createdAt: null, weak: isWeakAccessKey(value) };
      return;
    }

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw invalidShape();
    }

    if (typeof value.active !== 'undefined' && typeof value.active !== 'boolean') {
      throw new AccessKeyError('Key metadata active flags must be boolean.', 'KEYS_INVALID');
    }

    const active = value.active !== false;
    const createdAt = normalizeStoredDate(value.createdAt);

    // Hashed record: the current at-rest format.
    if (typeof value.hash === 'string' && typeof value.salt === 'string') {
      keys[name] = { hash: value.hash, salt: value.salt, active, createdAt, weak: value.weak === true };
      return;
    }

    // Legacy plaintext metadata object.
    if (typeof value.value === 'string') {
      keys[name] = { value: value.value, active, createdAt, weak: isWeakAccessKey(value.value) };
      return;
    }

    throw invalidShape();
  });

  return keys;
}

function readKeyRecordsFile(keysFile) {
  try {
    const data = fs.readFileSync(keysFile, 'utf-8');
    if (!data.trim()) return {};

    return validateKeyStore(JSON.parse(data));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    if (err instanceof AccessKeyError) {
      throw err;
    }
    if (err instanceof SyntaxError) {
      throw new AccessKeyError('Keys file contains invalid JSON.', 'KEYS_INVALID_JSON');
    }
    throw new AccessKeyError('Unable to read keys file.', 'KEYS_READ_FAILED');
  }
}

function readKeysFile(keysFile) {
  const records = readKeyRecordsFile(keysFile);
  const activeKeys = {};

  Object.entries(records).forEach(([name, record]) => {
    if (record.active) {
      activeKeys[name] = record;
    }
  });

  return activeKeys;
}

function loadKeys(keysFile, onError = () => {}) {
  try {
    return readKeysFile(keysFile);
  } catch (err) {
    onError(err);
    return {};
  }
}

// Constant-time string compare so a remote caller cannot probe a value
// character by character. Differing lengths short-circuit (and are unequal).
function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') {
    return false;
  }

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isValidAccessKey(keys, accessKey) {
  if (typeof accessKey !== 'string') {
    return false;
  }

  return Object.values(keys).some((entry) => {
    if (typeof entry === 'string') {
      return safeEqual(entry, accessKey);
    }
    if (!entry || typeof entry !== 'object' || entry.active === false) {
      return false;
    }
    if (typeof entry.hash === 'string' && typeof entry.salt === 'string') {
      return safeEqual(hashAccessKey(accessKey, entry.salt), entry.hash);
    }
    if (typeof entry.value === 'string') {
      return safeEqual(entry.value, accessKey);
    }
    return false;
  });
}

function getInternalRoomName(room, accessKey) {
  return `${room}-${accessKey}`;
}

function normalizeKeyName(name) {
  if (typeof name !== 'string') {
    throw new AccessKeyError('Key name is required.', 'INVALID_KEY_NAME');
  }

  const normalized = name.trim();
  if (!KEY_NAME_PATTERN.test(normalized)) {
    throw new AccessKeyError(
      'Key name must be 1-64 characters and use letters, numbers, spaces, dots, hyphens, or underscores.',
      'INVALID_KEY_NAME'
    );
  }

  return normalized;
}

function generateAccessKey(length = DEFAULT_ACCESS_KEY_LENGTH) {
  let key = '';

  while (key.length < length) {
    const bytes = crypto.randomBytes(length);
    for (const byte of bytes) {
      if (byte >= 248) continue;
      key += ACCESS_KEY_CHARS[byte % ACCESS_KEY_CHARS.length];
      if (key.length === length) break;
    }
  }

  return key;
}

// Every record is written as a salted hash. A legacy plaintext record is
// converted here, so the keys file never keeps a usable secret after a write.
function serializeKeyRecord(record) {
  let hash;
  let salt;
  let weak;

  if (isHashedRecord(record)) {
    ({ hash, salt } = record);
    weak = record.weak === true;
  } else {
    salt = generateSalt();
    hash = hashAccessKey(record.value, salt);
    weak = isWeakAccessKey(record.value);
  }

  const serialized = { hash, salt, active: record.active !== false };
  if (record.createdAt) {
    serialized.createdAt = record.createdAt;
  }
  if (weak) {
    serialized.weak = true;
  }

  return serialized;
}

function serializeKeyStore(keys) {
  const records = validateKeyStore(keys);
  const serialized = {};

  Object.entries(records).forEach(([name, record]) => {
    serialized[name] = serializeKeyRecord(record);
  });

  return serialized;
}

function writeKeysFile(keysFile, keys) {
  const serialized = `${JSON.stringify(serializeKeyStore(keys), null, 2)}\n`;
  const directory = path.dirname(keysFile);
  const tempFile = path.join(directory, `.keys-${process.pid}-${Date.now()}.tmp`);

  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(tempFile, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, keysFile);
  } catch (err) {
    try {
      fs.rmSync(tempFile, { force: true });
    } catch (_cleanupError) {
      // Ignore cleanup errors and report the original write failure.
    }
    throw new AccessKeyError('Unable to write keys file.', 'KEYS_WRITE_FAILED');
  }
}

function listAccessKeys(keysFile) {
  return Object.entries(readKeyRecordsFile(keysFile))
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, record]) => ({
      name,
      active: record.active,
      createdAt: record.createdAt || null,
      weak: record.weak === true
    }));
}

function createAccessKey(keysFile, name, value = generateAccessKey(), now = new Date()) {
  const normalizedName = normalizeKeyName(name);
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (!normalizedValue) {
    throw new AccessKeyError('Access key value is required.', 'INVALID_ACCESS_KEY');
  }
  if (normalizedValue.length < MIN_ACCESS_KEY_LENGTH) {
    throw new AccessKeyError(
      `Access key value must be at least ${MIN_ACCESS_KEY_LENGTH} characters.`,
      'INVALID_ACCESS_KEY'
    );
  }

  const keys = readKeyRecordsFile(keysFile);
  if (Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`A key named "${normalizedName}" already exists.`, 'DUPLICATE_KEY_NAME');
  }

  const createdAt = now.toISOString();
  const salt = generateSalt();
  const hash = hashAccessKey(normalizedValue, salt);
  keys[normalizedName] = { hash, salt, active: true, createdAt, weak: false };
  writeKeysFile(keysFile, keys);

  return {
    name: normalizedName,
    value: normalizedValue,
    active: true,
    createdAt,
    fingerprint: hash.slice(0, 12)
  };
}

function rotateAccessKey(keysFile, name, value = generateAccessKey()) {
  const normalizedName = normalizeKeyName(name);
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (!normalizedValue) {
    throw new AccessKeyError('Access key value is required.', 'INVALID_ACCESS_KEY');
  }

  const keys = readKeyRecordsFile(keysFile);
  if (!Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`No key found with the name "${normalizedName}".`, 'KEY_NOT_FOUND');
  }

  const record = keys[normalizedName];
  const salt = generateSalt();
  const hash = hashAccessKey(normalizedValue, salt);
  keys[normalizedName] = {
    hash,
    salt,
    active: record.active,
    createdAt: record.createdAt,
    weak: isWeakAccessKey(normalizedValue)
  };
  writeKeysFile(keysFile, keys);

  return {
    name: normalizedName,
    value: normalizedValue,
    active: record.active,
    fingerprint: hash.slice(0, 12)
  };
}

function removeAccessKey(keysFile, name) {
  const normalizedName = normalizeKeyName(name);
  const keys = readKeyRecordsFile(keysFile);

  if (!Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`No key found with the name "${normalizedName}".`, 'KEY_NOT_FOUND');
  }

  const removed = {
    name: normalizedName,
    active: keys[normalizedName].active,
    fingerprint: fingerprintOf(keys[normalizedName])
  };
  delete keys[normalizedName];
  writeKeysFile(keysFile, keys);

  return removed;
}

function updateAccessKeyStatus(keysFile, name, active) {
  const normalizedName = normalizeKeyName(name);

  if (typeof active !== 'boolean') {
    throw new AccessKeyError('Access key active status must be true or false.', 'INVALID_KEY_STATUS');
  }

  const keys = readKeyRecordsFile(keysFile);

  if (!Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`No key found with the name "${normalizedName}".`, 'KEY_NOT_FOUND');
  }

  keys[normalizedName].active = active;
  writeKeysFile(keysFile, keys);

  return {
    name: normalizedName,
    active,
    fingerprint: fingerprintOf(keys[normalizedName])
  };
}

// Rewrites the keys file so every record is stored as a salted hash. Safe to
// run repeatedly; already-hashed records are left unchanged.
function migrateKeysFile(keysFile) {
  const records = readKeyRecordsFile(keysFile);
  const names = Object.keys(records);
  const migrated = names.filter((name) => !isHashedRecord(records[name])).length;

  if (names.length > 0) {
    writeKeysFile(keysFile, records);
  }

  return { migrated, total: names.length };
}

function isAdminKeyAuthorized(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || typeof expectedKey !== 'string' || expectedKey.length === 0) {
    return false;
  }

  const provided = Buffer.from(providedKey);
  const expected = Buffer.from(expectedKey);

  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

module.exports = {
  AccessKeyError,
  MIN_ACCESS_KEY_LENGTH,
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
  readKeysFile,
  removeAccessKey,
  rotateAccessKey,
  updateAccessKeyStatus
};
