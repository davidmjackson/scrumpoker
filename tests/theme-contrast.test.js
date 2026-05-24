// tests/theme-contrast.test.js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contrastRatio, meetsAA } = require("../lib/contrast");

/**
 * Scrum Poker palette pairs that MUST meet WCAG AA (4.5:1 body text, 3:1
 * large text). If a token gets recoloured later, this test catches
 * regressions. Palette follows /var/www/signal/docs/forestbuild-spec.md §1.
 */
const POKER = {
  bg:           "#FDF8EB",
  "bg-warm":    "#F4ECE0",
  surface:      "#FFFFFF",
  ink:          "#2A2118",
  muted:        "#876641",
  faint:        "#B0916B",
  accent:       "#2E6F4E",
  "accent-on":  "#FFFFFF",
  "accent-soft":"#DEEBE2",
  "accent-deep":"#245C40",
  ok:    "#1E5A3A",
  "ok-bg":"#D7E8DC",
  err:   "#B4232A"
};

const BODY_PAIRS = [
  ["ink",         "bg"],
  ["ink",         "surface"],
  ["ink",         "bg-warm"],
  ["muted",       "bg"],
  ["muted",       "surface"],
  ["accent-on",   "accent"],
  ["accent-deep", "accent-soft"],
  ["ok",          "ok-bg"],
  ["err",         "bg"]
];

for (const [fg, bg] of BODY_PAIRS) {
  test(`scrumpoker contrast: ${fg} on ${bg} meets AA body text`, () => {
    const ratio = contrastRatio(POKER[fg], POKER[bg]);
    assert.ok(
      meetsAA(POKER[fg], POKER[bg]),
      `${fg} (${POKER[fg]}) on ${bg} (${POKER[bg]}) = ${ratio.toFixed(2)}:1, need 4.5:1`
    );
  });
}
