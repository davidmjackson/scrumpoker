# Scrum Poker Deployment

This runbook documents the current deployment assumptions after moving the repository to GitHub.

## Repository Remotes

GitHub is the primary source of truth:

```bash
git remote -v
```

Expected primary remote:

```text
origin  git@github-scrumpoker:davidmjackson/scrumpoker.git
```

The previous Bitbucket remote may remain as a backup remote named `bitbucket`:

```text
bitbucket  git@bitbucket-scrumpoker-new:epicnerd/scrum-poker.git
```

Do not delete the Bitbucket remote until production deployment has been confirmed to pull from GitHub.

## SSH Key

This server uses a dedicated SSH host alias for the GitHub Scrum Poker repository:

```sshconfig
Host github-scrumpoker
  HostName github.com
  User git
  IdentityFile /home/davidj/.ssh/scrumpoker_github_ed25519
  IdentitiesOnly yes
```

The public key is configured as a GitHub deploy key for `davidmjackson/scrumpoker`. It needs write access for pushes from this server.

## Branches

Primary branch:

```text
main
```

Legacy branch retained from the original repository:

```text
master
```

Use feature branches for development work and merge to `main` after checks pass.

## Local Verification

Run these checks before pushing application changes:

```bash
npm ci
node --check server.js
node --check manageKeys.js
node --check playwright.config.js
for file in lib/*.js; do node --check "$file"; done
for file in public/js/*.js; do node --check "$file"; done
for file in tests/*.test.js; do node --check "$file"; done
for file in tests/e2e/*.js; do node --check "$file"; done
git diff --check
npm test
npm run test:e2e
npm audit --omit=dev
```

If Playwright browsers are not installed locally, run:

```bash
npx playwright install chromium
```

## GitHub Actions

CI is defined in:

```text
.github/workflows/ci.yml
```

It runs:

- `npm ci`
- `npx playwright install --with-deps chromium`
- `node --check server.js`
- `node --check manageKeys.js`
- `node --check playwright.config.js`
- syntax checks for `lib/*.js`
- syntax checks for `public/js/*.js`
- syntax checks for `tests/*.test.js` and `tests/e2e/*.js`
- `npm test`
- `npm run test:e2e`
- `npm audit --omit=dev`

CI uses Node.js 24 and opts JavaScript actions into the Node 24 runtime with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`.

GitHub repository settings should make `main` the default branch and require CI to pass before merging.

## Production Pull

On the production checkout, confirm the remote points to GitHub:

```bash
git remote -v
```

If production still points `origin` at Bitbucket, rename the old remote and add GitHub as `origin`:

```bash
git remote rename origin bitbucket
git remote add origin git@github-scrumpoker:davidmjackson/scrumpoker.git
git fetch origin
git switch main
git pull --ff-only origin main
```

If `origin` already points to GitHub:

```bash
git fetch origin
git switch main
git pull --ff-only
```

## Runtime

Install production dependencies:

```bash
npm ci --omit=dev
```

Start the app with the existing runtime manager, for example systemd or pm2. The app defaults to port `3000` unless `PORT` is set.

The app expects a local keys file by default:

```text
keys.json
```

To use a different keys file path, set:

```bash
SCRUM_POKER_KEYS_FILE=/path/to/keys.json
```

Keep `keys.json` out of git. Treat access keys as secrets.

The in-app team access and invite manager is available at `/admin` only when this environment variable is set:

```bash
SCRUM_POKER_ADMIN_KEY=replace-with-a-long-random-secret
```

Do not reuse a team access key as the admin key.

## Health Check

After restarting the app, verify the local health endpoint:

```bash
curl -fsS http://127.0.0.1:3000/health
```

Expected response shape:

```json
{
  "status": "ok",
  "uptime": 12.34,
  "rooms": 0
}
```

Then smoke-test the public site and WebSocket path through the reverse proxy.

## Reverse Proxy

Terminate TLS at the reverse proxy and forward HTTP and WebSocket traffic to Node:

```text
/   -> http://127.0.0.1:3000
/ws -> http://127.0.0.1:3000/ws
```

Mirror the app's security headers at the edge where practical. See `README.md` for the current Nginx example.
