const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

const roomName = 'multi-user-room';

async function loginAs(page, context, { sessionId, name, role }) {
  await injectSession(context, sessionId);
  await page.goto('/');

  await expect(page.locator('#connection-status')).toHaveText('Connected');
  await expect(page.locator('#login-button')).toBeEnabled();

  await page.locator('#room-input').fill(roomName);
  await page.locator('#name-input').fill(name);
  await page.locator('#role-select').selectOption(role);
  await page.locator('#login-button').click();

  await expect(page.locator('#poker-room-section')).toBeVisible();
  await expect(page.locator('#room-display')).toHaveText(`Room: ${roomName}`);
  await expect(page.locator('#user-greeting')).toHaveText(`Hello, ${name} (${role})`);
}

test('facilitator, voter, and observer room state stays synchronized', async ({ page, context }) => {
  // Seed three distinct sessions — all in the same (default) company so any one of them can log into the room.
  seedSession({ id: 's-alice', userId: 'u-alice' });
  seedSession({ id: 's-bob',   userId: 'u-bob' });
  seedSession({ id: 's-carol', userId: 'u-carol' });

  const facilitatorCtx = context;
  const voterCtx       = await page.context().browser().newContext();
  const observerCtx    = await page.context().browser().newContext();

  const facilitator = page;
  const voter       = await voterCtx.newPage();
  const observer    = await observerCtx.newPage();

  try {
    await loginAs(facilitator, facilitatorCtx, { sessionId: 's-alice', name: 'Alice', role: 'Facilitator' });
    await loginAs(voter,       voterCtx,       { sessionId: 's-bob',   name: 'Bob',   role: 'Voter' });
    await loginAs(observer,    observerCtx,    { sessionId: 's-carol', name: 'Carol', role: 'Observer' });

    await expect(facilitator.locator('#invite-menu-button')).toBeVisible();
    await expect(facilitator.locator('#end-session-button')).toBeVisible();
    await expect(voter.locator('#invite-menu-button')).toBeHidden();
    await expect(voter.locator('#end-session-button')).toBeHidden();
    await expect(observer.locator('#invite-menu-button')).toBeHidden();
    await expect(observer.locator('#end-session-button')).toBeHidden();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#participants-list')).toContainText('Alice');
      await expect(roomPage.locator('#participants-list')).toContainText('Bob');
      await expect(roomPage.locator('#participants-list')).toContainText('Carol');
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
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Alice');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('Bob');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('8');
      await expect(roomPage.locator('#ordered-votes-list')).toContainText('5');
    }

    // Revealed participant cards must render the vote value, not the deck back.
    const bobVoteFace = facilitator.locator('.participant-row').filter({ hasText: 'Bob' })
      .locator('.participant-vote .card-face', { hasText: '8' });
    await expect(bobVoteFace).toHaveCount(1);
    const bobVoteRendering = await bobVoteFace.evaluate((el) => {
      const style = getComputedStyle(el);
      return { color: style.color, backgroundImage: style.backgroundImage };
    });
    expect(bobVoteRendering.backgroundImage).toBe('none');
    expect(bobVoteRendering.color).not.toMatch(/,\s*0\)$/);

    await expect(facilitator.locator('#start-next-round-button')).toBeVisible();
    await expect(voter.locator('#start-next-round-button')).toBeHidden();
    await expect(observer.locator('#start-next-round-button')).toBeHidden();

    await facilitator.locator('#start-next-round-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeHidden();
      await expect(roomPage.locator('#ordered-votes')).toBeHidden();
      await expect(roomPage.locator('#round-status')).toHaveText('Open');
      await expect(roomPage.locator('button.vote-card[data-value="5"]')).not.toHaveClass(/selected/);
      await expect(roomPage.locator('button.vote-card[data-value="8"]')).not.toHaveClass(/selected/);
    }

    await facilitator.locator('button.vote-card[data-value="3"]').click();
    await voter.locator('button.vote-card[data-value="5"]').click();
    await facilitator.locator('#show-votes-button').click();

    for (const roomPage of [facilitator, voter, observer]) {
      await expect(roomPage.locator('#vote-summary')).toBeVisible();
      await expect(roomPage.locator('#average-vote')).toHaveText('4.0');
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
    await voterCtx.close();
    await observerCtx.close();
  }
});

test('voter automatically rejoins after a transient disconnect', async ({ browser }) => {
  seedSession({ id: 's-fac', userId: 'u-fac' });
  seedSession({ id: 's-voter', userId: 'u-voter' });

  const facilitatorContext = await browser.newContext();
  const voterContext       = await browser.newContext();
  const facilitator        = await facilitatorContext.newPage();
  const voter              = await voterContext.newPage();

  try {
    await loginAs(facilitator, facilitatorContext, { sessionId: 's-fac',   name: 'Alice', role: 'Facilitator' });
    await loginAs(voter,       voterContext,       { sessionId: 's-voter', name: 'Bob',   role: 'Voter' });

    await voter.evaluate(() => window.eval('ws.close()'));
    await expect(voter.locator('#connection-status')).toHaveText('Disconnected', { timeout: 7000 });
    await expect(voter.locator('#login-error')).toHaveText('Connection lost. Reconnecting...');
    await expect(facilitator.locator('#participants-list')).not.toContainText('Bob');

    await expect(voter.locator('#poker-room-section')).toBeVisible({ timeout: 12000 });
    await expect(voter.locator('#room-display')).toHaveText(`Room: ${roomName}`);
    await expect(voter.locator('#user-greeting')).toHaveText('Hello, Bob (Voter)');
    await expect(facilitator.locator('#participants-list')).toContainText('Bob');

    // Logout now navigates to hub logout (unreachable in e2e env) — skip that assertion.
    // The auto-reconnect behaviour (above) is the intent of this test.
  } finally {
    await voterContext.close();
    await facilitatorContext.close();
  }
});
