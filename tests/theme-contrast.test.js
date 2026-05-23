// tests/theme-contrast.test.js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contrastRatio, meetsAA } = require("../lib/contrast");

const POKER = {
  bg:        "#FDF8EB",
  "bg-warm": "#F4ECE0",
  surface:   "#FFFFFF",
  ink:       "#2A2118",
  muted:     "#876641",
  accent:    "#6B4FE8",
  "accent-on": "#FFFFFF",
  "accent-2": "#F5D87E",
  "sticker-yellow-ink": "#6B4D10",
  "accent-3": "#FFCFB0",
  "sticker-peach-ink":  "#8B3A1A"
};

const PAIRS = [
  ["ink",   "bg"],
  ["ink",   "bg-warm"],
  ["ink",   "surface"],
  ["muted", "bg"],
  ["accent-on", "accent"],
  ["sticker-yellow-ink", "accent-2"],
  ["sticker-peach-ink",  "accent-3"],
  ["accent", "bg-warm"]
];

for (const [fg, bg] of PAIRS) {
  test(`scrumpoker contrast: ${fg} on ${bg} meets AA body text`, () => {
    const ratio = contrastRatio(POKER[fg], POKER[bg]);
    assert.ok(
      meetsAA(POKER[fg], POKER[bg]),
      `${fg} (${POKER[fg]}) on ${bg} (${POKER[bg]}) = ${ratio.toFixed(2)}:1, need 4.5:1`
    );
  });
}
