"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// The Instrument foundation lives in the sibling `suite` checkout. Resolving it
// from __dirname keeps this working wherever the pair is cloned — /var/www here,
// the runner workspace in CI. If the sibling is missing the guard fails rather
// than skipping: a drift check that cannot read the source proves nothing.
const repoRoot = path.resolve(__dirname, "..");
const foundation = path.resolve(repoRoot, "..", "suite", "shared", "theme", "check-theme-drift.mjs");

test("poker's synced Instrument assets match the foundation source", async () => {
  const mod = await import(pathToFileURL(foundation).href);
  const r = mod.driftReport(repoRoot);
  assert.deepEqual(r.missing, [], "no missing synced assets");
  assert.deepEqual(r.mismatched, [], "no drifted synced assets");
  assert.equal(r.ok, true);
});
