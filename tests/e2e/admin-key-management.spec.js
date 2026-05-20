const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const adminKey = 'admin-browser-test-secret';

test('admin can unlock, create, reveal, rotate, and remove team access keys', async ({ page, context }) => {
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

    await page.locator('#admin-key-input').fill('wrong-admin-key');
    await page.locator('#auth-form button[type="submit"]').click();
    await expect(page.locator('#admin-status')).toHaveText('Unauthorized.');
    await expect(page.locator('#keys-panel')).toBeHidden();

    await page.locator('#admin-key-input').fill(adminKey);
    await page.locator('#auth-form button[type="submit"]').click();

    await expect(page.locator('#keys-panel')).toBeVisible();
    await expect(page.locator('#activity-panel')).toBeVisible();
    await expect(page.locator('#admin-status')).toHaveText('Team keys loaded.');
    await expect(page.locator('#key-count')).toHaveText('2 teams');
    await expect(page.locator('#activity-count')).toHaveText('0 events');
    await expect(page.locator('#keys-list')).toContainText('alpha');
    await expect(page.locator('#keys-list')).toContainText('browser');

    const alphaRow = page.locator('.admin-key-row').filter({ hasText: 'alpha' });
    await expect(alphaRow.locator('.admin-team-body')).toBeHidden();
    await page.locator('#expand-teams-button').click();
    await expect(alphaRow.locator('.admin-team-body')).toBeVisible();
    await page.locator('#collapse-teams-button').click();
    await expect(alphaRow.locator('.admin-team-body')).toBeHidden();

    await page.locator('#team-search-input').fill('alp');
    await expect(page.locator('#key-count')).toHaveText('1 team of 2');
    await expect(page.locator('#keys-list')).not.toContainText('browser');
    await page.locator('#team-search-input').fill('missing');
    await expect(page.locator('#keys-list')).toHaveText('No teams match this search.');
    await page.locator('#team-search-input').fill('');
    await expect(page.locator('#key-count')).toHaveText('2 teams');

    // --- Create a team: the raw key is shown once in the reveal modal. ---
    await page.locator('#key-name-input').fill('Gamma Team');
    await page.locator('#invite-room-input').fill('Sprint Planning');
    await page.locator('#invite-role-select').selectOption('Voter');
    await page.locator('#create-key-form button[type="submit"]').click();

    const revealModal = page.locator('#key-reveal-modal');
    await expect(revealModal).toBeVisible();
    await expect(revealModal).toContainText('Gamma Team access key');

    const originalGammaKey = (await page.locator('#key-reveal-value').innerText()).trim();
    expect(originalGammaKey).toMatch(/^[A-Za-z0-9]{12}$/);
    await expect(page.locator('#admin-status')).toHaveText('Created team key for Gamma Team.');

    const invitePreview = page.locator('#key-reveal-invite');
    await expect(invitePreview).toContainText('Team: Gamma Team');
    await expect(invitePreview).toContainText(`Access key: ${originalGammaKey}`);
    await expect(invitePreview).toContainText('Room: Sprint Planning');
    await expect(invitePreview).toContainText('Role: Voter');
    const previewText = await invitePreview.evaluate((node) => node.textContent);

    await page.locator('#key-reveal-copy-invite').click();
    await expect(page.locator('#admin-status')).toHaveText('Copied invite for Gamma Team.');
    const copiedInvite = await page.evaluate(() => navigator.clipboard.readText());
    expect(copiedInvite).toBe(previewText);
    const inviteUrl = copiedInvite.match(/^App: (.+)$/m)?.[1];
    expect(inviteUrl).toBeTruthy();
    const parsedInviteUrl = new URL(inviteUrl);
    expect(parsedInviteUrl.searchParams.get('accessKey')).toBe(originalGammaKey);
    expect(parsedInviteUrl.searchParams.get('room')).toBe('Sprint Planning');
    expect(parsedInviteUrl.searchParams.get('role')).toBe('Voter');

    await page.locator('#key-reveal-copy-link').click();
    await expect(page.locator('#admin-status')).toHaveText('Copied link for Gamma Team.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(inviteUrl);

    await page.locator('#key-reveal-copy-key').click();
    await expect(page.locator('#admin-status')).toHaveText('Copied key for Gamma Team.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(originalGammaKey);

    await page.locator('#key-reveal-close-button').click();
    await expect(revealModal).toBeHidden();

    await expect(page.locator('#key-count')).toHaveText('3 teams');
    await expect(page.locator('#activity-count')).toHaveText('1 event');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Created');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Gamma Team');

    // The list row never exposes the key value or copy controls.
    const gammaRow = page.locator('.admin-key-row').filter({ hasText: 'Gamma Team' });
    await gammaRow.locator('summary').click();
    await expect(gammaRow.locator('.admin-team-body')).toBeVisible();
    await expect(gammaRow.locator('.admin-key-status')).toHaveText('Active - team members can use this key to join rooms.');
    await expect(gammaRow.locator('code')).toHaveCount(0);
    await expect(gammaRow.getByRole('button', { name: 'Copy key' })).toHaveCount(0);

    // --- Rotate: a fresh key is revealed once, the old one is gone. ---
    const keyActionModal = page.locator('#key-action-modal');
    await gammaRow.getByRole('button', { name: 'Rotate key' }).click();
    await expect(keyActionModal).toBeVisible();
    await expect(keyActionModal).toContainText('Rotate team key?');
    await keyActionModal.getByRole('button', { name: 'Cancel' }).click();
    await expect(keyActionModal).toBeHidden();

    await gammaRow.getByRole('button', { name: 'Rotate key' }).click();
    await keyActionModal.getByRole('button', { name: 'Rotate key' }).click();
    await expect(keyActionModal).toBeHidden();
    await expect(revealModal).toBeVisible();

    const rotatedGammaKey = (await page.locator('#key-reveal-value').innerText()).trim();
    expect(rotatedGammaKey).toMatch(/^[A-Za-z0-9]{12}$/);
    expect(rotatedGammaKey).not.toBe(originalGammaKey);
    await page.locator('#key-reveal-close-button').click();
    await expect(revealModal).toBeHidden();
    await expect(page.locator('#admin-status')).toHaveText('Rotated key for Gamma Team.');
    await expect(page.locator('#activity-count')).toHaveText('2 events');
    await expect(page.locator('.admin-activity-item').first()).toContainText('Rotated');

    // --- Suspend and restore. ---
    await gammaRow.getByRole('button', { name: 'Suspend' }).click();
    await expect(keyActionModal).toBeVisible();
    await keyActionModal.getByRole('button', { name: 'Suspend key' }).click();
    await expect(keyActionModal).toBeHidden();
    await expect(page.locator('#admin-status')).toHaveText('Suspended Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 teams - 1 suspended');
    await expect(gammaRow.locator('.admin-team-status').first()).toHaveText('Suspended');

    await gammaRow.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Restored Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 teams');
    await expect(gammaRow.locator('.admin-team-status').first()).toHaveText('Active');

    // --- Remove. ---
    await gammaRow.getByRole('button', { name: 'Remove' }).click();
    await expect(keyActionModal).toBeVisible();
    await keyActionModal.getByRole('button', { name: 'Remove key' }).click();
    await expect(keyActionModal).toBeHidden();
    await expect(page.locator('#admin-status')).toHaveText('Removed Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('2 teams');
    await expect(page.locator('#activity-count')).toHaveText('5 events');
    await expect(gammaRow).toHaveCount(0);

    // The activity log never stores raw key values.
    await expect(page.locator('#activity-list')).not.toContainText(originalGammaKey);
    await expect(page.locator('#activity-list')).not.toContainText(rotatedGammaKey);

    // The invite link captured at creation still prefills the room form.
    await page.goto(inviteUrl);
    await expect(page.locator('#access-key-input')).toHaveValue(originalGammaKey);
    await expect(page.locator('#room-input')).toHaveValue('Sprint Planning');
    await expect(page.locator('#role-select')).toHaveValue('Voter');
    expect(page.url()).not.toContain('accessKey=');
  } finally {
    await server.stop();
  }
});
