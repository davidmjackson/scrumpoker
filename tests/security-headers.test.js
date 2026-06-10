"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const request = require("supertest");
const { createHttpApp } = require("../lib/httpApp");
const { makeSecurityHeaders, DEFAULT_CSP } = require("../middleware/securityHeaders");

function fakeAuth() {
  return {
    staticAssets: (_req, _res, next) => next(),
    handleLaunch: (_req, res) => res.send("launch"),
    handleLogout: (_req, res) => res.send("logout"),
    handleHeartbeat: (_req, res) => res.json({ ok: true }),
    handleWhoami: (_req, res) => res.json({ authed: false }),
    requireAuth: (req, _res, next) => { req.user = { id: "u1", entitled: true, company: { id: "co1", name: "Acme" } }; next(); },
    _ctx: { hubBaseUrl: "https://hub" },
  };
}

function build() {
  return createHttpApp({
    publicDir: path.join(__dirname, "..", "public"),
    auth: fakeAuth(),
    getRoomCount: () => 0,
    buildInfo: { version: "t", commit: "c" },
  });
}

// ── HTTP route response headers ───────────────────────────────────────────────

test("GET /health carries X-Frame-Options: DENY", async () => {
  const res = await request(build()).get("/health");
  assert.equal(res.headers["x-frame-options"], "DENY");
});

test("GET /health carries X-Content-Type-Options: nosniff", async () => {
  const res = await request(build()).get("/health");
  assert.equal(res.headers["x-content-type-options"], "nosniff");
});

test("GET /health carries Referrer-Policy: strict-origin-when-cross-origin", async () => {
  const res = await request(build()).get("/health");
  assert.equal(res.headers["referrer-policy"], "strict-origin-when-cross-origin");
});

test("GET /health carries Strict-Transport-Security with max-age=31536000", async () => {
  const res = await request(build()).get("/health");
  assert.ok(
    res.headers["strict-transport-security"].includes("max-age=31536000"),
    "HSTS max-age present"
  );
  assert.ok(
    res.headers["strict-transport-security"].includes("includeSubDomains"),
    "HSTS includeSubDomains present"
  );
});

test("GET /health carries Permissions-Policy containing camera=()", async () => {
  const res = await request(build()).get("/health");
  assert.ok(
    res.headers["permissions-policy"].includes("camera=()"),
    `Permissions-Policy missing camera=(): ${res.headers["permissions-policy"]}`
  );
});

test("GET /health carries Content-Security-Policy with script-src 'self'", async () => {
  const res = await request(build()).get("/health");
  const csp = res.headers["content-security-policy"];
  assert.ok(csp.includes("script-src 'self'"), `CSP missing script-src 'self': ${csp}`);
});

test("GET /health CSP does NOT contain unsafe-inline in script-src", async () => {
  const res = await request(build()).get("/health");
  const csp = res.headers["content-security-policy"];
  // Isolate the script-src directive and confirm it doesn't contain unsafe-inline.
  const scriptSrcMatch = csp.match(/script-src([^;]*)/);
  assert.ok(scriptSrcMatch, "script-src directive not found in CSP");
  assert.ok(
    !scriptSrcMatch[1].includes("'unsafe-inline'"),
    `script-src must not contain 'unsafe-inline': ${scriptSrcMatch[0]}`
  );
});

test("GET /health CSP connect-src includes wss:", async () => {
  const res = await request(build()).get("/health");
  const csp = res.headers["content-security-policy"];
  assert.ok(
    csp.includes("wss:"),
    `CSP connect-src must include wss: for WebSocket support: ${csp}`
  );
});

test("GET /health CSP connect-src includes ws:", async () => {
  const res = await request(build()).get("/health");
  const csp = res.headers["content-security-policy"];
  assert.ok(
    csp.includes("ws:"),
    `CSP connect-src must include ws: for WebSocket support: ${csp}`
  );
});

// ── Unit tests: makeSecurityHeaders middleware ────────────────────────────────

test("makeSecurityHeaders sets all 6 required headers via fake res", () => {
  const headers = {};
  const fakeRes = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
  };
  let nextCalled = false;
  // Middleware signature is (_req, res, next)
  makeSecurityHeaders()({}, fakeRes, () => { nextCalled = true; });

  assert.ok(nextCalled, "next() must be called");
  assert.ok(headers["content-security-policy"], "CSP header set");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["referrer-policy"], "strict-origin-when-cross-origin");
  assert.ok(headers["strict-transport-security"].includes("max-age=31536000"), "HSTS set");
  assert.ok(headers["permissions-policy"].includes("camera=()"), "Permissions-Policy set");
});

test("makeSecurityHeaders DEFAULT_CSP uses connect-src 'self' (not wss:)", () => {
  assert.ok(DEFAULT_CSP.includes("connect-src 'self'"), "DEFAULT_CSP has connect-src 'self'");
  // The default should NOT have wss: — that's the poker-specific delta
  const connectSrcMatch = DEFAULT_CSP.match(/connect-src([^;]*)/);
  assert.ok(connectSrcMatch, "connect-src present in DEFAULT_CSP");
  assert.ok(
    !connectSrcMatch[1].includes("wss:"),
    "DEFAULT_CSP connect-src must not pre-include wss: (delta applied in httpApp)"
  );
});

test("makeSecurityHeaders accepts custom CSP with wss: delta", () => {
  const wsCsp = DEFAULT_CSP.replace("connect-src 'self'", "connect-src 'self' wss: ws:");
  const headers = {};
  const fakeRes = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
  };
  makeSecurityHeaders({ contentSecurityPolicy: wsCsp })({}, fakeRes, () => {});
  const csp = headers["content-security-policy"];
  assert.ok(csp.includes("wss:"), "custom CSP with wss: is passed through");
  assert.ok(csp.includes("ws:"), "custom CSP with ws: is passed through");
});
