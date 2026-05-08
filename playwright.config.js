const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  timeout: 30 * 1000,
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    trace: 'retain-on-failure'
  }
});
