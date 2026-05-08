'use strict';

const authForm = document.getElementById('auth-form');
const adminKeyInput = document.getElementById('admin-key-input');
const statusMessage = document.getElementById('admin-status');
const keysPanel = document.getElementById('keys-panel');
const keysList = document.getElementById('keys-list');
const activityPanel = document.getElementById('activity-panel');
const activityList = document.getElementById('activity-list');
const createKeyForm = document.getElementById('create-key-form');
const keyNameInput = document.getElementById('key-name-input');
const inviteRoomInput = document.getElementById('invite-room-input');
const inviteRoleSelect = document.getElementById('invite-role-select');
const teamSearchInput = document.getElementById('team-search-input');
const expandTeamsButton = document.getElementById('expand-teams-button');
const collapseTeamsButton = document.getElementById('collapse-teams-button');
const refreshKeysButton = document.getElementById('refresh-keys-button');
const refreshActivityButton = document.getElementById('refresh-activity-button');
const keyCount = document.getElementById('key-count');
const activityCount = document.getElementById('activity-count');

const ADMIN_KEY_STORAGE = 'scrumPokerAdminKey';
let currentKeys = [];
let currentActivity = [];
let openTeamNames = new Set();

function getAppUrl() {
  return window.location.origin || `${window.location.protocol}//${window.location.host}`;
}

function getInviteRoom() {
  return inviteRoomInput.value.trim();
}

function getInviteRole() {
  return inviteRoleSelect.value;
}

function getTeamSearch() {
  return teamSearchInput.value.trim().toLowerCase();
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

function createInviteUrl(key) {
  const inviteUrl = new URL('/', getAppUrl());
  const role = getInviteRole();

  inviteUrl.searchParams.set('accessKey', key.value);
  inviteUrl.searchParams.set('role', role);

  const room = getInviteRoom();
  if (room) {
    inviteUrl.searchParams.set('room', room);
  }

  return inviteUrl.toString();
}

function createTeamInvite(key) {
  const room = getInviteRoom();
  const role = getInviteRole();
  const inviteLines = [
    'Scrum Poker team access',
    `Team: ${key.name}`,
    `Access key: ${key.value}`
  ];

  if (room) {
    inviteLines.push(`Room: ${room}`);
  }

  inviteLines.push(
    `App: ${createInviteUrl(key)}`,
    `Role: ${role}`
  );

  return inviteLines.join('\n');
}

function isKeyActive(key) {
  return key.active !== false;
}

function getKeyStatusLabel(key) {
  return isKeyActive(key) ? 'Active' : 'Suspended';
}

function createSuspendedTeamNotice(key) {
  return [
    'Scrum Poker team access',
    `Team: ${key.name}`,
    'Status: Suspended',
    'Restore this team key before sharing an invite.'
  ].join('\n');
}

function getActivityActionLabel(action) {
  const labels = {
    created: 'Created',
    suspended: 'Suspended',
    restored: 'Restored',
    rotated: 'Rotated',
    removed: 'Removed'
  };

  return labels[action] || action;
}

function formatActivityTime(createdAt) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function getOpenTeamNames() {
  const names = new Set(openTeamNames);
  keysList.querySelectorAll('.admin-key-row[open]').forEach((row) => {
    if (row.dataset.teamName) {
      names.add(row.dataset.teamName);
    }
  });
  return names;
}

function getRenderedTeamRows() {
  return Array.from(keysList.querySelectorAll('.admin-key-row'));
}

function setRenderedTeamsOpen(open) {
  getRenderedTeamRows().forEach((row) => {
    if (row.dataset.teamName) {
      if (open) {
        openTeamNames.add(row.dataset.teamName);
      } else {
        openTeamNames.delete(row.dataset.teamName);
      }
    }
    row.open = open;
  });
}

function getTeamCountText(keys, visibleKeys, search) {
  const visibleLabel = `${visibleKeys.length} ${visibleKeys.length === 1 ? 'team' : 'teams'}`;
  const suspendedCount = visibleKeys.filter((key) => !isKeyActive(key)).length;
  const suspendedLabel = suspendedCount ? ` - ${suspendedCount} suspended` : '';

  return search ? `${visibleLabel} of ${keys.length}${suspendedLabel}` : `${visibleLabel}${suspendedLabel}`;
}

function renderActivity(activity) {
  activityList.innerHTML = '';
  activityCount.textContent = `${activity.length} ${activity.length === 1 ? 'event' : 'events'}`;

  if (activity.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No admin activity yet.';
    activityList.appendChild(empty);
    return;
  }

  activity.forEach((event) => {
    const item = document.createElement('article');
    item.className = 'admin-activity-item';

    const badge = document.createElement('span');
    badge.className = `admin-activity-badge is-${event.action}`;
    badge.textContent = getActivityActionLabel(event.action);

    const body = document.createElement('div');
    body.className = 'admin-activity-body';

    const summary = document.createElement('p');
    summary.className = 'admin-activity-summary';
    summary.textContent = event.teamName;

    const meta = document.createElement('p');
    meta.className = 'admin-activity-meta';

    const time = document.createElement('time');
    time.dateTime = event.createdAt;
    time.textContent = formatActivityTime(event.createdAt);

    meta.appendChild(time);
    if (event.keyFingerprint) {
      const fingerprint = document.createElement('code');
      fingerprint.textContent = `key ${event.keyFingerprint}`;
      meta.append(' - ');
      meta.appendChild(fingerprint);
    }

    body.appendChild(summary);
    body.appendChild(meta);
    item.appendChild(badge);
    item.appendChild(body);
    activityList.appendChild(item);
  });
}

function renderKeys(keys) {
  const previouslyOpenTeamNames = getOpenTeamNames();
  const search = getTeamSearch();
  const visibleKeys = search
    ? keys.filter((key) => key.name.toLowerCase().includes(search))
    : keys;

  keysList.innerHTML = '';
  keyCount.textContent = getTeamCountText(keys, visibleKeys, search);

  if (keys.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No team keys found.';
    keysList.appendChild(empty);
    return;
  }

  if (visibleKeys.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty';
    empty.textContent = 'No teams match this search.';
    keysList.appendChild(empty);
    return;
  }

  visibleKeys.forEach((key) => {
    const keyActive = isKeyActive(key);
    const row = document.createElement('details');
    row.className = 'admin-key-row admin-team-section';
    if (!keyActive) {
      row.classList.add('is-suspended');
    }
    row.dataset.teamName = key.name;
    row.open = previouslyOpenTeamNames.has(key.name);
    row.addEventListener('toggle', () => {
      if (row.open) {
        openTeamNames.add(key.name);
      } else {
        openTeamNames.delete(key.name);
      }
    });

    const summary = document.createElement('summary');
    summary.className = 'admin-team-summary';

    const summaryText = document.createElement('span');
    summaryText.className = 'admin-team-summary-text';

    const summaryName = document.createElement('span');
    summaryName.className = 'admin-team-name';
    summaryName.textContent = key.name;

    const summaryMeta = document.createElement('span');
    summaryMeta.className = 'admin-team-meta';
    summaryMeta.textContent = `${getInviteRole()} invite - ${getKeyStatusLabel(key)}`;

    const summaryStatus = document.createElement('span');
    summaryStatus.className = `admin-team-status ${keyActive ? 'is-active' : 'is-suspended'}`;
    summaryStatus.textContent = getKeyStatusLabel(key);

    const summaryIndicator = document.createElement('span');
    summaryIndicator.className = 'admin-team-indicator';
    summaryIndicator.setAttribute('aria-hidden', 'true');

    summaryText.appendChild(summaryName);
    summaryText.appendChild(summaryMeta);
    summaryText.appendChild(summaryStatus);
    summary.appendChild(summaryText);
    summary.appendChild(summaryIndicator);

    const details = document.createElement('div');
    details.className = 'admin-key-details';

    const name = document.createElement('strong');
    name.textContent = key.name;

    const value = document.createElement('code');
    value.textContent = key.value;

    const status = document.createElement('span');
    status.className = `admin-key-status ${keyActive ? 'is-active' : 'is-suspended'}`;
    status.textContent = keyActive
      ? 'Active - team members can use this key to join rooms.'
      : 'Suspended - this key cannot be used to join rooms.';

    const preview = document.createElement('pre');
    preview.className = 'admin-invite-preview';
    preview.setAttribute('aria-label', `Invite preview for ${key.name}`);
    preview.textContent = keyActive ? createTeamInvite(key) : createSuspendedTeamNotice(key);

    details.appendChild(name);
    details.appendChild(value);
    details.appendChild(status);
    details.appendChild(preview);

    const actions = document.createElement('div');
    actions.className = 'admin-key-actions';

    const copyInviteButton = document.createElement('button');
    copyInviteButton.type = 'button';
    copyInviteButton.className = 'primary-action compact-action';
    copyInviteButton.textContent = 'Copy invite';
    if (!keyActive) {
      copyInviteButton.disabled = true;
      copyInviteButton.title = 'Restore this team key before copying an invite.';
    }
    copyInviteButton.addEventListener('click', async () => {
      await copyText(createTeamInvite(key));
      setStatus(`Copied invite for ${key.name}.`, 'success');
    });

    const copyLinkButton = document.createElement('button');
    copyLinkButton.type = 'button';
    copyLinkButton.className = 'secondary-action compact-action';
    copyLinkButton.textContent = 'Copy link';
    if (!keyActive) {
      copyLinkButton.disabled = true;
      copyLinkButton.title = 'Restore this team key before copying an invite link.';
    }
    copyLinkButton.addEventListener('click', async () => {
      await copyText(createInviteUrl(key));
      setStatus(`Copied link for ${key.name}.`, 'success');
    });

    const copyKeyButton = document.createElement('button');
    copyKeyButton.type = 'button';
    copyKeyButton.className = 'secondary-action compact-action';
    copyKeyButton.textContent = 'Copy key';
    if (!keyActive) {
      copyKeyButton.disabled = true;
      copyKeyButton.title = 'Restore this team key before copying the key.';
    }
    copyKeyButton.addEventListener('click', async () => {
      await copyText(key.value);
      setStatus(`Copied key for ${key.name}.`, 'success');
    });

    const rotateButton = document.createElement('button');
    rotateButton.type = 'button';
    rotateButton.className = 'secondary-action compact-action';
    rotateButton.textContent = 'Rotate key';
    rotateButton.addEventListener('click', async () => {
      if (!window.confirm(`Rotate key "${key.name}"? Existing invite links will stop working.`)) return;
      await rotateKey(key.name);
    });

    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = keyActive ? 'secondary-action compact-action' : 'success-action compact-action';
    statusButton.textContent = keyActive ? 'Suspend' : 'Restore';
    statusButton.addEventListener('click', async () => {
      if (keyActive && !window.confirm(`Suspend key "${key.name}"? Current invite links will stop working.`)) return;
      await updateKeyStatus(key.name, !keyActive);
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
    actions.appendChild(copyLinkButton);
    actions.appendChild(copyKeyButton);
    actions.appendChild(rotateButton);
    actions.appendChild(statusButton);
    actions.appendChild(removeButton);

    const body = document.createElement('div');
    body.className = 'admin-team-body';
    body.appendChild(details);
    body.appendChild(actions);

    row.appendChild(summary);
    row.appendChild(body);
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
  currentKeys = data.keys || [];
  sessionStorage.setItem(ADMIN_KEY_STORAGE, getAdminKey());
  keysPanel.classList.remove('hidden');
  renderKeys(currentKeys);
  setStatus('Team keys loaded.', 'success');
}

async function loadActivity() {
  const data = await requestAdmin('/api/admin/activity?limit=20');
  currentActivity = data.activity || [];
  activityPanel.classList.remove('hidden');
  renderActivity(currentActivity);
}

async function loadAdminData() {
  await loadKeys();
  await loadActivity();
}

async function createKey(name) {
  const data = await requestAdmin('/api/admin/keys', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  keyNameInput.value = '';
  await loadAdminData();
  setStatus(`Created team key for ${data.key.name}.`, 'success');
}

async function removeKey(name) {
  const encodedName = encodeURIComponent(name);
  const data = await requestAdmin(`/api/admin/keys/${encodedName}`, {
    method: 'DELETE'
  });
  openTeamNames.delete(data.removed.name);
  await loadAdminData();
  setStatus(`Removed ${data.removed.name}.`, 'success');
}

async function updateKeyStatus(name, active) {
  const encodedName = encodeURIComponent(name);
  const data = await requestAdmin(`/api/admin/keys/${encodedName}`, {
    method: 'PATCH',
    body: JSON.stringify({ active })
  });
  await loadAdminData();
  setStatus(`${data.key.active ? 'Restored' : 'Suspended'} ${data.key.name}.`, 'success');
}

async function rotateKey(name) {
  const encodedName = encodeURIComponent(name);
  const data = await requestAdmin(`/api/admin/keys/${encodedName}/rotate`, {
    method: 'POST'
  });
  await loadAdminData();
  setStatus(`Rotated key for ${data.key.name}.`, 'success');
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus('Checking key...');

  try {
    await loadAdminData();
  } catch (err) {
    keysPanel.classList.add('hidden');
    activityPanel.classList.add('hidden');
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
    await loadAdminData();
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

refreshActivityButton.addEventListener('click', async () => {
  setStatus('Refreshing activity...');

  try {
    await loadActivity();
    setStatus('Admin activity loaded.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

inviteRoomInput.addEventListener('input', () => {
  renderKeys(currentKeys);
});

inviteRoleSelect.addEventListener('change', () => {
  renderKeys(currentKeys);
});

teamSearchInput.addEventListener('input', () => {
  renderKeys(currentKeys);
});

expandTeamsButton.addEventListener('click', () => {
  setRenderedTeamsOpen(true);
});

collapseTeamsButton.addEventListener('click', () => {
  setRenderedTeamsOpen(false);
});

const savedAdminKey = sessionStorage.getItem(ADMIN_KEY_STORAGE);
if (savedAdminKey) {
  adminKeyInput.value = savedAdminKey;
  loadAdminData().catch((err) => {
    keysPanel.classList.add('hidden');
    activityPanel.classList.add('hidden');
    setStatus(err.message, 'error');
  });
}
