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
