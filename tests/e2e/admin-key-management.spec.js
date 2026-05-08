const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const adminKey = 'admin-browser-test-secret';

test('admin can unlock, create, copy, and remove access keys', async ({ page, context }) => {
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

    await expect(page.getByRole('heading', { name: 'Access keys' })).toBeVisible();
    await expect(page.locator('#keys-panel')).toBeHidden();

    await page.locator('#admin-key-input').fill('wrong-admin-key');
    await page.locator('#auth-form button[type="submit"]').click();
    await expect(page.locator('#admin-status')).toHaveText('Unauthorized.');
    await expect(page.locator('#keys-panel')).toBeHidden();

    await page.locator('#admin-key-input').fill(adminKey);
    await page.locator('#auth-form button[type="submit"]').click();

    await expect(page.locator('#keys-panel')).toBeVisible();
    await expect(page.locator('#admin-status')).toHaveText('Keys loaded.');
    await expect(page.locator('#key-count')).toHaveText('2 keys');
    await expect(page.locator('#keys-list')).toContainText('alpha');
    await expect(page.locator('#keys-list')).toContainText('browser');

    await page.locator('#key-name-input').fill('Gamma Team');
    await page.locator('#create-key-form button[type="submit"]').click();

    const gammaRow = page.locator('.admin-key-row').filter({ hasText: 'Gamma Team' });
    await expect(gammaRow).toBeVisible();
    await expect(page.locator('#admin-status')).toHaveText('Generated Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('3 keys');

    await gammaRow.getByRole('button', { name: 'Copy' }).click();
    await expect(page.locator('#admin-status')).toHaveText('Copied Gamma Team.');

    page.once('dialog', (dialog) => dialog.accept());
    await gammaRow.getByRole('button', { name: 'Remove' }).click();

    await expect(page.locator('#admin-status')).toHaveText('Removed Gamma Team.');
    await expect(page.locator('#key-count')).toHaveText('2 keys');
    await expect(gammaRow).toHaveCount(0);
  } finally {
    await server.stop();
  }
});
