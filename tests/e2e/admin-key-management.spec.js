const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const adminKey = 'admin-browser-test-secret';

test('admin can unlock, create, copy, and remove team access keys', async ({ page, context }) => {
  const server = await startServer({
    adminKey,
    keys: {
      browser: 'browser-test-key',
      alpha: 'alpha-test-key'
    }
  });

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.baseUrl });

    await page.goto(`${server.baseUrl}/admin`);

    await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible();
    await expect(page.locator('#keys-panel')).toBeHidden();
    await expect(page.locator('#activity-panel')).toBeHidden();

    await page.locator('#admin-key-input').fill('wrong-admin-key');
    await page.locator('#auth-form button[type="submit"]').click();
    await expect(page.locator('#admin-status')).toHaveText('Unauthorized.');
    await expect(page.locator('#keys-panel')).toBeHidden();
    await expect(page.locator('#activity-panel')).toBeHidden();

    await page.locator('#admin-key-input').fill(adminKey);
    await page.locator('#auth-form button[type="submit"]').click();

    await expect(page.locator('#keys-panel')).toBeVisible();
    await expect(page.locator('#activity-panel')).toBeVisible();
    await expect(page.locator('#admin-status')).toHaveText('Team keys loaded.');
    await expect(page.locator('#key-count')).toHaveText('2 teams');
    await expect(page.locator('#activity-count')).toHaveText('0 events');
    await expect(page.locator('#activity-list')).toHaveText('No admin activity yet.');
    await expect(page.locator('#keys-list')).toContainText('alpha');
    await expect(page.locator('#keys-list')).toContainText('browser');

    const alphaRow = page.locator('.admin-key-row').filter({ hasText: 'alpha' });
    const browserRow = page.locator('.admin-key-row').filter({ hasText: 'browser' });
    await expect(alphaRow.locator('.admin-team-body')).toBeHidden();
    await expect(browserRow.locator('.admin-team-body')).toBeHidden();

    await page.locator('#expand-teams-button').click();
    await expect(alphaRow.locator('.admin-team-body')).toBeVisible();
    await expect(browserRow.locator('.admin-team-body')).toBeVisible();

    await page.locator('#collapse-teams-button').click();
    await expect(alphaRow.locator('.admin-team-body')).toBeHidden();
    await expect(browserRow.locator('.admin-team-body')).toBeHidden();

    await page.locator('#team-search-input').fill('alp');
    await expect(page.locator('#key-count')).toHaveText('1 team of 2');
    await expect(page.locator('#keys-list')).toContainText('alpha');
    await expect(page.locator('#keys-list')).not.toContainText('browser');
    await page.locator('#expand-teams-button').click();
    await expect(alphaRow.locator('.admin-team-body')).toBeVisible();

    await page.locator('#team-search-input').fill('missing');
    await expect(page.locator('#key-count')).toHaveText('0 teams of 2');
    await expect(page.locator('#keys-list')).toHaveText('No teams match this search.');

    await page.locator('#team-search-input').fill('');
    await expect(page.locator('#key-count')).toHaveText('2 teams');
    await expect(page.locator('#keys-list')).toContainText('browser');
    await expect(alphaRow.locator('.admin-team-body')).toBeVisible();
    await expect(browserRow.locator('.admin-team-body')).toBeHidden();

    await page.locator('#key-name-input').fill('Gamma Team');
    await page.locator('#invite-room-input').fill('Sprint Planning');
    await page.locator('#invite-role-select').selectOption('Voter');
    await page.locator('#create-key-form button[type="submit"]').click();

    const gammaRow = page.locator('.admin-key-row').filter({ hasText: 'Gamma Team' });
    await expect(gammaRow).toBeVisible();
    await expect(page.locator('#admin-status')).toHaveText('Created team key for Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 teams');
    await expect(page.locator('#activity-count')).toHaveText('1 event');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Created');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Gamma Team');
    await expect(gammaRow.locator('.admin-team-body')).toBeHidden();
    await gammaRow.locator('summary').click();
    await expect(gammaRow.locator('.admin-team-body')).toBeVisible();
    await expect(gammaRow.locator('.admin-key-status')).toHaveText('Active - team members can use this key to join rooms.');
    const gammaKey = await gammaRow.locator('code').innerText();

    await page.locator('#invite-room-input').fill('Release Planning');
    await page.locator('#invite-role-select').selectOption('Observer');
    await expect(gammaRow.locator('.admin-team-body')).toBeVisible();

    const invitePreview = gammaRow.locator('.admin-invite-preview');
    await expect(invitePreview).toContainText('Team: Gamma Team');
    await expect(invitePreview).toContainText(`Access key: ${gammaKey}`);
    await expect(invitePreview).toContainText('Room: Release Planning');
    await expect(invitePreview).toContainText('Role: Observer');
    const previewText = await invitePreview.evaluate((node) => node.textContent);

    await gammaRow.getByRole('button', { name: 'Copy invite' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Copied invite for Gamma Team.');
    const copiedInvite = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedInvite).toBe(previewText);
    expect(copiedInvite).toContain('Scrum Poker team access');
    expect(copiedInvite).toContain('Team: Gamma Team');
    expect(copiedInvite).toContain(`Access key: ${gammaKey}`);
    expect(copiedInvite).toContain('Room: Release Planning');
    expect(copiedInvite).toContain('Role: Observer');
    const inviteUrl = copiedInvite.match(/^App: (.+)$/m)?.[1];
    expect(inviteUrl).toBeTruthy();
    const parsedInviteUrl = new URL(inviteUrl);
    expect(parsedInviteUrl.origin).toBe(server.baseUrl);
    expect(parsedInviteUrl.searchParams.get('accessKey')).toBe(gammaKey);
    expect(parsedInviteUrl.searchParams.get('room')).toBe('Release Planning');
    expect(parsedInviteUrl.searchParams.get('role')).toBe('Observer');

    await gammaRow.getByRole('button', { name: 'Copy link' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Copied link for Gamma Team.');
    const copiedLink = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedLink).toBe(inviteUrl);

    await gammaRow.getByRole('button', { name: 'Copy key' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Copied key for Gamma Team.');
    const copiedKey = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedKey).toBe(gammaKey);

    page.once('dialog', (dialog) => dialog.accept());
    await gammaRow.getByRole('button', { name: 'Suspend' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Suspended Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 teams - 1 suspended');
    await expect(page.locator('#activity-count')).toHaveText('2 events');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Suspended');
    await expect(gammaRow.locator('.admin-team-body')).toBeVisible();
    await expect(gammaRow.locator('.admin-team-status')).toHaveText('Suspended');
    await expect(gammaRow.locator('.admin-key-status')).toHaveText('Suspended - this key cannot be used to join rooms.');
    await expect(gammaRow.locator('.admin-invite-preview')).toContainText('Status: Suspended');
    await expect(gammaRow.getByRole('button', { name: 'Copy invite' })).toBeDisabled();
    await expect(gammaRow.getByRole('button', { name: 'Copy link' })).toBeDisabled();
    await expect(gammaRow.getByRole('button', { name: 'Copy key' })).toBeDisabled();

    await gammaRow.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Restored Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 teams');
    await expect(page.locator('#activity-count')).toHaveText('3 events');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Restored');
    await expect(gammaRow.locator('.admin-team-body')).toBeVisible();
    await expect(gammaRow.locator('.admin-team-status')).toHaveText('Active');
    await expect(gammaRow.getByRole('button', { name: 'Copy invite' })).toBeEnabled();

    page.once('dialog', (dialog) => dialog.accept());
    await gammaRow.getByRole('button', { name: 'Remove' }).click();

    await expect(page.locator('#admin-status')).toHaveText('Removed Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('2 teams');
    await expect(page.locator('#activity-count')).toHaveText('4 events');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Removed');
    await expect(page.locator('#activity-list')).not.toContainText(gammaKey);
    await expect(gammaRow).toHaveCount(0);

    await page.goto(inviteUrl);
    await expect(page.locator('#access-key-input')).toHaveValue(gammaKey);
    await expect(page.locator('#room-input')).toHaveValue('Release Planning');
    await expect(page.locator('#role-select')).toHaveValue('Observer');
    expect(page.url()).not.toContain('accessKey=');
  } finally {
    await server.stop();
  }
});
