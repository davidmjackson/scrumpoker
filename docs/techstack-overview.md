# Technical Stack Overview — Scrum Poker & Retrospective

> **Purpose:** Reference document for architecture planning. Describes the
> current technology, structure, data model, security posture, and deployment
> of the two existing apps so future app decisions can build on a known
> baseline (and reuse what already works).
>
> **As of:** 2026-05-22. Both apps live on the same host under `/var/www/`.

---

## 1. Executive Summary

Two small, self-contained real-time collaboration web apps for agile ceremonies:

| | **Scrum Poker** | **Retrospective** |
|---|---|---|
| Purpose | Planning-poker estimation rooms | Start/Stop/Continue retro boards + action tracking |
| Path | `/var/www/scrumpoker` | `/var/www/retrospective` |
| Port | 3000 | 3001 |
| Domain | `scrum-poker.uk` | (placeholder `retro.example.com`) |
| Runtime | Node.js + Express 5 + `ws` | Node.js + Express 4 + `ws` |
| Persistence | **None** — fully in-memory | **SQLite** (`better-sqlite3`) |
| Auth model | Access keys over WebSocket login | Signed-cookie sessions (HMAC) |
| Frontend | Vanilla HTML/CSS/JS, no build step | Vanilla HTML/CSS/JS, no build step |
| Code shape | Modular (`lib/` + thin `server.js`) | Monolithic (`server.js` ~1.7k lines) |
| CI | GitHub Actions | None committed |

Both share a deliberate philosophy: **minimal dependencies, no front-end
framework, no build/transpile step, no client-side bundler.** All browser code
is plain ES served as static files under a strict Content-Security-Policy that
forbids inline scripts and `eval`. Both sit behind Nginx (TLS termination) and
run as `systemd` services.

They are **independent codebases** — no shared package, no shared module — but
they have converged on near-identical patterns (security headers, rate
limiting, salted-SHA-256 key hashing, health endpoints, "Admin" role). That
convergence is the strongest signal for the architecture decision in Section 9.

---

## 2. Scrum Poker — Detailed

### 2.1 Runtime & Dependencies

- **Node.js** (CI targets Node 24; host currently runs v20.19.6).
- **Production dependencies** (`package.json`):
  - `express` `^5.1.0` — HTTP server, static files, JSON body parsing.
  - `ws` `^8.18.2` — WebSocket server.
  - `uuid` `^11.1.0` — per-connection user IDs (`uuidv4`).
- **Dev dependencies:** `@playwright/test` `^1.59.1`.
- **No ORM, no database driver, no front-end framework, no bundler.**
- Package name in manifest is still the generic `websocket-server`.

### 2.2 Process & Module Layout

`server.js` is a thin composition root (~60 lines). Real logic lives in `lib/`:

| Module | Responsibility |
|---|---|
| `lib/httpApp.js` | Builds the Express app: security headers, no-cache headers, static serving, admin REST API, `/health`. |
| `lib/wsServer.js` | Creates the `ws` server on path `/ws`, routes inbound messages, manages the `participants` registry, wires rate limiting. |
| `lib/wsHandlers.js` | Per-message-type business logic (login, vote, reveal, reset, end, next round, change role, exit). |
| `lib/roomState.js` | Room lifecycle: create/join/leave/touch, facilitator (re)assignment, idle expiry, room-state snapshots. |
| `lib/roles.js` | Role constants (`Voter`, `Observer`, `Facilitator`) and permission predicates. |
| `lib/accessKeys.js` | Access-key store: generate, hash, validate, rotate, list, status; `keys.json` persistence. |
| `lib/adminActivity.js` | Append-only admin audit log (`admin-activity.jsonl`). |
| `lib/loginRateLimiter.js` | In-memory sliding-window brute-force throttle. |
| `lib/buildInfo.js` | Resolves version (from `package.json`) and git commit (`git rev-parse HEAD`). |
| `manageKeys.js` | Standalone CLI for managing access keys. |

This separation makes the unit-test surface clean — each `lib/` module has a
matching `tests/*.test.js`.

### 2.3 Data Model & State

**Entirely in-memory. Nothing survives a process restart** (except `keys.json`,
the access-key file, and the admin activity log file).

- `rooms` — `Map<roomName, { users: Set<userId>, lastActive, votesRevealed, facilitatorId }>`.
- `participants` — object keyed by `userId` holding the live `ws` socket, role, name, vote, room.
- Rooms idle for **60 minutes** are swept every minute (`expireRooms`).
- Card deck (fixed): `['0','1','2','3','5','8','13','?']`.
- Roles: **Voter** (can vote), **Observer** (cannot), **Facilitator** (can vote + reveal/reset/manage). First user into a room becomes facilitator; the role is reassigned automatically if the facilitator leaves.

### 2.4 WebSocket Protocol

- Server endpoint: `/ws`. `maxPayload: 64 KB`, `perMessageDeflate: false`.
- On connect the server issues `{ type: 'yourId', payload: { id } }`.
- **Client → server message types:** `login`, `vote`, `revealVotes`,
  `resetVotes`, `endSession`, `startNextRound`, `changeRole`, `logout`.
- Server broadcasts room-state snapshots to all room members on every change;
  any broadcast also "touches" the room so live sessions are never expired.
- Invalid JSON / unknown type → `{ type: 'error', ... }`.

### 2.5 Authentication & Authorization

- **Room access keys** ("team keys") are the only gate to join a room. The
  internal room name is derived from the key.
- Keys live in `keys.json` (path overridable via `SCRUM_POKER_KEYS_FILE`).
- **Keys are hashed at rest:** per-key 16-byte random salt + SHA-256. A fast
  hash is intentional — keys are high-entropy random tokens, and login checks a
  candidate against every stored key, so a slow KDF would be a bottleneck.
- Minimum key length **12 chars**; shorter keys are flagged `weak`.
- Comparison is timing-safe; keys carry metadata (created date, status).
- **Admin surface** (`/admin`, `/api/admin/*`) is gated separately by the
  `SCRUM_POKER_ADMIN_KEY` env var, supplied in the `x-scrum-poker-admin-key`
  request header. If the env var is unset, the admin API returns `503`.
- Admin REST API: list / create / rotate / suspend-restore / delete keys,
  read activity log, confirm session.
- Every admin mutation appends to `admin-activity.jsonl` with a 12-hex key
  fingerprint (not the key itself).

### 2.6 Security Posture

- Strict **Content-Security-Policy**: `default-src 'self'`, `script-src 'self'`
  (no inline, no `eval`), `object-src 'none'`, `frame-ancestors 'none'`,
  `form-action 'self'`, `upgrade-insecure-requests`.
- Full hardening header set: HSTS, `X-Content-Type-Options`, `X-Frame-Options:
  DENY`, COOP / COEP (`require-corp`) / CORP, `Referrer-Policy`,
  `Permissions-Policy`, `Origin-Agent-Cluster`, `X-Permitted-Cross-Domain-Policies`.
- `Server` and `X-Powered-By` headers stripped; `etag` disabled; all responses
  `no-store`.
- `express.json({ limit: '8kb' })`.
- `trust proxy` = 1 (correct client IP from `X-Forwarded-For` behind Nginx).
- **Login rate limiter:** sliding window, keyed on real client IP, default
  **20 failed logins / 10 min**. Only failures count; a success clears the counter.

### 2.7 Frontend

- Static files in `public/`: `index.html` (215 lines), `admin.html`,
  `license.html`, plus `js/app.js` (~1.1k lines), `js/admin.js` (~685),
  `js/cardDeck.js`, `js/clipboard.js`, and `css/app.css`.
- No framework, no build step. All JS is external (CSP forbids inline).
- `robots.txt` + `sitemap.xml` present.

### 2.8 Testing & CI

- **Unit tests:** `node --test` over `tests/*.test.js` (one per `lib/` module).
- **E2E:** Playwright (`tests/e2e/`) — smoke, multi-user room, admin key
  management. Headless Chrome, serial (`fullyParallel: false`).
- **CI** — `.github/workflows/ci.yml`, GitHub Actions on PR + push:
  Node 24 → `npm ci` → `playwright install chromium` → `node --check` syntax
  pass over every JS file → `npm test` → `npm run test:e2e` →
  `npm audit --omit=dev`.

### 2.9 Operations

- `GET /health` → `{ status, version, commit, uptime, rooms }` (unauthenticated).
- Runs as a `systemd` service on port 3000 behind Nginx (TLS, security headers
  mirrored at the edge, `/ws` proxied with `Upgrade`). Deployment runbook in
  `docs/deployment.md`.
- Custom free-use license; in-app page at `/license` (and `/licence`).

---

## 3. Retrospective — Detailed

### 3.1 Runtime & Dependencies

- **Node.js** (host v20.19.6).
- **Production dependencies** (`package.json`):
  - `express` `^4.19.2` — HTTP server. *(Note: Express **4**, vs Scrum Poker's 5.)*
  - `ws` `^8.17.1` — WebSocket server.
  - `better-sqlite3` `^12.6.2` — **synchronous** SQLite driver.
  - `dotenv` `^17.2.4` — loads `.env`.
- **Dev dependencies:** `@playwright/test` `^1.59.1`.
- No ORM (raw SQL via `better-sqlite3`), no front-end framework, no bundler.

### 3.2 Process & Module Layout

Two large files do most of the work:

| File | Lines | Responsibility |
|---|---|---|
| `server.js` | ~1,676 | HTTP routes, page routes, REST API, WebSocket server, auth (HMAC tokens, cookies), validation, rate limiting, timer reconciliation, retention scheduling. |
| `db.js` | ~1,008 | SQLite: schema creation & migrations, normalization helpers, CRUD/upserts for retros/cards/actions, team table + key hashing, retention, JSON seed import. |
| `scripts/db-maintenance.js` | — | CLI: `migrate`, `retention`, `vacuum`. |

`server.js` is monolithic — no `lib/` decomposition like Scrum Poker has.

### 3.3 Persistence & Data Model

- **SQLite** file `retros.db` (path overridable via `RETRO_DB_PATH`; production
  is expected to point this outside the git tree, e.g. `/var/lib/retrospective/`).
- `foreign_keys = ON`; cascade deletes from `retros` → `cards` / `actions`.
- **Schema (current version 5, tracked in a `meta` key/value table):**
  - `teams` — `id`, `name` (UNIQUE, `COLLATE NOCASE`), `key_hash`, `key_salt`,
    `weak`, `created_at`.
  - `retros` — `id`, `title`, `team`, `created_at`, `closed`, `closed_at`,
    timer columns (`duration/remaining/running/end_at`), `last_action_json`,
    `updated_at`.
  - `cards` — `id`, `retro_id` (FK), `column_type` (`well`/`improve`/`continue`),
    `text`, `details`, `votes`, `status`, `notes`, `created_by`, `updated_at`.
  - `actions` — `id`, `retro_id` (FK), `source_card_id`, `text`, `details`,
    `owner`, `due_date`, `status`, `notes`, `created_at`, `created_by`,
    `updated_at`.
  - Indexes on `retro_id` and composite `(retro_id, column_type)` /
    `(retro_id, status)`.
- **Migration system** runs on boot (`ensureSchema`):
  - Legacy single-column JSON-blob table (`retros.data_json`) → normalized
    `retros`/`cards`/`actions`.
  - Legacy plaintext `teams.join_key` → hashed `key_hash` + `key_salt`.
- **In-memory mirror:** on boot the whole DB is loaded into `state.retros`.
  Mutations are applied in memory **and** write-through to SQLite, then
  broadcast. If the DB is empty, the server can seed once from `state.json`.

### 3.4 Domain Model

- **Retro board** = 3 columns: `well` / `improve` / `continue` (Start / Stop /
  Continue). Cards have `text`, `details`, `votes`, `createdBy`.
- **Shared timer** per retro: duration / remaining / running / `endAt`.
  `reconcileTimers()` recomputes remaining time from wall-clock `endAt`.
- **Actions** are created deliberately from cards and form a cross-team kanban:
  statuses `todo` / `in_progress` / `blocked` / `done`.
- **Teams** own retros; team names are case-insensitive and unique.

### 3.5 HTTP Surface

**Page routes:** `/` (login), `/lobby`, `/retrospective` (alias `/retro`),
`/actions`, `/admin`, `/license`.

**REST API:**

| Method & path | Purpose |
|---|---|
| `POST /api/login` | Issue session cookie |
| `POST /api/logout` | Clear session cookie |
| `GET /api/session` | Return active session |
| `GET/POST /api/retros` | List / create retros |
| `GET /api/retros/:id` | Load one retro |
| `POST /api/retros/:id/close` | Close a retro |
| `GET /api/actions-report` | Cross-team action list |
| `PUT /api/actions` | Update action status/notes |
| `POST /api/teams` | Create a team (facilitator) |
| `GET /api/admin/teams` | List all teams (admin) |
| `DELETE /api/admin/teams/:id` | Delete a team (admin) |
| `POST /api/admin/teams/:id/rotate` | Rotate a team key (admin) |
| `GET /health` | Unauthenticated health check |

### 3.6 WebSocket Protocol

- WebSocket server attached to the same HTTP server (**no dedicated path** —
  any upgrade is accepted, distinguished by query string).
- **Origin checking:** connections are rejected unless the `Origin` matches
  `RETRO_ALLOWED_ORIGINS` (or the same host if that env var is unset).
- Two connection modes via query params `?retroId=&view=`:
  - `view=lobby` → live per-team retro list.
  - retro board → joins a retro room.
- **Client → server:** `hello` (presence), `timer` (`set`/`start`/`stop`/`reset`
  — facilitator-only), `addCard`, `voteCard`, `moveCard`, `createAction`.
- **Server → client:** `init`, `update`, `retros`, `presence`, `timer`,
  `retroClosed`, `error`.

### 3.7 Authentication & Authorization

- **Session token:** a self-signed HMAC token, format `base64url(body).signature`,
  HMAC-SHA256 over the body with `RETRO_AUTH_SECRET`. Payload carries
  `{ name, role, team, iat, exp }`. *(This is a hand-rolled JWT-equivalent — no
  JWT library.)*
- Delivered as cookie **`retro_auth`**: `httpOnly`, `sameSite=lax`,
  `secure` when the request is HTTPS. Also accepted as a `Bearer` header.
- Signature verification is timing-safe; expiry checked against `exp`.
- TTL configurable via `RETRO_AUTH_TTL_HOURS` (default 24).
- If `RETRO_AUTH_SECRET` is unset the server generates a random one and warns
  (sessions then reset on restart); in `NODE_ENV=production` an unset secret is
  **fatal** (`process.exit(1)`).
- **Roles:** `participant`, `facilitator`, `admin`.
- **Team keys:** 12-char lowercase-alphanumeric, generated with
  `crypto.randomInt`, hashed at rest (per-team 16-byte salt + SHA-256),
  verified timing-safe. The `Admin` team uses a fixed key from `RETRO_ADMIN_KEY`
  (must be 5–64 lowercase alphanumerics; default `admin` is rejected in production).
- Team membership is enforced per request (`ensureTeamAccess`): a user can only
  see/modify retros belonging to their token's team.

### 3.8 Security Posture

- CSP (`default-src 'self'`, `script-src 'self'`, `object-src 'none'`,
  `frame-ancestors 'none'`, `form-action 'self'`), `X-Content-Type-Options`,
  `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`.
  *(Slightly lighter than Scrum Poker — no HSTS / COOP / COEP / CORP in the app
  layer; those would be added at Nginx.)*
- `express.json({ limit: '1mb' })`.
- **Extensive input validation** in `server.js`: max lengths for name (80),
  team (80), retro title (140), card text (500), card details (2000), action
  notes (4000), owner (80); max 100 cards/column; timer 1–240 min; due date must
  match `YYYY-MM-DD`; IDs constrained to a safe charset.
- **Login rate limiter:** in-memory `Map` keyed `IP:role:team`, default
  **20 failures / 15 min** (`RETRO_LOGIN_RATE_LIMIT_MAX` /
  `RETRO_LOGIN_RATE_LIMIT_WINDOW_MS`).
- Production boot guards: exits if `RETRO_AUTH_SECRET` missing or
  `RETRO_ADMIN_KEY` missing/default.

### 3.9 Configuration (`.env`)

`NODE_ENV`, `PORT`, `RETRO_AUTH_SECRET`, `RETRO_ADMIN_KEY`,
`RETRO_ALLOWED_ORIGINS`, `RETRO_DB_PATH`, `RETRO_AUTH_TTL_HOURS`,
`RETRO_RETENTION_DAYS`, `RETRO_LOGIN_RATE_LIMIT_MAX`,
`RETRO_LOGIN_RATE_LIMIT_WINDOW_MS`. Template in `.env.example`.

### 3.10 Frontend

- Static files in `public/`: `login`, `lobby`, `retrospective`, `actions`,
  `admin`, `license` — each as `.html` + a matching `.js`, plus `styles.css`.
- **Vendored `dragula`** (`public/vendor/dragula/`) for card drag-and-drop —
  the only third-party browser library, bundled locally to satisfy CSP.
- `public/sounds/timer-complete.wav` for timer completion.
- No framework, no build step.

### 3.11 Testing & CI

- **Unit:** a single test file, `tests/ws-operations.test.js`
  (`npm test` = `node tests/ws-operations.test.js`).
- **E2E:** Playwright (`tests/e2e/`: `page-shell`, `retro-smoke`). The repo
  vendors Linux browser libraries under `.playwright-libs/` and points
  `LD_LIBRARY_PATH` at them — a WSL/sandbox workaround. The Playwright web
  server boots a throwaway DB on port 3101.
- **No CI workflow committed** (no `.github/`). Contrast with Scrum Poker.
- Acknowledged test-coverage gap in the README TODOs (API + WebSocket tests).

### 3.12 Operations & Maintenance

- `GET /health` (unauthenticated).
- `systemd` service on port 3001 behind Nginx (`deploy/systemd/` and
  `deploy/nginx/` contain ready-to-adapt configs). Nginx config maps the
  WebSocket `Upgrade` header and uses a 1-hour read timeout.
- **DB maintenance** via `scripts/db-maintenance.js`:
  `npm run db:migrate`, `npm run db:retention`, `npm run db:vacuum`.
- **Retention:** if `RETRO_RETENTION_DAYS` is set, closed retros older than the
  cutoff are deleted; an in-process job runs this every 24 h.
- `AGENTS.md` and a `.vscode/` workspace config are committed.

---

## 4. Side-by-Side Comparison

| Dimension | Scrum Poker | Retrospective |
|---|---|---|
| Express major version | **5.x** | **4.x** |
| `ws` version | 8.18.2 | 8.17.1 |
| Persistence | In-memory only (ephemeral) | SQLite, durable, normalized + migrations |
| State on restart | Rooms & votes lost (keys/audit kept) | Fully restored from DB |
| Auth mechanism | Access key over WS `login` | Signed HMAC cookie session |
| User identity | Not persisted; ephemeral `userId` | `name`/`role`/`team` in token |
| Team store | `keys.json` file | `teams` table in SQLite |
| Admin gate | `SCRUM_POKER_ADMIN_KEY` header | `admin` role + `Admin` team key |
| WebSocket path | Dedicated `/ws` | Same server, query-string routed |
| WS origin check | None (relies on CSP/proxy) | `RETRO_ALLOWED_ORIGINS` enforced |
| Code organization | Modular `lib/` + thin `server.js` | Monolithic `server.js` (~1.7k lines) |
| Unit test coverage | Per-module test files | Single test file (gap noted) |
| CI | GitHub Actions | None |
| Body size limit | 8 KB | 1 MB |
| Security headers | Full set incl. HSTS/COOP/COEP/CORP | Lighter set (HSTS etc. left to Nginx) |
| Audit log | `admin-activity.jsonl` | None |
| Config loading | Env vars directly | `dotenv` + `.env` |

### Shared, near-identical patterns (already converged)

- Node + Express + `ws`; vanilla static frontend; no framework; no build step.
- Strict CSP forbidding inline JS / `eval`; external-asset-only policy.
- Salted SHA-256 key hashing with a `weak` flag and timing-safe comparison.
- In-memory sliding-window login rate limiter.
- `/health` endpoint; `X-Forwarded-For`-aware client IP behind Nginx.
- Nginx reverse proxy + TLS at the edge + `systemd` service per app.
- Recently added an **Admin** role to both.
- Custom free-use license + in-app `/license` page in both.
- Playwright + `node --test` (Scrum Poker) / `node:test`-style scripts (Retro).

---

## 5. Deployment Topology

```
                 Internet (443/TLS)
                        │
                   ┌────▼────┐
                   │  Nginx  │  TLS termination, edge security headers,
                   │ (proxy) │  WebSocket Upgrade pass-through
                   └────┬────┘
            ┌───────────┴───────────┐
            │                       │
   ┌────────▼────────┐     ┌─────────▼─────────┐
   │  Scrum Poker     │     │  Retrospective    │
   │  systemd svc     │     │  systemd svc      │
   │  node :3000      │     │  node :3001       │
   │  in-memory state │     │  SQLite retros.db │
   │  keys.json       │     │  .env config      │
   └──────────────────┘     └───────────────────┘
```

- Each app is a single Node process (no clustering, no worker threads).
- Each binds `0.0.0.0` and is fronted by Nginx; production guidance is to bind
  to `127.0.0.1` and expose only 80/443 via firewall.
- No container/orchestration layer — bare `systemd` units.
- **Operational note:** the tool/development host is *not* the production
  server. On the dev host, both run as `systemd` services
  (`scrumpoker` :3000, `retrospective` :3001) restartable with `systemctl`.
  Production deploys are performed by handing the operator commands.

---

## 6. Single-Process Scaling Constraints

Both apps assume **exactly one process** holds all live state:

- Scrum Poker: `rooms` / `participants` maps are process-local — multiple
  instances could not share a room.
- Retrospective: `state.retros`, `clients`, `rooms`, `lobbyRooms`, the timer
  interval, and the login-attempt map are all process-local. SQLite is the
  durable store but the in-memory mirror and WebSocket fan-out are not shared.
- Login rate limiters are in-memory in both — they reset on restart and do not
  coordinate across instances.

This is fine at current (small-team) scale but is the **first hard limit** if
horizontal scaling is ever required (would need a shared pub/sub layer such as
Redis, plus externalized session/rate-limit state).

---

## 7. Known Gaps / Tech Debt

**Scrum Poker**
- All session state is volatile — a deploy or crash drops every active room.
- Generic package name (`websocket-server`).

**Retrospective**
- No CI pipeline.
- Thin automated test coverage (one test file; README TODOs call this out).
- `server.js` is a ~1,700-line monolith — harder to test and reason about than
  Scrum Poker's `lib/` layout.
- Hand-rolled token signing/verification instead of a vetted JWT library.
- Duplicate-markup / `state.json` decisions still listed as open TODOs.
- Vendored Playwright browser libs (`.playwright-libs/`) committed to the repo.

**Both**
- Hand-rolled auth and rate limiting rather than established middleware.
- No shared code despite heavy pattern overlap (see Section 8).
- Single-process scaling ceiling (Section 6).

---

## 8. Reuse Opportunities for the Next App

If a third app is built, these are already-solved, battle-tested pieces worth
extracting into a shared internal package rather than re-implementing:

1. **Security-header middleware** — Scrum Poker's `applySecurityHeaders` /
   `setNoCacheHeaders` (`lib/httpApp.js`) is the more complete of the two.
2. **Access-key / team-key module** — generation, salted-SHA-256 hashing,
   `weak` flag, rotation, timing-safe verification. Both apps have a variant;
   Scrum Poker's `lib/accessKeys.js` is the more factored one.
3. **Login rate limiter** — sliding-window throttle (`lib/loginRateLimiter.js`).
4. **Build-info / `/health`** — version + git-commit reporting (`lib/buildInfo.js`).
5. **Role model** — small predicate-based permission helpers (`lib/roles.js`).
6. **Admin audit log** — append-only JSONL with key fingerprints
   (`lib/adminActivity.js`).
7. **Session-token helper** — Retrospective's HMAC sign/verify (or, better,
   standardize on a real JWT library when extracting).

Scrum Poker's modular `lib/` layout is the better template for new work;
Retrospective's SQLite schema + migration approach is the better template for
anything needing durable state.

---

## 9. Architectural Decision Inputs

Questions the architect agent will likely need to weigh, given the above:

1. **Consolidation vs. independence** — extract a shared `@internal/web-kit`
   package (security headers, key hashing, rate limiter, health, roles) vs.
   keep apps fully independent. The pattern overlap strongly favors extraction.
2. **Persistence baseline** — adopt SQLite (`better-sqlite3`) as the default
   for any new app and consider giving Scrum Poker optional durability, so a
   restart no longer wipes active rooms.
3. **Express version** — standardize on Express 5 (Scrum Poker is already there;
   Retrospective lags at 4).
4. **Auth standardization** — pick one model: replace Retrospective's
   hand-rolled HMAC token with a vetted JWT library, and decide whether Scrum
   Poker should also move to cookie sessions for consistency.
5. **Code organization standard** — adopt Scrum Poker's `lib/`-module layout as
   the house style; refactor Retrospective's monolith over time.
6. **CI baseline** — every app should have the Scrum Poker GitHub Actions
   workflow (syntax check + unit + e2e + `npm audit`).
7. **Scaling** — decide now whether multi-instance is a future requirement; if
   so, design shared state (Redis pub/sub, externalized sessions) in from the
   start rather than retrofitting.
8. **Frontend stance** — both apps prove a no-build, no-framework, strict-CSP
   frontend is viable; decide whether the next app keeps that constraint or
   introduces a build step (which would change the CSP and deployment story).

---

*Generated 2026-05-22 from the working source of both apps. Cross-check against
`docs/deployment.md` (each repo), `docs/session-log.md`, and `README.md` for
operational detail and historical decisions.*
