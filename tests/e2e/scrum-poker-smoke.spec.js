const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const testAccessKey = 'browser-test-key';

test('facilitator can enter a room, vote, reveal, and reset', async ({ page }) => {
  const server = await startServer({
    keys: { browser: testAccessKey }
  });

  try {
    await page.goto(server.baseUrl);

    await expect(page.locator('#connection-status')).toHaveText('Connected');
    await expect(page.locator('#login-button')).toBeEnabled();

    await page.locator('#access-key-input').fill(testAccessKey);
    await page.locator('#room-input').fill('browser-room');
    await page.locator('#name-input').fill('Alice');
    await page.locator('#role-select').selectOption('Facilitator');
    await page.locator('#login-button').click();

    await expect(page.locator('#poker-room-section')).toBeVisible();
    await expect(page.locator('#room-display')).toHaveText('Room: browser-room');
    await expect(page.locator('#user-greeting')).toHaveText('Hello, Alice (Facilitator)');
    await expect(page.locator('#participants-list')).toContainText('Alice (You)');

    await page.locator('button.vote-card[data-value="5"]').click();
    await expect(page.locator('button.vote-card[data-value="5"]')).toHaveClass(/selected/);

    await page.locator('#show-votes-button').click();
    await expect(page.locator('#vote-summary')).toBeVisible();
    await expect(page.locator('#average-vote')).toHaveText('5.0');
    await expect(page.locator('#ordered-votes-list')).toContainText('Alice');
    await expect(page.locator('#ordered-votes-list')).toContainText('5');

    await page.locator('#reset-votes-button').click();
    await expect(page.locator('#vote-summary')).toBeHidden();
    await expect(page.locator('button.vote-card[data-value="5"]')).not.toHaveClass(/selected/);
  } finally {
    await server.stop();
  }
});
