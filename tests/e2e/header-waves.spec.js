"use strict";

const { test, expect } = require("@playwright/test");
const { seedSession } = require("./helpers/seed");
const { injectSession } = require("./helpers/_auth");

function attachErrorListeners(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text());
  });
  return errs;
}

test.describe("oscilloscope band", () => {
  test("entry screen (index.html #login-section) has a band with mounted svg", async ({ page, context }) => {
    const errs = attachErrorListeners(page);

    seedSession();
    await injectSession(context);
    await page.goto("/");

    // Entry screen is visible before joining a room.
    await expect(page.locator("#login-section")).toBeVisible();

    const band = page.locator("#login-section .band").first();
    await expect(band).toBeVisible();
    // The oscilloscope module mounts an <svg> into each empty .waves div after load.
    await expect.poll(async () => band.locator(".waves svg").count()).toBeGreaterThan(0);

    expect(errs).toEqual([]);
  });

  test("room section (index.html #poker-room-section) has a band with mounted svg after joining", async ({ page, context }) => {
    const errs = attachErrorListeners(page);

    seedSession();
    await injectSession(context);
    await page.goto("/");

    await expect(page.locator("#login-button")).toBeEnabled();

    await page.locator("#room-input").fill("waves-room");
    await page.locator("#name-input").fill("Alice");
    await page.locator("#role-select").selectOption("Facilitator");
    await page.locator("#login-button").click();

    await expect(page.locator("#poker-room-section")).toBeVisible();

    const band = page.locator("#poker-room-section .band").first();
    await expect(band).toBeVisible();
    await expect.poll(async () => band.locator(".waves svg").count()).toBeGreaterThan(0);

    expect(errs).toEqual([]);
  });

  test("anonymous join entry (join.html #join-section) has NO band; room has a band after joining", async ({ page, context, browser }) => {
    const errs = attachErrorListeners(page);

    // Set up a room with a share token via an authenticated facilitator.
    seedSession();
    await injectSession(context);
    await page.goto("/");

    await page.locator("#room-input").fill("waves-anon-room");
    await page.locator("#name-input").fill("Alice");
    await page.locator("#role-select").selectOption("Facilitator");
    await page.locator("#login-button").click();
    await expect(page.locator("#poker-room-section")).toBeVisible();

    const token = await page.locator("#poker-room-section").getAttribute("data-share-token");
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    // Anonymous user visits join.html via the share link.
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    const anonErrs = [];
    anon.on("pageerror", (e) => anonErrs.push(String(e)));
    anon.on("console", (m) => {
      if (m.type() === "error") anonErrs.push(m.text());
    });

    try {
      await anon.goto(`/join?token=${token}`);

      // The join entry screen has no band — it's a focused card, not an oscilloscope surface.
      await expect(anon.locator("#join-section")).toBeVisible();
      await expect(anon.locator("#join-section .band")).toHaveCount(0);

      // Join the room.
      await anon.fill("#join-name-input", "Guest");
      await anon.click("#join-button");
      await expect(anon.locator("#poker-room-section")).toBeVisible();

      // The room section in join.html DOES have a band with a mounted svg.
      const anonRoomBand = anon.locator("#poker-room-section .band").first();
      await expect(anonRoomBand).toBeVisible();
      await expect.poll(async () => anonRoomBand.locator(".waves svg").count()).toBeGreaterThan(0);

      expect(anonErrs).toEqual([]);
    } finally {
      await anonCtx.close();
    }

    expect(errs).toEqual([]);
  });
});
