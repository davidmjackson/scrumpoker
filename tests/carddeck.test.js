"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// cardDeck.js is a browser IIFE that attaches to `window`. It CANNOT be
// require()'d in Node (it runs `(function(window){...})(window)` against the
// global `window`, which is undefined → ReferenceError). Instead read it as
// text and execute it against a stub `window` via new Function.
function loadCardDeck() {
  const win = {};
  const code = fs.readFileSync(path.join(__dirname, "../public/js/cardDeck.js"), "utf8");
  new Function("window", code)(win);
  return win.ScrumPokerCardDeck;
}
const { createVotingCard } = loadCardDeck();

// Minimal fake document — createVotingCard only uses these DOM bits.
function fakeDoc() {
  const created = [];
  const make = (tag) => {
    const node = {
      tagName: tag.toUpperCase(), dataset: {}, _classes: new Set(), children: [],
      classList: { add(...c) { c.forEach((x) => node._classes.add(x)); }, contains(x) { return node._classes.has(x); } },
      appendChild(c) { node.children.push(c); return c; },
      addEventListener() {}, _text: "",
      set textContent(v) { node._text = v; }, get textContent() { return node._text; },
      set src(v) { node._src = v; }, set alt(v) { node._alt = v; },
    };
    created.push(node);
    return node;
  };
  return { document: { createElement: make }, created };
}

test("createVotingCard builds .pkfront/.pkback faces and NO <img> back", () => {
  const { document, created } = fakeDoc();
  const btn = createVotingCard({ document, value: "8" });
  assert.equal(btn.tagName, "BUTTON");
  assert.ok(!created.some((n) => n.tagName === "IMG"), "must not create an <img> back");
  assert.ok(created.some((n) => n.classList.contains("pkback")), "back face marked .pkback");
  assert.ok(created.some((n) => n.classList.contains("pkfront")), "front face marked .pkfront");
});

test("createVotingCard front face carries the value", () => {
  const { document, created } = fakeDoc();
  createVotingCard({ document, value: "13" });
  const front = created.find((n) => n.classList.contains("card-front"));
  assert.equal(front.textContent, "13");
});
