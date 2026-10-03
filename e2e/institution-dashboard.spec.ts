import { expect, test } from "@playwright/test";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb, getInventory, updateInventoryRecord } from "../app/lib/db";
import { LOCALE_COOKIE_NAME } from "../app/i18n/config";

test.afterAll(async () => closeDb());
test.use({ launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl"] } });

test("clicking a visible institution pin keeps it under the pointer", async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type.startsWith("webgl") || type === "experimental-webgl") return null;
      return original.call(this, type as "2d", ...args as []);
    } as typeof original;
  });
  const fixture = await createPlayerFixtures("MAP-STABLE-E2E");
  await updateInventoryRecord(fixture.staticId, { x: fixture.screen.x + 0.2, y: fixture.screen.y + 0.1 });
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3100" },
    form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto("/government");
  const pin = page.locator(".map-fallback").getByRole("button", { name: "MAP-STABLE-E2E Billboard, Static Billboard" });
  await expect(pin).toBeVisible();
  const before = await pin.boundingBox();
  expect(before).not.toBeNull();
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  const after = await pin.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
});

test("clicking an undragged WebGL edge pin keeps it under the pointer", async ({ page, context }) => {
  const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64");
  let releaseTiles: () => void = () => undefined;
  const tilesReady = new Promise<void>((resolve) => { releaseTiles = resolve; });
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await tilesReady;
    await route.fulfill({ contentType: "image/png", body: tile });
  });
  const fixture = await createPlayerFixtures("MAP-WEBGL-E2E");
  await updateInventoryRecord(fixture.staticId, { x: fixture.screen.x - 0.2, y: fixture.screen.y + 0.52 });
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3100" },
    form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto("/government");
  try {
    await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-loading/);
    await expect(page.locator(".maplibre-shell .fallback-pin")).toHaveCount(0);
  } finally {
    releaseTiles();
  }
  await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-ready/);

  const pin = page.locator(".maplibre-shell.maplibre-ready").getByRole("button", { name: "MAP-WEBGL-E2E Billboard, Static Billboard" });
  await expect(pin).toBeVisible();
  await page.waitForTimeout(500);
  const map = page.locator(".maplibre-shell.maplibre-ready .maplibre-map");
  await map.scrollIntoViewIfNeeded();
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();
  const before = await pin.boundingBox();
  expect(before).not.toBeNull();
  expect(before!.y + before!.height).toBeGreaterThan(mapBox!.y + mapBox!.height);
  expect(before!.y).toBeLessThan(mapBox!.y + mapBox!.height);
  await page.mouse.move(before!.x + 17, before!.y + 8);
  await page.mouse.down();
  try {
    await page.waitForTimeout(200);
    const pressed = await pin.boundingBox();
    expect(pressed).not.toBeNull();
    expect(Math.abs(pressed!.x - before!.x)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.y - before!.y)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.width - before!.width)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.height - before!.height)).toBeLessThan(0.5);
  } finally {
    await page.mouse.up();
  }
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  const after = await pin.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
});

test("a late WebGL load cannot replace a clickable fallback pin", async ({ page, context }) => {
  const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64");
  let releaseTiles: () => void = () => undefined;
  const tilesReady = new Promise<void>((resolve) => { releaseTiles = resolve; });
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await tilesReady;
    try { await route.fulfill({ contentType: "image/png", body: tile }); } catch { /* WebGL may have timed out and canceled this request. */ }
  });
  const fixture = await createPlayerFixtures("MAP-LATE-E2E");
  await updateInventoryRecord(fixture.staticId, { x: fixture.screen.x + 0.2, y: fixture.screen.y + 0.1 });
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3100" },
    form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto("/government");
  await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-loading/);
  await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-fallback-mode/, { timeout: 12_000 });
  const pin = page.locator(".map-fallback").getByRole("button", { name: "MAP-LATE-E2E Billboard, Static Billboard" });
  await expect(pin).toBeVisible();
  const before = await pin.boundingBox();
  expect(before).not.toBeNull();
  releaseTiles();
  await page.waitForTimeout(600);
  await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-fallback-mode/);
  await pin.click();
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  const after = await pin.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThan(2);
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
});

test("clicking a customer map pin does not move the pin or map", async ({ page, context }) => {
  const tile = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64");
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ contentType: "image/png", body: tile }));
  const fixture = await createPlayerFixtures("MAP-CUSTOMER-E2E");
  await updateInventoryRecord(fixture.screen.id, { x: 67.29, y: 40.95 });
  await updateInventoryRecord(fixture.staticId, { x: 67.34, y: 40.95 });
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3100" },
    form: { email: fixture.advertiser.email, password: pilotPassword }, maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto("/?role=advertiser&view=discover");
  await expect(page.locator(".maplibre-shell")).toHaveClass(/maplibre-ready/);

  const map = page.locator(".map-stage .maplibre-map");
  const pin = page.locator(".map-stage .maplibre-shell.maplibre-ready").getByRole("button", { name: "MAP-CUSTOMER-E2E Billboard, Static Billboard" });
  await expect(pin).toBeVisible();
  const mapBefore = await map.boundingBox();
  const pinBefore = await pin.boundingBox();
  expect(mapBefore).not.toBeNull();
  expect(pinBefore).not.toBeNull();
  await page.mouse.move(pinBefore!.x + pinBefore!.width / 2, pinBefore!.y + pinBefore!.height / 2);
  await page.mouse.down();
  try {
    await page.waitForTimeout(200);
    const pressed = await pin.boundingBox();
    expect(pressed).not.toBeNull();
    expect(Math.abs(pressed!.x - pinBefore!.x)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.y - pinBefore!.y)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.width - pinBefore!.width)).toBeLessThan(0.5);
    expect(Math.abs(pressed!.height - pinBefore!.height)).toBeLessThan(0.5);
    expect(await map.boundingBox()).toEqual(mapBefore);
  } finally {
    await page.mouse.up();
  }
  await expect(pin).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(600);
  const mapAfter = await map.boundingBox();
  const pinAfter = await pin.boundingBox();
  expect(mapAfter).not.toBeNull();
  expect(pinAfter).not.toBeNull();
  expect(Math.abs(mapAfter!.x - mapBefore!.x)).toBeLessThan(2);
  expect(Math.abs(mapAfter!.y - mapBefore!.y)).toBeLessThan(2);
  expect(Math.abs(pinAfter!.x - pinBefore!.x)).toBeLessThan(2);
  expect(Math.abs(pinAfter!.y - pinBefore!.y)).toBeLessThan(2);
});

test("institution dashboard saves settings, recovers from failure, and fits a phone", async ({ page, context }) => {
  const fixture = await createPlayerFixtures("DASHBOARD-E2E");
  const response = await context.request.post("/api/auth/login", {
    headers: { Origin: "http://localhost:3100" },
    form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  await page.goto("/government");
  await page.getByRole("button", { name: /DASHBOARD-E2E City Hall Screen.*Published/ }).click();
  const search = page.getByRole("searchbox", { name: "Find a screen" });
  await search.fill("missing-screen");
  await expect(page.getByText("No matching screens. Clear the search to see your fleet.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "Edit display settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Edit display settings" });
  await dialog.getByRole("combobox", { name: "Template", exact: true }).selectOption("weather");
  await dialog.getByLabel("Image duration (seconds)").fill("12");
  await page.route(`**/api/inventory/${fixture.screen.id}`, (route) => route.fulfill({ status: 503, json: { error: "Unable to save display settings. Try again." } }));
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByLabel("Image duration (seconds)")).toHaveValue("12");
  await page.unroute(`**/api/inventory/${fixture.screen.id}`);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await getInventory(fixture.screen.id))?.imageInterval).toBe(12);
  expect((await getInventory(fixture.screen.id))?.displayTemplate).toBe("weather");
  await expect(page.getByRole("button", { name: "Edit display settings" })).toBeFocused();
  await page.screenshot({ path: "docs/verification/institution-dashboard-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Edit display settings" }).click();
  await expect(dialog.getByRole("button", { name: "Save changes" })).toBeInViewport();
  await page.screenshot({ path: "docs/verification/institution-dashboard-phone.png" });
  await page.keyboard.press("Escape");
  await context.addCookies([{ name: LOCALE_COOKIE_NAME, value: "fr", url: "http://localhost:3100" }]);
  await page.reload();
  await page.getByRole("button", { name: "Modifier les paramètres d’affichage" }).click();
  await expect(page.getByRole("combobox", { name: "Langue d’affichage", exact: true })).toBeVisible();
});
