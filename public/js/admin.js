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
const keyActionModal = document.getElementById('key-action-modal');
const keyActionKicker = document.getElementById('key-action-kicker');
const keyActionTitle = document.getElementById('key-action-title');
const keyActionMessage = document.getElementById('key-action-message');
const keyActionNote = document.getElementById('key-action-note');
const cancelKeyActionButton = document.getElementById('cancel-key-action-button');
const confirmKeyActionButton = document.getElementById('confirm-key-action-button');
const keyRevealModal = document.getElementById('key-reveal-modal');
const keyRevealTitle = document.getElementById('key-reveal-title');
const keyRevealValue = document.getElementById('key-reveal-value');
const keyRevealInvite = document.getElementById('key-reveal-invite');
const keyRevealCopyInviteButton = document.getElementById('key-reveal-copy-invite');
const keyRevealCopyLinkButton = document.getElementById('key-reveal-copy-link');
const keyRevealCopyKeyButton = document.getElementById('key-reveal-copy-key');
const keyRevealCloseButton = document.getElementById('key-reveal-close-button');

const ADMIN_KEY_STORAGE = 'scrumPokerAdminKey';
let currentKeys = [];
let currentActivity = [];
let openTeamNames = new Set();
let pendingKeyAction = null;
let keyActionInFlight = false;
let revealedKey = null;

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

function openKeyActionModal(action) {
  keyActionInFlight = false;
  pendingKeyAction = action;
  keyActionKicker.textContent = action.kicker;
  keyActionTitle.textContent = action.title;
  keyActionMessage.textContent = action.message;
  keyActionNote.textContent = action.note;
  confirmKeyActionButton.textContent = action.confirmLabel;
  confirmKeyActionButton.className = action.confirmClassName || 'danger-action';
  confirmKeyActionButton.disabled = false;
  cancelKeyActionButton.disabled = false;
  keyActionModal.classList.remove('is-busy');
  keyActionModal.setAttribute('aria-busy', 'false');
  keyActionModal.classList.remove('hidden');
  confirmKeyActionButton.focus();
}

function closeKeyActionModal() {
  if (keyActionInFlight) return;

  pendingKeyAction = null;
  keyActionModal.classList.add('hidden');
}

function setKeyActionBusy(busy) {
  keyActionInFlight = busy;
  keyActionModal.classList.toggle('is-busy', busy);
  keyActionModal.setAttribute('aria-busy', busy ? 'true' : 'false');
  confirmKeyActionButton.disabled = busy;
  cancelKeyActionButton.disabled = busy;

  if (pendingKeyAction) {
    confirmKeyActionButton.textContent = busy
      ? pendingKeyAction.busyLabel || 'Working...'
      : pendingKeyAction.confirmLabel;
  }
}

async function confirmKeyAction() {
  if (!pendingKeyAction) return;

  const action = pendingKeyAction;
  setKeyActionBusy(true);

  try {
    await action.onConfirm();
    setKeyActionBusy(false);
    closeKeyActionModal();
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    setKeyActionBusy(false);
  }
}

function openRotateKeyModal(teamName) {
  openKeyActionModal({
    kicker: 'Key rotation',
    title: 'Rotate team key?',
    message: `This will generate a new access key for ${teamName}.`,
    note: 'Existing invite links for this team will stop working immediately.',
    confirmLabel: 'Rotate key',
    busyLabel: 'Rotating...',
    onConfirm: () => rotateKey(teamName)
  });
}

function openSuspendKeyModal(teamName) {
  openKeyActionModal({
    kicker: 'Key suspension',
    title: 'Suspend team key?',
    message: `This will block team access for ${teamName}.`,
    note: 'Current invite links for this team will stop working until the key is restored.',
    confirmLabel: 'Suspend key',
    busyLabel: 'Suspending...',
    onConfirm: () => updateKeyStatus(teamName, false)
  });
}

function openRemoveKeyModal(teamName) {
  openKeyActionModal({
    kicker: 'Key removal',
    title: 'Remove team key?',
    message: `This will permanently remove the team key for ${teamName}.`,
    note: 'Team members will no longer be able to join with this key. This cannot be undone from the admin page.',
    confirmLabel: 'Remove key',
    busyLabel: 'Removing...',
    onConfirm: () => removeKey(teamName)
  });
}

// A freshly created or rotated key is the only moment the raw value exists;
// it is stored hashed, so this modal is the one chance to copy it.
function showKeyReveal(key) {
  revealedKey = key;
  keyRevealTitle.textContent = `${key.name} access key`;
  keyRevealValue.textContent = key.value;
  keyRevealInvite.textContent = createTeamInvite(key);
  keyRevealModal.classList.remove('hidden');
  keyRevealCloseButton.focus();
}

function closeKeyReveal() {
  revealedKey = null;
  keyRevealValue.textContent = '';
  keyRevealInvite.textContent = '';
  keyRevealModal.classList.add('hidden');
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
    summaryMeta.textContent = key.createdAt
      ? `Created ${formatActivityTime(key.createdAt)}`
      : 'Created date not recorded';

    const summaryStatus = document.createElement('span');
    summaryStatus.className = `admin-team-status ${keyActive ? 'is-active' : 'is-suspended'}`;
    summaryStatus.textContent = getKeyStatusLabel(key);

    const summaryIndicator = document.createElement('span');
    summaryIndicator.className = 'admin-team-indicator';
    summaryIndicator.setAttribute('aria-hidden', 'true');

    summaryText.appendChild(summaryName);
    summaryText.appendChild(summaryMeta);
    summaryText.appendChild(summaryStatus);
    if (key.weak) {
      const summaryWeak = document.createElement('span');
      summaryWeak.className = 'admin-team-status is-weak';
      summaryWeak.textContent = 'Weak key';
      summaryText.appendChild(summaryWeak);
    }
    summary.appendChild(summaryText);
    summary.appendChild(summaryIndicator);

    const details = document.createElement('div');
    details.className = 'admin-key-details';

    const status = document.createElement('span');
    status.className = `admin-key-status ${keyActive ? 'is-active' : 'is-suspended'}`;
    status.textContent = keyActive
      ? 'Active - team members can use this key to join rooms.'
      : 'Suspended - this key cannot be used to join rooms.';

    const storageNote = document.createElement('p');
    storageNote.className = 'admin-key-meta';
    storageNote.textContent = 'The access key is stored hashed and is shown only when created or rotated.';

    details.appendChild(status);
    details.appendChild(storageNote);
    if (key.weak) {
      const weakNote = document.createElement('p');
      weakNote.className = 'admin-key-warning';
      weakNote.textContent = 'Weak key — rotate to issue a strong 12-character key.';
      details.appendChild(weakNote);
    }

    const actions = document.createElement('div');
    actions.className = 'admin-key-actions';

    const rotateButton = document.createElement('button');
    rotateButton.type = 'button';
    rotateButton.className = 'btn btn-primary compact-action';
    rotateButton.textContent = 'Rotate key';
    rotateButton.addEventListener('click', () => {
      openRotateKeyModal(key.name);
    });

    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = keyActive ? 'secondary-action compact-action' : 'success-action compact-action';
    statusButton.textContent = keyActive ? 'Suspend' : 'Restore';
    statusButton.addEventListener('click', async () => {
      if (keyActive) {
        openSuspendKeyModal(key.name);
        return;
      }
      await updateKeyStatus(key.name, !keyActive);
    });

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'danger-action compact-action';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      openRemoveKeyModal(key.name);
    });

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

const { copyText } = window.ScrumPokerClipboard;

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
  showKeyReveal(data.key);
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
  showKeyReveal(data.key);
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

teamSearchInput.addEventListener('input', () => {
  renderKeys(currentKeys);
});

expandTeamsButton.addEventListener('click', () => {
  setRenderedTeamsOpen(true);
});

collapseTeamsButton.addEventListener('click', () => {
  setRenderedTeamsOpen(false);
});

cancelKeyActionButton.addEventListener('click', closeKeyActionModal);
confirmKeyActionButton.addEventListener('click', confirmKeyAction);

keyActionModal.addEventListener('click', (event) => {
  if (event.target === keyActionModal) {
    closeKeyActionModal();
  }
});

keyRevealCloseButton.addEventListener('click', closeKeyReveal);

keyRevealModal.addEventListener('click', (event) => {
  if (event.target === keyRevealModal) {
    closeKeyReveal();
  }
});

keyRevealCopyInviteButton.addEventListener('click', async () => {
  if (!revealedKey) return;
  await copyText(createTeamInvite(revealedKey));
  setStatus(`Copied invite for ${revealedKey.name}.`, 'success');
});

keyRevealCopyLinkButton.addEventListener('click', async () => {
  if (!revealedKey) return;
  await copyText(createInviteUrl(revealedKey));
  setStatus(`Copied link for ${revealedKey.name}.`, 'success');
});

keyRevealCopyKeyButton.addEventListener('click', async () => {
  if (!revealedKey) return;
  await copyText(revealedKey.value);
  setStatus(`Copied key for ${revealedKey.name}.`, 'success');
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;

  if (!keyRevealModal.classList.contains('hidden')) {
    closeKeyReveal();
  } else if (!keyActionModal.classList.contains('hidden')) {
    closeKeyActionModal();
  }
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
