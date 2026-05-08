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
    await expect(voter.locator('#round-item-form')).toBeHidden();
    await expect(observer.locator('#round-item-form')).toBeHidden();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#participants-list')).toContainText('Alice');
      await expect(roomPage.locator('#participants-list')).toContainText('Bob');
      await expect(roomPage.locator('#participants-list')).toContainText('Carol');
    }

    await facilitator.locator('#round-item-input').fill('Payment retry story');
    await facilitator.locator('#round-item-form').getByRole('button', { name: 'Set item' }).click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#current-item-display')).toHaveText('Payment retry story');
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
      await expect(roomPage.locator('#round-history-list')).toContainText('Payment retry story');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Alice');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Bob');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('8');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('5');
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

    await voter.locator('#logout-button').click();
    await expect(voter.locator('#login-section')).toBeVisible();
    await expect(facilitator.locator('#participants-list')).not.toContainText('Bob');

    await observer.close();
    await expect(facilitator.locator('#participants-list')).not.toContainText('Carol');
  } finally {
    await server.stop();
  }
});
