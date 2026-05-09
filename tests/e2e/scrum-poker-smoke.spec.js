const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const testAccessKey = 'browser-test-key';

test('facilitator can enter a room, reveal, copy, start the next round, and reset', async ({ page, context }) => {
  const server = await startServer({
    keys: { browser: testAccessKey }
  });

  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: server.baseUrl });

    await page.goto(server.baseUrl);

    await expect(page.locator('#connection-status')).toHaveText('Connected');
    await expect(page.locator('#login-button')).toBeEnabled();
    const entryPanelHeights = await page.evaluate(() => {
      const loginPanel = document.querySelector('.entry-card').getBoundingClientRect();
      const previewPanel = document.querySelector('.entry-preview').getBoundingClientRect();
      return {
        login: loginPanel.height,
        preview: previewPanel.height
      };
    });
    expect(Math.abs(entryPanelHeights.login - entryPanelHeights.preview)).toBeLessThanOrEqual(1);

    await page.locator('#room-input').fill('browser-room');
    await page.locator('#name-input').fill('Alice');
    await page.locator('#role-select').selectOption('Facilitator');

    await page.locator('#access-key-input').fill('wrong-browser-key');
    await page.locator('#login-button').click();
    await expect(page.locator('#login-section')).toBeVisible();
    await expect(page.locator('#login-error')).toHaveText('Invalid access key.');

    await page.locator('#access-key-input').fill(testAccessKey);
    await page.locator('#login-button').click();

    await expect(page.locator('#poker-room-section')).toBeVisible();
    await expect(page.locator('#room-display')).toHaveText('Room: browser-room');
    await expect(page.locator('#user-greeting')).toHaveText('Hello, Alice (Facilitator)');
    await expect(page.locator('#admin-room-link')).toBeVisible();
    await expect(page.locator('#admin-room-link')).toHaveAttribute('href', '/admin');
    await expect(page.locator('#participants-list')).toContainText('Alice (You)');

    await page.locator('#admin-room-link').click();
    await expect(page).toHaveURL(`${server.baseUrl}/admin`);
    await expect(page.getByRole('heading', { name: 'Team access' })).toBeVisible();
    await expect(page.locator('.admin-room-link')).toHaveClass(/text-action/);
    await expect(page.locator('.admin-room-link')).not.toHaveClass(/secondary-action/);

    await page.locator('.admin-room-link').click();
    await expect(page.locator('#poker-room-section')).toBeVisible();
    await expect(page.locator('#room-display')).toHaveText('Room: browser-room');
    await expect(page.locator('#user-greeting')).toHaveText('Hello, Alice (Facilitator)');
    await expect(page.locator('#admin-room-link')).toBeVisible();
    await expect(page.locator('#round-item-form')).toHaveCount(0);
    await expect(page.locator('#current-item-display')).toHaveCount(0);

    const copyVoterInviteButton = page.locator('#copy-voter-invite-button');
    const copyObserverInviteButton = page.locator('#copy-observer-invite-button');
    await expect(copyVoterInviteButton).toBeVisible();
    await expect(copyObserverInviteButton).toBeVisible();

    await copyVoterInviteButton.click();
    await expect(copyVoterInviteButton).toHaveText('Copied voter invite');
    const copiedVoterInvite = await page.evaluate(() => navigator.clipboard.readText());
    const voterInviteUrl = new URL(copiedVoterInvite);
    expect(voterInviteUrl.origin).toBe(server.baseUrl);
    expect(voterInviteUrl.searchParams.get('accessKey')).toBe(testAccessKey);
    expect(voterInviteUrl.searchParams.get('room')).toBe('browser-room');
    expect(voterInviteUrl.searchParams.get('role')).toBe('Voter');

    await copyObserverInviteButton.click();
    await expect(copyObserverInviteButton).toHaveText('Copied observer invite');
    const copiedObserverInvite = await page.evaluate(() => navigator.clipboard.readText());
    const observerInviteUrl = new URL(copiedObserverInvite);
    expect(observerInviteUrl.origin).toBe(server.baseUrl);
    expect(observerInviteUrl.searchParams.get('accessKey')).toBe(testAccessKey);
    expect(observerInviteUrl.searchParams.get('room')).toBe('browser-room');
    expect(observerInviteUrl.searchParams.get('role')).toBe('Observer');

    const invitePage = await context.newPage();
    await invitePage.goto(copiedObserverInvite);
    await expect(invitePage.locator('#access-key-input')).toHaveValue(testAccessKey);
    await expect(invitePage.locator('#room-input')).toHaveValue('browser-room');
    await expect(invitePage.locator('#role-select')).toHaveValue('Observer');
    expect(invitePage.url()).not.toContain('accessKey=');
    await invitePage.close();

    await page.locator('button.vote-card[data-value="5"]').click();
    await expect(page.locator('button.vote-card[data-value="5"]')).toHaveClass(/selected/);

    await page.locator('#show-votes-button').click();
    await expect(page.locator('#vote-summary')).toBeVisible();
    await expect(page.locator('#average-vote')).toHaveText('5.0');
    await expect(page.locator('#result-item-name')).toHaveCount(0);
    await expect(page.locator('#ordered-votes-list')).toContainText('Alice');
    await expect(page.locator('#ordered-votes-list')).toContainText('5');
    await expect(page.locator('#round-history-section')).toHaveCount(0);
    await expect(page.locator('#copy-round-history-button')).toHaveCount(0);

    await expect(page.locator('#start-next-round-button')).toBeVisible();
    await expect(page.locator('#start-next-round-button')).toHaveText('Next Round');
    await page.locator('#start-next-round-button').click();
    await expect(page.locator('#vote-summary')).toBeHidden();
    await expect(page.locator('#ordered-votes')).toBeHidden();
    await expect(page.locator('#round-status')).toHaveText('Open');
    await expect(page.locator('#round-history-section')).toHaveCount(0);
    await expect(page.locator('button.vote-card[data-value="5"]')).not.toHaveClass(/selected/);

    await page.locator('button.vote-card[data-value="8"]').click();
    await expect(page.locator('button.vote-card[data-value="8"]')).toHaveClass(/selected/);
    await page.locator('#show-votes-button').click();
    await expect(page.locator('#vote-summary')).toBeVisible();
    await expect(page.locator('#average-vote')).toHaveText('8.0');
    await expect(page.locator('#ordered-votes-list')).toContainText('8');
    await expect(page.locator('#round-history-section')).toHaveCount(0);

    await page.locator('#reset-votes-button').click();
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('.vote-card .card-inner'));
      const firstCard = cards[0];
      const lastCard = cards[cards.length - 1];

      return cards.length > 0 &&
        lastCard.classList.contains('is-face-down') &&
        !firstCard.classList.contains('is-face-down');
    });
    await page.waitForFunction(() => {
      const cards = Array.from(document.querySelectorAll('.vote-card .card-inner'));
      return cards.length > 0 && cards.every((card) => card.classList.contains('is-face-down'));
    });
    await expect(page.locator('#vote-summary')).toBeHidden();
    await expect(page.locator('#round-history-section')).toHaveCount(0);
    await expect(page.locator('.vote-card .card-inner').first()).not.toHaveClass(/is-face-down/, { timeout: 6000 });
    await expect(page.locator('button.vote-card[data-value="5"]')).not.toHaveClass(/selected/);
  } finally {
    await server.stop();
  }
});
