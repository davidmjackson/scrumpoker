const { test, expect } = require('@playwright/test');
const { startServer } = require('./helpers/test-server');

const testAccessKey = 'multi-user-test-key';
const roomName = 'multi-user-room';

async function login(page, baseUrl, { name, role }) {
  await page.goto(baseUrl);

  await expect(page.locator('#connection-status')).toHaveText('Connected');
  await expect(page.locator('#login-button')).toBeEnabled();

  await page.locator('#access-key-input').fill(testAccessKey);
  await page.locator('#room-input').fill(roomName);
  await page.locator('#name-input').fill(name);
  await page.locator('#role-select').selectOption(role);
  await page.locator('#login-button').click();

  await expect(page.locator('#poker-room-section')).toBeVisible();
  await expect(page.locator('#room-display')).toHaveText(`Room: ${roomName}`);
  await expect(page.locator('#user-greeting')).toHaveText(`Hello, ${name} (${role})`);
}

async function closeCurrentWebSocket(page) {
  await page.evaluate(() => window.eval('ws.close()'));
}

test('facilitator, voter, and observer room state stays synchronized', async ({ page, context }) => {
  const server = await startServer({
    keys: { multi: testAccessKey }
  });

  const facilitator = page;
  const voter = await context.newPage();
  const observer = await context.newPage();

  try {
    await login(facilitator, server.baseUrl, { name: 'Alice', role: 'Facilitator' });
    await login(voter, server.baseUrl, { name: 'Bob', role: 'Voter' });
    await login(observer, server.baseUrl, { name: 'Carol', role: 'Observer' });

    await expect(facilitator.locator('#admin-room-link')).toBeVisible();
    await expect(voter.locator('#admin-room-link')).toBeHidden();
    await expect(observer.locator('#admin-room-link')).toBeHidden();
    await expect(facilitator.locator('#copy-voter-invite-button')).toBeVisible();
    await expect(facilitator.locator('#copy-observer-invite-button')).toBeVisible();
    await expect(facilitator.locator('#end-session-button')).toBeVisible();
    await expect(voter.locator('#copy-voter-invite-button')).toBeHidden();
    await expect(voter.locator('#copy-observer-invite-button')).toBeHidden();
    await expect(voter.locator('#end-session-button')).toBeHidden();
    await expect(observer.locator('#copy-voter-invite-button')).toBeHidden();
    await expect(observer.locator('#copy-observer-invite-button')).toBeHidden();
    await expect(observer.locator('#end-session-button')).toBeHidden();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#participants-list')).toContainText('Alice');
      await expect(roomPage.locator('#participants-list')).toContainText('Bob');
      await expect(roomPage.locator('#participants-list')).toContainText('Carol');
      await expect(roomPage.locator('#round-item-form')).toHaveCount(0);
      await expect(roomPage.locator('#current-item-display')).toHaveCount(0);
    }

    await expect(observer.locator('#observer-message')).toBeVisible();
    await expect(observer.locator('button.vote-card[data-value="8"]')).toBeDisabled();

    await facilitator.locator('button.vote-card[data-value="5"]').click();
    await voter.locator('button.vote-card[data-value="8"]').click();
    await expect(facilitator.locator('button.vote-card[data-value="5"]')).toHaveClass(/selected/);
    await expect(voter.locator('button.vote-card[data-value="8"]')).toHaveClass(/selected/);

    await facilitator.locator('#show-votes-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeVisible();
      await expect(roomPage.locator('#average-vote')).toHaveText('6.5');
      await expect(roomPage.locator('#round-history-section')).toHaveCount(0);
      await expect(roomPage.locator('#copy-round-history-button')).toHaveCount(0);
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Alice');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Bob');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('8');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('5');
    }

    await expect(facilitator.locator('#start-next-item-button')).toBeVisible();
    await expect(voter.locator('#start-next-item-button')).toBeHidden();
    await expect(observer.locator('#start-next-item-button')).toBeHidden();

    await facilitator.locator('#start-next-item-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeHidden();
      await expect(roomPage.locator('#ordered-votes')).toBeHidden();
      await expect(roomPage.locator('#round-status')).toHaveText('Open');
      await expect(roomPage.locator('#round-history-section')).toHaveCount(0);
      await expect(roomPage.locator('button.vote-card[data-value="5"]')).not.toHaveClass(/selected/);
      await expect(roomPage.locator('button.vote-card[data-value="8"]')).not.toHaveClass(/selected/);
    }

    await facilitator.locator('button.vote-card[data-value="3"]').click();
    await voter.locator('button.vote-card[data-value="5"]').click();
    await facilitator.locator('#show-votes-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeVisible();
      await expect(roomPage.locator('#average-vote')).toHaveText('4.0');
      await expect(roomPage.locator('#round-history-section')).toHaveCount(0);
    }

    await facilitator.locator('#reset-votes-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeHidden();
      await expect(roomPage.locator('#ordered-votes')).toBeHidden();
    }
    await expect(voter.locator('button.vote-card[data-value="8"]')).not.toHaveClass(/selected/);

    const carolRow = facilitator.locator('.participant-row').filter({ hasText: 'Carol' });
    await carolRow.locator('.participant-role-select').selectOption('Voter');

    await expect(observer.locator('#user-greeting')).toHaveText('Hello, Carol (Voter)');
    await expect(observer.locator('#observer-message')).toBeHidden();
    await expect(observer.locator('button.vote-card[data-value="?"]')).toBeEnabled();

    await observer.locator('button.vote-card[data-value="?"]').click();
    await expect(observer.locator('button.vote-card[data-value="?"]')).toHaveClass(/selected/);

    await facilitator.locator('#end-session-button').click();
    await expect(facilitator.locator('#end-session-modal')).toBeVisible();
    await facilitator.locator('#cancel-end-session-button').click();
    await expect(facilitator.locator('#end-session-modal')).toBeHidden();

    await facilitator.locator('#end-session-button').click();
    await facilitator.locator('#confirm-end-session-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#login-section')).toBeVisible();
      await expect(roomPage.locator('#login-error')).toHaveText('Session ended by facilitator.');
    }
  } finally {
    await server.stop();
  }
});

test('voter automatically rejoins after a transient disconnect', async ({ browser }) => {
  const server = await startServer({
    keys: { multi: testAccessKey }
  });

  const facilitatorContext = await browser.newContext();
  const voterContext = await browser.newContext();
  const facilitator = await facilitatorContext.newPage();
  const voter = await voterContext.newPage();

  try {
    await login(facilitator, server.baseUrl, { name: 'Alice', role: 'Facilitator' });
    await login(voter, server.baseUrl, { name: 'Bob', role: 'Voter' });

    await expect(voter.locator('#round-item-form')).toHaveCount(0);
    await expect(voter.locator('#current-item-display')).toHaveCount(0);

    await closeCurrentWebSocket(voter);
    await expect(voter.locator('#connection-status')).toHaveText('Disconnected', { timeout: 7000 });
    await expect(voter.locator('#login-error')).toHaveText('Connection lost. Reconnecting...');
    await expect(facilitator.locator('#participants-list')).not.toContainText('Bob');

    await expect(voter.locator('#poker-room-section')).toBeVisible({ timeout: 12000 });
    await expect(voter.locator('#room-display')).toHaveText(`Room: ${roomName}`);
    await expect(voter.locator('#user-greeting')).toHaveText('Hello, Bob (Voter)');
    await expect(voter.locator('#current-item-display')).toHaveCount(0);
    await expect(facilitator.locator('#participants-list')).toContainText('Bob');

    await voter.locator('#logout-button').click();
    await expect(voter.locator('#login-section')).toBeVisible();
    await expect(facilitator.locator('#participants-list')).not.toContainText('Bob');

    await closeCurrentWebSocket(voter);
    await expect(voter.locator('#connection-status')).toHaveText('Disconnected', { timeout: 7000 });
    await expect(voter.locator('#login-section')).toBeVisible({ timeout: 12000 });
    await expect(voter.locator('#poker-room-section')).toBeHidden();
    await expect(voter.locator('#login-button')).toBeEnabled({ timeout: 12000 });
    await expect(facilitator.locator('#participants-list')).not.toContainText('Bob');
  } finally {
    await voterContext.close();
    await facilitatorContext.close();
    await server.stop();
  }
});
