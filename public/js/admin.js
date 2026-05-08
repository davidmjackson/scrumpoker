'use strict';

const authForm = document.getElementById('auth-form');
const adminKeyInput = document.getElementById('admin-key-input');
const statusMessage = document.getElementById('admin-status');
const keysPanel = document.getElementById('keys-panel');
const keysList = document.getElementById('keys-list');
const createKeyForm = document.getElementById('create-key-form');
const keyNameInput = document.getElementById('key-name-input');
const refreshKeysButton = document.getElementById('refresh-keys-button');
const keyCount = document.getElementById('key-count');

const ADMIN_KEY_STORAGE = 'scrumPokerAdminKey';

function getAppUrl() {
  return window.location.origin || `${window.location.protocol}//${window.location.host}`;
}

function setStatus(message, tone = '') {
  statusMessage.textContent = message;
  statusMessage.className = `admin-status ${tone}`.trim();
}

function getAdminKey() {
  return adminKeyInput.value.trim();
}

async function requestAdmin(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'x-scrum-poker-admin-key': getAdminKey(),
    ...options.headers
  };

  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  let body = {};
  try {
    body = await response.json();
  } catch (_err) {
    body = {};
  }

  if (!response.ok) {
    throw new Error(body.error || `Request failed with ${response.status}`);
  }

  return body;
}

function createFacilitatorInvite(key) {
  return [
    'Scrum Poker team access',
    `Team: ${key.name}`,
    `Access key: ${key.value}`,
    `App: ${getAppUrl()}`,
    'Role: Facilitator'
  ].join('\n');
}

function renderKeys(keys) {
  keysList.innerHTML = '';
  keyCount.textContent = `${keys.length} ${keys.length === 1 ? 'team' : 'teams'}`;

  if (keys.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No team keys found.';
    keysList.appendChild(empty);
    return;
  }

  keys.forEach((key) => {
    const row = document.createElement('div');
    row.className = 'admin-key-row';

    const details = document.createElement('div');
    details.className = 'admin-key-details';

    const name = document.createElement('strong');
    name.textContent = key.name;

    const value = document.createElement('code');
    value.textContent = key.value;

    details.appendChild(name);
    details.appendChild(value);

    const actions = document.createElement('div');
    actions.className = 'admin-key-actions';

    const copyInviteButton = document.createElement('button');
    copyInviteButton.type = 'button';
    copyInviteButton.className = 'primary-action compact-action';
    copyInviteButton.textContent = 'Copy invite';
    copyInviteButton.addEventListener('click', async () => {
      await copyText(createFacilitatorInvite(key));
      setStatus(`Copied invite for ${key.name}.`, 'success');
    });

    const copyKeyButton = document.createElement('button');
    copyKeyButton.type = 'button';
    copyKeyButton.className = 'secondary-action compact-action';
    copyKeyButton.textContent = 'Copy key';
    copyKeyButton.addEventListener('click', async () => {
      await copyText(key.value);
      setStatus(`Copied key for ${key.name}.`, 'success');
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'danger-action compact-action';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', async () => {
      if (!window.confirm(`Remove key "${key.name}"?`)) return;
      await removeKey(key.name);
    });

    actions.appendChild(copyInviteButton);
    actions.appendChild(copyKeyButton);
    actions.appendChild(removeButton);

    row.appendChild(details);
    row.appendChild(actions);
    keysList.appendChild(row);
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.className = 'admin-copy-buffer';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

async function loadKeys() {
  const data = await requestAdmin('/api/admin/keys');
  sessionStorage.setItem(ADMIN_KEY_STORAGE, getAdminKey());
  keysPanel.classList.remove('hidden');
  renderKeys(data.keys || []);
  setStatus('Team keys loaded.', 'success');
}

async function createKey(name) {
  const data = await requestAdmin('/api/admin/keys', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  keyNameInput.value = '';
  await loadKeys();
  setStatus(`Created team key for ${data.key.name}.`, 'success');
}

async function removeKey(name) {
  const encodedName = encodeURIComponent(name);
  const data = await requestAdmin(`/api/admin/keys/${encodedName}`, {
    method: 'DELETE'
  });
  await loadKeys();
  setStatus(`Removed ${data.removed.name}.`, 'success');
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Checking key...');

  try {
    await loadKeys();
  } catch (err) {
    keysPanel.classList.add('hidden');
    setStatus(err.message, 'error');
  }
});

createKeyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const keyName = keyNameInput.value.trim();
  setStatus('Generating key...');

  try {
    await createKey(keyName);
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

refreshKeysButton.addEventListener('click', async () => {
  setStatus('Refreshing keys...');

  try {
    await loadKeys();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

const savedAdminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE);
if (savedAdminKey) {
  adminKeyInput.value = savedAdminKey;
  loadKeys().catch((err) => {
    keysPanel.classList.add('hidden');
    setStatus(err.message, 'error');
  });
}
