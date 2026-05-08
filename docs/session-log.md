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

## 2026-05-08 - Login UI Foundation

Branch: `feature/ui-login-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `fc389e5 Add browser smoke test`
- Working tree: clean before the UI branch changes
- Server status: no `node server.js` process was running
- GitHub PR #4 was merged, main CI passed, and `feature/browser-smoke-tests` was deleted locally and remotely.

Work planned:
- Start the UI rebuild with a narrow login-screen-only slice.
- Preserve existing DOM IDs and app behavior so the current JavaScript and smoke test remain valid.
- Leave the in-room poker interface untouched for a later UI pass.

Work completed:
- Rebuilt the login screen markup in `public/index.html` around a two-column entry shell.
- Added tokenized app shell, form, footer, and planning-card preview styles in `public/css/app.css`.
- Preserved `connection-status`, login form IDs, `login-button`, `login-error`, and the existing poker room markup IDs.
- Adjusted the mobile footer and preview-card layout after screenshot review so the footer does not overlap content and sample cards stay inside the preview stage.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed at desktop `1440x900` and mobile `390x844`.
- Local preview checked at `http://localhost:3001`.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Preview server was started on port `3001` for local review.

## 2026-05-08 - Room UI Foundation

Branch: `feature/room-ui-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `b556038 Add login UI foundation (#5)`
- Working tree: clean before the room UI branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #5 was merged, main CI passed, and `feature/ui-login-foundation` was deleted remotely.

Work planned:
- Continue the UI rebuild with a narrow in-room screen slice.
- Preserve existing DOM IDs and WebSocket behavior covered by the Playwright smoke test.
- Keep the login screen from the previous slice unchanged.

Work completed:
- Rebuilt the in-room poker markup in `public/index.html` with room header, vote panel, participants panel, results panels, and facilitator controls.
- Added room, participant, result, modal, and action button styling in `public/css/app.css`.
- Updated generated voting cards, participant rows, role controls, and grouped result rows in `public/js/app.js` to use app-owned classes.
- Added scroll reset when switching between login and room views so mobile users land at the top of the target screen.
- Reviewed room screenshots at desktop `1440x900` and mobile `390x844` using a temporary access key server.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed for room and revealed-results states.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Preview server remained available on port `3001` for local review.

## 2026-05-08 - Admin UI Foundation

Branch: `feature/admin-ui-foundation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `6c1a421 Add room UI foundation (#6)`
- Working tree: clean before the admin UI branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #6 was merged, main CI passed, and `feature/room-ui-foundation` was deleted remotely.

Work planned:
- Finish the visible UI rebuild by refreshing `/admin`.
- Preserve the existing admin API and key-management behavior.
- Remove the now-unused Tailwind stylesheet dependency after confirming login and room screens use app-owned CSS.
- Refresh stale CSP documentation.

Work completed:
- Rebuilt `public/admin.html` around the shared app visual language.
- Updated generated admin key rows and copy fallback behavior in `public/js/admin.js`.
- Replaced the old admin-specific button/form styling with shared action, field, panel, and token styles in `public/css/app.css`.
- Removed the unused Tailwind stylesheet link from `public/index.html`.
- Deleted `public/css/tailwind.min.css`.
- Updated `README.md` and `docs/scrum-poker-handover.md` so CSP and Tailwind notes match the current code.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- Browser screenshots reviewed for locked admin, unlocked admin desktop/mobile, and login without Tailwind.

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 1 browser smoke test.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- Temporary admin screenshot server used `SCRUM_POKER_ADMIN_KEY` and a temporary keys file only.

## 2026-05-08 - Admin Browser Coverage

Branch: `feature/admin-browser-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c07e312 Add admin UI foundation (#7)`
- Working tree: clean before the browser coverage branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #7 was merged, main CI passed, and `feature/admin-ui-foundation` was deleted remotely.

Work planned:
- Add dedicated browser coverage for the refreshed `/admin` workflow.
- Keep the existing Scrum Poker browser smoke test intact.
- Avoid duplicating temporary server setup across Playwright specs.

Work completed:
- Added `tests/e2e/helpers/test-server.js` for shared temporary server setup with disposable key files and optional admin key configuration.
- Updated `tests/e2e/scrum-poker-smoke.spec.js` to use the shared server helper.
- Added `tests/e2e/admin-key-management.spec.js` covering unauthorized unlock, valid unlock, key listing, key generation, copy action, and key removal.
- Granted Chromium clipboard permissions in the admin spec so the copy path is deterministic.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 2 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Multi-User Browser Coverage

Branch: `feature/multi-user-browser-coverage`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `c98e858 Add admin browser coverage (#8)`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #8 was merged, main CI passed, and `feature/admin-browser-coverage` was deleted remotely.

Work planned:
- Add browser coverage for multiple users sharing one room.
- Cover facilitator, voter, and observer behavior in the same realtime room.
- Verify reveal/reset synchronization, role changes, logout, and disconnect behavior.

Work completed:
- Added `tests/e2e/multi-user-room.spec.js`.
- The spec starts a temporary server with a disposable access key.
- It logs in Alice as facilitator, Bob as voter, and Carol as observer.
- It verifies participant lists sync across clients.
- It verifies observer vote restrictions.
- It verifies facilitator/voter voting, reveal average `6.5`, grouped results, reset, facilitator role change, logout removal, and disconnect removal.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `npx playwright test tests/e2e/multi-user-room.spec.js`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/multi-user-room.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Client Error Handling Cleanup

Branch: `feature/client-error-cleanup`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `727cee1 Add multi-user browser coverage`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #9 was merged, main CI passed, and `feature/multi-user-browser-coverage` was deleted remotely.

Work planned:
- Keep the next slice small after the browser-coverage merge.
- Improve client-side inline error handling without changing the room workflow.
- Remove stale browser helpers and duplicate WebSocket event logging from `public/js/app.js`.
- Add browser coverage for invalid access-key feedback on the login screen.

Work completed:
- Added shared login and vote error helpers in `public/js/app.js`.
- Preserved connection errors when returning to the login screen instead of hiding them immediately.
- Replaced the disconnected-send alert fallback with inline login feedback.
- Removed unused saved-session reads, hostname logging, duplicate WebSocket event listeners, and unused hidden-field/reload helpers.
- Extended the browser smoke test so it first verifies an invalid access key shows `Invalid access key.` and keeps the user on the login screen.

Verification:
- `node --check public/js/app.js`
- `node --check tests/e2e/scrum-poker-smoke.spec.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - HTTP App Extraction

Branch: `feature/http-app-extraction`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `797e05a Clean up client error handling`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #10 was merged, main CI passed, and `feature/client-error-cleanup` was deleted remotely.

Work planned:
- Continue reducing monolith risk with a structural server cleanup.
- Move Express, static file, security header, admin API, and health route setup out of `server.js`.
- Keep WebSocket room behavior and existing route responses unchanged.

Work completed:
- Added `lib/httpApp.js` with `createHttpApp`.
- Moved CSP/security headers, no-cache headers, static file serving, licence routes, admin key routes, admin-key authorization, access-key API error mapping, and `/health` into the HTTP app helper.
- Updated `server.js` to create the HTTP app with `publicDir`, `keysFile`, `adminKey`, and a `getRoomCount` callback.
- Reduced `server.js` from 347 lines to 179 lines while keeping WebSocket setup in place.

Verification:
- `node --check server.js`
- `node --check lib/httpApp.js`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - WebSocket Server Extraction

Branch: `feature/ws-server-extraction`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `d13426f Extract HTTP app setup`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #11 was merged, main CI passed, and `feature/http-app-extraction` was deleted remotely.

Work planned:
- Continue reducing `server.js` to startup wiring only.
- Move WebSocket server creation, client messaging helpers, participant state, and message dispatch into a focused helper.
- Keep existing realtime room behavior unchanged.

Work completed:
- Added `lib/wsServer.js` with `createWsServer`.
- Moved WebSocket setup, `sendToClient`, `sendToRoom`, `sendRoomState`, participant storage, connection handling, message parsing, dispatch, close cleanup, and error cleanup out of `server.js`.
- Updated `server.js` to call `createWsServer({ server, rooms, keysFile })`.
- Reduced `server.js` from 179 lines to 56 lines.

Verification:
- `node --check server.js`
- `node --check lib/wsServer.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Reset Card Flip Animation

Branch: `feature/reset-card-flip-animation`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `25afd37 Extract WebSocket server setup`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- GitHub PR #12 was merged, main CI passed, and `feature/ws-server-extraction` was deleted remotely.

Work planned:
- Add the missing first half of the reset animation.
- When votes are reset after reveal, flip the voting deck face-down from right to left first.
- After all cards are face-down, keep the existing left-to-right face-up animation.
- Keep reset behavior and vote state unchanged.

Work completed:
- Added reusable card flip timing helpers in `public/js/app.js`.
- Detect the revealed-to-hidden reset state transition before re-rendering the room UI.
- Delay the reset UI refresh until the existing deck has flipped face-down right-to-left.
- Reuse the existing face-up animation after the reset state renders.
- Disabled the reset button immediately after a facilitator clicks it to prevent repeated reset clicks during the animation.
- Extended the browser smoke test to verify the right-to-left face-down phase and the final face-up state.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js` passed with 1 browser test.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Reset Animation Visibility Follow-Up

Branch: `feature/reset-animation-visible`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `f4d42ea Animate reset card flip sequence`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User reported that the reset animation change was not visible after refreshing with F5.

Work planned:
- Make the reset face-down phase visibly start as soon as the facilitator clicks `Reset Votes`.
- Keep the two-phase sequence: right-to-left face-down, then left-to-right face-up.
- Preserve behavior for other connected users.

Work completed:
- Added a local reset animation guard so the facilitator starts the face-down phase before the reset WebSocket message is sent.
- Delayed sending `resetVotes` until the local face-down phase completes.
- Kept non-clicking clients on the state-update-driven face-down animation path.
- Slightly increased the reset stagger and turnaround timing so the right-to-left pass is easier to see.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- Focused reset animation browser test passed.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Client Card Deck Module

Branch: `feature/client-card-deck-module`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `949efec Make reset animation visible immediately`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User confirmed the reset animation fix was working.

Work planned:
- Start reducing the size of `public/js/app.js` with a low-risk browser-side extraction.
- Move voting-card DOM creation and card flip animation timing into a focused helper.
- Keep existing script loading CSP-friendly and avoid changing runtime behavior.

Work completed:
- Added `public/js/cardDeck.js` with a `ScrumPokerCardDeck` browser namespace.
- Moved voting card creation into `createVotingCard`.
- Moved card flip timer management and reset/entry animation sequencing into `createCardAnimator`.
- Updated `public/index.html` to load `cardDeck.js` before `app.js`.
- Updated `public/js/app.js` to call the card deck helper for rendering and animation while preserving existing room state behavior.

Verification:
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- `for file in lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npm test`
- `npx playwright test tests/e2e/scrum-poker-smoke.spec.js`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax checks passed.
- `npm test` ran 39 tests successfully.
- Focused browser smoke test passed.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Invites

Branch: `feature/admin-team-invites`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `1ec3246 Extract client card deck helper`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`
- User asked for an admin/facilitator-oriented way to create teams and keys, then copy details into Teams or another communication app.

Work planned:
- Keep the existing admin-key protected `/admin` flow for this slice.
- Present saved access keys as team access records.
- Add a clipboard action that copies a complete facilitator invite, while preserving raw key copying.
- Update browser coverage for the new admin workflow.

Decision:
- Full signed user roles for admin access remain a future persistence/authentication task.
- The current admin role is still represented by possession of `SCRUM_POKER_ADMIN_KEY`.

Work completed:
- Renamed the admin page around team access and team keys.
- Added facilitator invite generation in `public/js/admin.js`.
- Added `Copy invite` and `Copy key` actions for each team row.
- Updated admin action layout so the extra row action wraps cleanly.
- Updated README and deployment wording for team access and invite management.
- Extended admin browser coverage to verify copied invite text, app URL, facilitator role, and raw key copying.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `node --check tests/ws-operations.test.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Invite Prefill Links

Branch: `feature/invite-prefill-links`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `3160bc7 Add admin team invite copy flow`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add an optional room name to the admin invite workflow.
- Include a prefilled app link in copied facilitator invites.
- Prefill the login screen from invite URL parameters for access key, room, and role.
- Avoid leaving the access key in the browser address bar after prefill.

Work completed:
- Added an optional `Invite room` field to `/admin`.
- Updated copied facilitator invites to include the room when provided and an app URL with `accessKey`, `room`, and `role` parameters.
- Added login prefill handling for invite links, including a legacy `key` parameter alias.
- Removed the invite query string from the address bar after applying prefill.
- Extended admin browser coverage to parse the copied invite URL and verify login prefill behavior.

Verification:
- `node --check public/js/admin.js`
- `node --check public/js/app.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Role Specific Invites

Branch: `feature/role-specific-invites`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `900566d Add invite prefill links`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Let admins choose the role included in copied team invites.
- Keep facilitator as the default role.
- Preserve the existing prefilled login link behavior.

Work completed:
- Added an `Invite role` selector to `/admin` with Facilitator, Voter, and Observer options.
- Updated copied invite links and invite text to use the selected role.
- Renamed the admin invite helper from facilitator-specific wording to team-invite wording.
- Updated admin browser coverage to verify a Voter invite link and login prefill.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Invite Preview

Branch: `feature/admin-invite-preview`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `afa2089 Add role-specific team invites`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Show admins the exact invite text before using `Copy invite`.
- Keep preview generation tied to the same helper as the clipboard action.
- Update previews when invite room or role changes.

Work completed:
- Added an invite preview block to each team key row.
- Rendered preview text from the same `createTeamInvite` helper used by `Copy invite`.
- Re-rendered previews when the invite room or invite role control changes.
- Updated admin browser coverage to confirm the preview updates and exactly matches copied clipboard text.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Copy Invite Link

Branch: `feature/admin-copy-invite-link`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `30755c1 Add admin invite preview`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a direct way to copy only the prefilled invite link.
- Reuse the same invite URL helper used by the full invite preview/message.
- Keep the existing full invite and raw key copy actions.

Work completed:
- Added `Copy link` to each admin team key row.
- Wired `Copy link` to `createInviteUrl`, matching the URL embedded in the full invite text.
- Extended admin browser coverage to verify copied link text equals the invite URL.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Accordion

Branch: `feature/admin-team-accordion`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `d87127d Add admin copy invite link action`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Replace the growing flat admin team-key list with collapsible sections grouped by team name.
- Avoid adding Bootstrap as a new dependency for a single collapse behavior.
- Keep invite preview and copy actions inside each team section.
- Preserve open sections when invite room or role changes re-render the list.

Work completed:
- Converted each admin team row to a native `details`/`summary` collapsible section.
- Added custom app-native styling, plus/minus affordance, and open-panel animation.
- Kept the team name visible in the collapsed header with the selected invite role as metadata.
- Preserved open team sections across invite room and role changes.
- Updated admin browser coverage to open a team section before copying and verify it stays open during invite setting changes.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Team Search

Branch: `feature/admin-team-search`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `856350d Add admin team accordion`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a search/filter control to `/admin` for growing team lists.
- Filter collapsed team sections by team name.
- Keep visible counts and empty states clear while filtering.

Work completed:
- Added a `Find team` search field above the team list.
- Filtered rendered team sections by case-insensitive team-name matching.
- Updated the team count to show filtered count and total count when search is active.
- Added a no-match empty state.
- Extended admin browser coverage for matching search, no-match search, and clearing the search.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Accordion Controls

Branch: `feature/admin-accordion-controls`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `7743c39 Add admin team search`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add bulk controls for the admin team accordion.
- Keep controls scoped to the currently shown, filtered team sections.
- Preserve manually opened sections across search and invite option re-renders.

Work completed:
- Added `Expand shown` and `Collapse shown` buttons above the team list.
- Wired the controls to only affect currently rendered team sections.
- Promoted open-section tracking to explicit state so open teams survive filtering and no-match search states.
- Cleaned removed teams out of the open-section state.
- Extended admin browser coverage for expand all, collapse all, filtered expand, and open-state preservation.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused admin browser test passed.
- `npm test` ran 39 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.

## 2026-05-08 - Admin Key Lifecycle

Branch: `feature/admin-key-lifecycle`

Starting state:
- Repository path: `/var/www/scrumpoker`
- Source branch before work: `main`
- Latest baseline commit: `07a5f47 Add admin accordion controls`
- Working tree: clean before branch changes
- Server status: `node server.js` was already running on port `3001`

Work planned:
- Add a reversible admin action for deactivating a team key without deleting it.
- Preserve compatibility with existing `keys.json` files that store team names as plain string values.
- Reject suspended keys during WebSocket login while keeping them visible in the admin list.
- Keep copy/share actions unavailable for suspended teams until restored.

Work completed:
- Extended key storage to read legacy string entries and metadata entries with an `active` flag.
- Added `PATCH /api/admin/keys/:name` for suspend/restore status changes.
- Updated `/admin` team sections with active/suspended status badges, suspend/restore controls, and disabled copy actions for suspended keys.
- Kept suspended keys in the admin list and included suspended counts when relevant.
- Updated the command-line list output to show each key status.
- Fixed accordion open-state tracking so manually closed rows stay closed after re-renders.
- Added unit/API/browser coverage for suspended key storage, admin status updates, rejected suspended logins, and admin suspend/restore UI.

Verification:
- `node --check public/js/admin.js`
- `node --check tests/e2e/admin-key-management.spec.js`
- `for file in server.js manageKeys.js playwright.config.js lib/*.js public/js/*.js tests/*.test.js tests/e2e/*.js tests/e2e/helpers/*.js; do node --check "$file"; done`
- `git diff --check`
- `node --test tests/access-keys.test.js`
- `node --test tests/ws-operations.test.js`
- `npx playwright test tests/e2e/admin-key-management.spec.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

Result:
- Syntax and whitespace checks passed.
- Focused key-storage and API tests passed.
- Focused admin browser test passed.
- `npm test` ran 42 tests successfully.
- `npm run test:e2e` passed with 3 browser tests.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
