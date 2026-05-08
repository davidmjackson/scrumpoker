const fs = require('fs');
const path = require('path');

function getKeysFilePath(baseDir, env = process.env) {
  return env.SCRUM_POKER_KEYS_FILE
    ? path.resolve(env.SCRUM_POKER_KEYS_FILE)
    : path.join(baseDir, 'keys.json');
}

function loadKeys(keysFile, onError = () => {}) {
  try {
    const data = fs.readFileSync(keysFile, 'utf-8');
    const keys = JSON.parse(data);
    return keys && typeof keys === 'object' && !Array.isArray(keys) ? keys : {};
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

module.exports = {
  getInternalRoomName,
  getKeysFilePath,
  isValidAccessKey,
  loadKeys
};
