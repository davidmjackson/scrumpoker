const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ACCESS_KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_ACCESS_KEY_LENGTH = 12;
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

function validateKeyStore(rawKeys) {
  if (!rawKeys || typeof rawKeys !== 'object' || Array.isArray(rawKeys)) {
    throw new AccessKeyError('Keys file must contain a JSON object.', 'KEYS_INVALID');
  }

  const keys = {};
  Object.entries(rawKeys).forEach(([name, value]) => {
    if (typeof value !== 'string') {
      throw new AccessKeyError('Keys file must contain string key values.', 'KEYS_INVALID');
    }
    keys[name] = value;
  });

  return keys;
}

function readKeysFile(keysFile) {
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

function loadKeys(keysFile, onError = () => {}) {
  try {
    return readKeysFile(keysFile);
  } catch (err) {
    onError(err);
    return {};
  }
}

function isValidAccessKey(keys, accessKey) {
  return Object.values(keys).includes(accessKey);
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

function writeKeysFile(keysFile, keys) {
  const serialized = `${JSON.stringify(validateKeyStore(keys), null, 2)}\n`;
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
  return Object.entries(readKeysFile(keysFile))
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, value]) => ({ name, value }));
}

function createAccessKey(keysFile, name, value = generateAccessKey()) {
  const normalizedName = normalizeKeyName(name);
  const normalizedValue = typeof value === 'string' ? value.trim() : '';

  if (!normalizedValue) {
    throw new AccessKeyError('Access key value is required.', 'INVALID_ACCESS_KEY');
  }

  const keys = readKeysFile(keysFile);
  if (Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`A key named "${normalizedName}" already exists.`, 'DUPLICATE_KEY_NAME');
  }

  keys[normalizedName] = normalizedValue;
  writeKeysFile(keysFile, keys);

  return { name: normalizedName, value: normalizedValue };
}

function removeAccessKey(keysFile, name) {
  const normalizedName = normalizeKeyName(name);
  const keys = readKeysFile(keysFile);

  if (!Object.prototype.hasOwnProperty.call(keys, normalizedName)) {
    throw new AccessKeyError(`No key found with the name "${normalizedName}".`, 'KEY_NOT_FOUND');
  }

  const removed = { name: normalizedName, value: keys[normalizedName] };
  delete keys[normalizedName];
  writeKeysFile(keysFile, keys);

  return removed;
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
  createAccessKey,
  generateAccessKey,
  getInternalRoomName,
  getKeysFilePath,
  isAdminKeyAuthorized,
  isValidAccessKey,
  listAccessKeys,
  readKeysFile,
  removeAccessKey,
  loadKeys
};
