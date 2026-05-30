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

async function assertSizedCanvas(band) {
  // Canvas.width is set by the component's resize() to host width × devicePixelRatio.
  // A non-zero value proves the component initialised and the host had real dimensions —
  // catches the "hidden section returns 0×0 from getBoundingClientRect" regression.
  await expect
    .poll(async () => band.locator("canvas").evaluate((c) => c.width))
    .toBeGreaterThan(0);
}

test.describe("breathing-waves header band", () => {
  test("renders on /license with aria-hidden canvas", async ({ page }) => {
    const errs = attachErrorListeners(page);
    await page.goto("/license");
    const band = page.locator(".header-band[data-breathing-waves]").first();
    await expect(band).toBeVisible();
    await expect(band.locator("canvas")).toHaveAttribute("aria-hidden", "true");
    await expect(band.locator(".header-title")).toContainText("Scrum Poker Free Use License");
    await assertSizedCanvas(band);
    expect(errs).toEqual([]);
  });

  test("renders inside initially-hidden room section after login", async ({ page, context }) => {
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

    const band = page.locator("#poker-room-section .header-band[data-breathing-waves]");
    await expect(band).toBeVisible();
    await expect(band.locator("canvas")).toHaveAttribute("aria-hidden", "true");
    await expect(band.locator(".header-title")).toContainText("Scrum Poker Room");
    await assertSizedCanvas(band);

    expect(errs).toEqual([]);
  });
});
