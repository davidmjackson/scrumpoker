# Retrospective — Team Key Handling & Rotation

_Documented 2026-05-20. This describes the team-access-key changes made to the
Retrospective app (`/var/www/retrospective`) during the May 2026 work. It exists
so the Scrum Poker app can be compared against it and the two apps aligned._

_Retrospective's rotation was originally ported **from** Scrum Poker; this
document is the reverse reference — what Retrospective now does — for
re-aligning the two apps._

## Read this first: the admin model differs

The two apps authenticate admins differently. Reconcile this before aligning
anything else:

- **Retrospective** — "admin" is a login *role*. The `teams` table contains an
  `Admin` row; an admin signs in through the **normal login form** with
  Role = Admin (the Team field auto-fills to "Admin"), using the key from the
  `RETRO_ADMIN_KEY` environment variable. After login the admin is routed to
  `/admin`. The admin key is re-hashed into the `Admin` team row on every
  server start by `ensureAdminTeam()`.
- **Scrum Poker** — a dedicated `/admin` page; you navigate to
  `scrumpoker.uk/admin` and log in with credentials. There is no admin team and
  no admin role.

Decide which model both apps should converge on first. Everything below
describes Retrospective's current behaviour; points coupled to the
admin-as-team model are marked **[admin-model]**.

## Summary of changes

Three pieces of work, each on its own branch, all merged to `main` and deployed
to production at sprintretro.uk:

1. Hashed key storage + rotation — `feature/team-key-rotation` (`0d11c9f`)
2. One-time key reveal for facilitators — `feature/key-reveal-warning` (`1ded297`)
3. Styled confirm modal for admin actions — `feature/rotate-confirm-modal` (`eb0621c`)

A fourth change, `fix/admin-lobby-button` (`5d6c6da`), removed a dead "Lobby"
link from `/admin`; it is Retrospective-specific (a side effect of the
admin-team model) and not relevant to Scrum Poker.

## 1. Hashed key storage + rotation

### Storage
- Team keys are **no longer stored in plaintext**. The `teams` table changed
  from `(id, name, join_key, created_at)` to
  `(id, name, key_hash, key_salt, weak, created_at)`.
- Retrospective stores teams in **SQLite** (`teams` table). Scrum Poker uses
  `keys.json`; the concepts map but the storage mechanism differs.

### Hashing (`db.js`)
- `generateTeamKey()` — 12 random characters from `[a-z0-9]`.
- `createKeySalt()` — `crypto.randomBytes(16)` as hex (32 chars).
- `hashTeamKey(key, salt)` — `sha256(salt + ":" + key)` as a hex string.
- `verifyTeamKey(team, key)` — recomputes the hash and compares with
  `crypto.timingSafeEqual` (constant-time).
- `isWeakTeamKey(key)` — true if the key is shorter than 12 characters.

### The `weak` flag
- Stored per team (`weak` integer column) because once a key is hashed its
  length is unknowable. Set at create / rotate / migrate time.
- A generated key is always 12 chars, so it is never weak. Migrated legacy
  5-char keys are weak. The admin key is weak if `RETRO_ADMIN_KEY` is shorter
  than 12 characters.
- `/admin` shows it as an "OK" / "Weak key" badge per team.

### Rotation
- `rotateTeamKey(db, teamId)` (`db.js`) — generates a fresh key + salt, updates
  `key_hash` / `key_salt` / `weak`, **preserves `name` and `created_at`**, and
  returns the new plaintext key once.
- `POST /api/admin/teams/:id/rotate` (`server.js`) — admin-only. Refuses to
  rotate the `Admin` team **[admin-model]** (its key is env-managed).
- Rotation invalidates the old key for *future logins* immediately. It does
  **not** invalidate existing sessions — see "Limitations".

### Migration
- `ensureTeamsKeyHashing(db)` runs inside `ensureSchema()` on startup. If it
  finds a legacy `teams` table with a `join_key` column, it rebuilds the table
  to the new schema and hashes each existing plaintext key in place (preserving
  ids, names, and `created_at`; setting `weak` by length). Existing keys keep
  working after the upgrade — no key reissue needed.

### Server / login (`server.js`)
- Login verifies keys with `verifyTeamKey` (timing-safe) instead of a `!==`
  string compare.
- The team-key input accepts `[a-z0-9]{4,64}` (was exactly 5) so both legacy
  5-char and new 12-char keys work.
- `RETRO_ADMIN_KEY` validation relaxed to `[a-z0-9]{5,64}` (was exactly 5); the
  server logs a warning if it is shorter than 12. **[admin-model]**

### Admin UI (`/admin`)
- The team list no longer shows plaintext keys (only the hash is stored, so
  there is nothing to show). It shows the OK / Weak status instead.
- Each team has a "Rotate key" button → confirmation → a **one-time reveal
  dialog** showing the new key with a Copy button. Once that dialog closes the
  key is unrecoverable.
- The `Admin` team row's Rotate and Delete buttons are disabled. **[admin-model]**

## 2. One-time key reveal (facilitator-facing)

When a facilitator creates a team, the new key is shown in the lobby
"Share This Team Key" panel. Changes:
- Added an amber advisory: copy and share the key now; it cannot be shown again,
  and a lost key can only be replaced by an admin rotating the team.
- The key is **no longer written to `localStorage`** — it is shown once,
  in-memory, right after creation, and is gone on reload. (Previously it was
  persisted, which both contradicted the "one-time" model and left a plaintext
  key in the browser.)

## 3. Styled confirm modal

The admin "Rotate key" and "Delete team" actions used the browser
`window.confirm()` alert. They now use an in-page `<dialog>` modal driven by a
reusable promise-based `confirmAction({ title, message, confirmLabel })` helper
(accept / cancel / close / backdrop / Escape all resolve it).

## Limitations / decisions (carry these into the alignment)

- **No forced session invalidation.** Rotation blocks new logins with the old
  key, but a user already signed in keeps their session cookie until it expires
  (24h default). Check whether Scrum Poker behaves the same.
- **No rotation audit log.** Scrum Poker's doc describes a `rotated` audit-log
  event; Retrospective deliberately skipped it. This is a known divergence —
  decide whether to add it to Retrospective or accept the difference.
- Keys are 12-character `[a-z0-9]`, salted SHA-256. Confirm Scrum Poker uses the
  same length, alphabet, and hash construction (`sha256(salt + ":" + key)`).

## Files changed in Retrospective (for locating the analogues)

- `db.js` — schema, key helpers, `createTeam`, `rotateTeamKey`,
  `verifyTeamKey`, `ensureAdminTeam`, `listTeams`, `ensureTeamsKeyHashing`.
- `server.js` — key validation, login verification,
  `POST /api/admin/teams/:id/rotate`.
- `public/admin.html`, `public/admin.js` — key-status column, rotate button,
  reveal dialog, confirm modal.
- `public/lobby.html`, `public/lobby.js` — team-key panel advisory, one-time key.
- `public/login.html`, `public/login.js` — key input length, removed dead
  `retroTeamKey` localStorage handling.
- `public/styles.css` — dialog, badge, and warning styles.
- `tests/ws-operations.test.js`, `tests/e2e/page-shell.spec.js` — rotation
  coverage (old key fails, new key works; reveal dialog).

## Branch / commit reference (Retrospective `main`)

- `feature/team-key-rotation` → `0d11c9f`
- `feature/key-reveal-warning` → `1ded297`
- `feature/rotate-confirm-modal` → `eb0621c`
- `fix/admin-lobby-button` → `5d6c6da`
- Full per-change detail is in the Retrospective repo's `docs/session-log.md`
  (entries dated 2026-05-20).
