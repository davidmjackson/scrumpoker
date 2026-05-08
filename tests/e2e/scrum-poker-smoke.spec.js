const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '../..');
const testAccessKey = 'browser-test-key';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, getLogs) {
  const deadline = Date.now() + 5000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
      lastError = new Error(`Health returned ${response.status}`);
    } catch (err) {
      lastError = err;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server did not become healthy: ${lastError?.message || 'unknown error'}\n${getLogs()}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function startServer() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scrumpoker-e2e-'));
  const keysFile = path.join(tempDir, 'keys.json');
  fs.writeFileSync(keysFile, JSON.stringify({ browser: testAccessKey }), 'utf8');

  const port = await getFreePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      SCRUM_POKER_KEYS_FILE: keysFile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });

  await waitForHealth(port, () => output);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async stop() {
      await stopProcess(child);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('facilitator can enter a room, vote, reveal, and reset', async ({ page }) => {
  const server = await startServer();

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
