const path = require('path');
module.exports = require('@playwright/test').defineConfig({
  testDir: './tests/e2e',
  // One server and one sessions DB are shared by the whole suite, and the specs
  // seed a fixed session id, so concurrent files delete each other's auth row
  // mid-test. fullyParallel only serialises within a file; this serialises across.
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  timeout: 30 * 1000,
  use: {
    baseURL: 'http://127.0.0.1:3066',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3066/health',
    reuseExistingServer: false,
    env: {
      PORT: '3066',
      APP_NAME: 'poker',
      HUB_BASE_URL: 'http://127.0.0.1:9',
      HUB_API_KEY: 'test',
      APP_SESSIONS_DB: path.join(__dirname, 'tests', 'e2e', '.data', 'poker-sessions.db'),
    },
  },
});
