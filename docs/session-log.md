# Scrum Poker Session Log

## 2026-05-08 - Development Kickoff

Branch: `feature/scrum-poker-baseline`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before kickoff: `master`
- Latest baseline commit: `f4a0091 Reduce scanner noise in frontend comments`
- Working tree at kickoff: untracked `docs/` directory containing `docs/scrum-poker-handover.md`
- Server status: no `node server.js` process was running

Last verified baseline from the handover:
- Live root page returned `200 OK`
- Live WebSocket opened and returned a `yourId` message
- `node --check server.js` passed
- `node --check public/js/app.js` passed
- `npm test` failed because no test script exists
- `npm audit --omit=dev` reported 4 production dependency vulnerabilities

Recommended next steps:
- Commit the handover and session log on a feature branch.
- Add focused baseline coverage for current WebSocket behavior.
- Add a `/health` endpoint.
- Review dependency audit findings and remove unused dependencies where practical.
- Use the Retrospective design and structure patterns for later UI and architecture work.

Work completed:
- Created and committed kickoff docs in `b68973f Add Scrum Poker kickoff docs`.
- Added `SCRUM_POKER_KEYS_FILE` so tests and future deployments can point at an explicit keys file without exposing local secrets.
- Added `/health`, returning status, uptime, and active room count.
- Added `npm test` using Node's built-in test runner.
- Added WebSocket baseline tests for health, login, facilitator/voter/observer behavior, voting, reveal, reset, role restrictions, and invalid access keys.
- Removed unused `animejs` and ran `npm audit fix`, updating vulnerable production transitive dependencies.

Verification:
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Actions CI

Branch: `feature/github-actions-ci`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `e7eda7e Add Scrum Poker baseline tests`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Add a GitHub Actions workflow that runs the established local baseline checks on pushes and pull requests.
- Keep Bitbucket as a backup remote while GitHub remains the primary `origin`.

Work completed:
- Added `.github/workflows/ci.yml`.
- Configured CI to run on pull requests to `main`/`master` and pushes to `main`, `master`, and `feature/**`.
- CI installs with `npm ci`, checks JavaScript syntax, runs `npm test`, and audits production dependencies.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Deployment Documentation

Branch: `feature/github-deployment-docs`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `4f574c6 Add GitHub Actions CI`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Document GitHub as the primary deployment source.
- Keep the old Bitbucket remote documented as a temporary backup.
- Capture production pull, verification, runtime, and health-check steps.

Work completed:
- Added `docs/deployment.md`.
- Linked the deployment runbook from `README.md`.

Verification:
- `node --check server.js`
- `node --check public/js/app.js`
- `node --check tests/ws-operations.test.js`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Room State Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `24a9f84 Document GitHub deployment workflow`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract room lifecycle and room-state projection helpers from `server.js`.
- Preserve current WebSocket behavior under the existing baseline tests.
- Add direct unit coverage for the extracted helper module.

Work completed:
- Added `lib/roomState.js` for room creation, join/leave, expiry, state projection, and facilitator assignment/reassignment.
- Updated `server.js` to use the extracted helpers and a local room-broadcast helper.
- Added `tests/room-state.test.js` with focused helper coverage.
- Updated GitHub Actions and deployment docs to syntax-check the helper module and all test files.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check lib/roomState.js`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 11 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Access Key Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `feature/extract-room-state`
- Latest baseline commit: `089bd12 Extract room state helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract access-key file path resolution, loading, validation, and internal room naming from `server.js`.
- Preserve the current key-file behavior used by the WebSocket login flow.
- Add direct unit coverage for access-key helpers.

Work completed:
- Added `lib/accessKeys.js`.
- Updated `server.js` to use the access-key helper module.
- Added `tests/access-keys.test.js`.
- Updated GitHub Actions and deployment docs to syntax-check all helper modules in `lib/*.js`.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 18 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Role Helper Extraction

Branch: `feature/extract-room-state`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `feature/extract-room-state`
- Latest baseline commit: `5763c84 Extract access key helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Centralize server-side role names and role permission checks.
- Preserve current role behavior and existing user-facing error messages.
- Add direct unit coverage for role helpers.

Work completed:
- Added `lib/roles.js`.
- Updated `server.js` to use role helpers for role validation, voting permission, facilitator-only actions, role change permission, and duplicate facilitator login handling.
- Updated `lib/roomState.js` to use the shared facilitator role constant.
- Added `tests/roles.test.js`.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 25 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - WebSocket Handler Extraction

Branch: `feature/extract-ws-handlers`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `15a8575 Extract role permission helpers`
- Working tree: clean
- Server status: no `node server.js` process was running

Work planned:
- Extract WebSocket message handler logic from `server.js`.
- Preserve login, voting, reveal/reset, role-change, logout, disconnect, and error cleanup behavior.
- Add direct unit coverage for the extracted handler module.

Work completed:
- Added `lib/wsHandlers.js` for login, voting, reveal/reset, role-change, and participant-exit handling.
- Updated `server.js` so the WebSocket switch delegates to the handler module while retaining transport and broadcast helpers locally.
- Added `tests/ws-handlers.test.js` with focused coverage for handler decisions and room-state effects.

Verification:
- `npm ci`
- `node --check server.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `node --check public/js/app.js`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 31 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - Admin Access Key Management

Branch: `feature/admin-key-management`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `925a962 Extract WebSocket handlers`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #1 was merged, main CI passed, and `feature/extract-ws-handlers` was deleted locally and remotely.

Work planned:
- Start moving terminal-only access key management into the app.
- Keep the existing `keys.json` format and CLI compatible.
- Guard in-app key management behind an explicit admin secret.

Work completed:
- Extended `lib/accessKeys.js` with strict key-store reads/writes, generated key creation, sorted listing, deletion, and constant-time admin-key comparison.
- Updated `manageKeys.js` to use the shared access-key helper module and honor `SCRUM_POKER_KEYS_FILE`.
- Added authenticated admin API endpoints for listing, generating, and removing access keys.
- Added `public/admin.html` and `public/js/admin.js` for a small in-app access-key manager at `/admin`.
- Added admin UI styles to `public/css/app.css`.
- Updated CI, README, and deployment docs for `SCRUM_POKER_ADMIN_KEY` and the new browser/CLI syntax checks.
- Added helper and HTTP integration coverage for admin key management.

Verification:
- `npm ci`
- `node --check server.js`
- `node --check manageKeys.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `for file in public/js/*.js; do node --check "$file"; done`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- All checks passed.
- `npm test` ran 39 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Test server processes were started by the test suite and stopped during cleanup.
- No project `node server.js` process was left running.

## 2026-05-08 - GitHub Actions Node 24 Update

Branch: `feature/update-ci-node24`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `be5aa8b Add admin access key management`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #2 was merged, main CI passed, and `feature/admin-key-management` was deleted locally and remotely.

Work planned:
- Remove the GitHub Actions Node 20 deprecation warning.
- Test the project on the upcoming Node 24 runtime before GitHub changes the default action runtime.

Work completed:
- Updated CI to use `actions/checkout@v6`.
- Updated CI to use `actions/setup-node@v6`.
- Updated CI's Node runtime from `20` to `24`.
- Added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` to the CI job environment.
- Documented the Node 24 CI runtime in the deployment runbook.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `for file in lib/*.js; do node --check "$file"; done`
- `for file in public/js/*.js; do node --check "$file"; done`
- `for file in tests/*.test.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`

Result:
- Local checks passed on Node.js `v20.19.6`.
- GitHub Actions CI passed on Node.js 24 for PR #3.
- No project `node server.js` process was left running.

## 2026-05-08 - Browser Smoke Test Coverage

Branch: `feature/browser-smoke-tests`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c480b82 Update CI to Node 24`
- Working tree: clean
- Server status: no `node server.js` process was running
- GitHub PR #3 was merged, main CI passed on Node.js 24, and `feature/update-ci-node24` was deleted locally and remotely.

Work planned:
- Add browser-level coverage before making larger UI changes.
- Exercise the current page login, vote, reveal, and reset wiring through a real browser.
- Include the browser smoke test in CI.

Work completed:
- Added Playwright as a development dependency.
- Added `playwright.config.js`.
- Added `npm run test:e2e`.
- Added `tests/e2e/scrum-poker-smoke.spec.js`, which starts the app with a temporary keys file and drives the facilitator workflow in Chromium.
- Updated CI to install Chromium and run the browser smoke test.
- Updated deployment verification docs for Playwright checks and e2e execution.
- Ignored Playwright output directories in `.gitignore`.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm audit --omit=dev`
- `npx playwright install chromium`
- `npm run test:e2e`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- `npx playwright install chromium` completed locally.
- After the host Chromium dependencies were installed, `npm run test:e2e` passed locally with 1 browser smoke test.
- GitHub Actions CI passed, including `npm run test:e2e` in Chromium after `npx playwright install --with-deps chromium`.
- No project `node server.js` process was left running.
