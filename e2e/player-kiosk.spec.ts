import { expect, test, devices } from "@playwright/test";
import { createPlayerFixtures } from "../tests/helpers/player-fixtures";
import { closeDb, createMediaResource, getDb } from "../app/lib/db";
import { createPairingCode } from "../app/lib/players";
import { storeMedia } from "../app/lib/media-storage";

test.afterAll(() => closeDb());

for (const platform of ["desktop", "android"] as const) {
  test(`kiosk pairs, fills the ${platform} viewport, and restores offline from the shared shell`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000);
    const fixture = await createPlayerFixtures(`KIOSK-${platform.toUpperCase()}`);
    await getDb().query("UPDATE players SET revoked_at=NOW() WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id]);
    await getDb().query("DELETE FROM media_resources WHERE inventory_id=$1", [fixture.screen.id]);
    await getDb().query("UPDATE device_alerts SET status='ended' WHERE institution_id=$1", [fixture.institution.id]);
    const mediaId = `KIOSK-${platform}-IMAGE`;
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const storagePath = await storeMedia(`pilot/${mediaId}.png`, png, "image/png");
    await createMediaResource({ id: mediaId, inventoryId: fixture.screen.id, ownerId: fixture.institution.id, title: "Kiosk test", originalName: "kiosk.png", mimeType: "image/png", mediaType: "image", approvalStatus: "approved", sizeBytes: png.length, storagePath, publicUrl: `/media/${mediaId}`, createdAt: new Date().toISOString() });
    const context = await browser.newContext(platform === "android" ? { ...devices["Pixel 5"] } : { viewport: { width: 1920, height: 1080 } });
    try {
      const page = await context.newPage();
      await page.goto("/player?kiosk=1");
      const surface = page.locator(".player-kiosk");
      await expect(surface).toHaveAttribute("data-kiosk", "on");
      await expect(page.getByLabel("Pairing code", { exact: true })).toBeVisible();
      if (platform === "android") {
        const form = await page.locator(".player-setup-panel").boundingBox();
        const controls = await page.locator(".player-kiosk-controls").boundingBox();
        expect(controls!.y).toBeGreaterThanOrEqual(form!.y + form!.height);
      }
      await page.screenshot({ path: testInfo.outputPath(`${platform}-kiosk-setup.png`) });
      await page.getByRole("button", { name: "Hide controls", exact: true }).click();
      const code = await createPairingCode(fixture.institution, fixture.screen.id);
      await page.getByLabel("Pairing code", { exact: true }).fill(code.code);
      await page.getByRole("button", { name: "Pair this screen", exact: true }).click();
      await expect(page.locator(".device-player img")).toBeVisible({ timeout: 30_000 });
      const playerCookie = (await context.cookies()).find(cookie => cookie.name === "easyad_player");
      expect(playerCookie?.httpOnly).toBe(true);
      expect(await page.evaluate(() => localStorage.length)).toBe(0);
      for (const viewport of platform === "android" ? [{ width: 393, height: 851 }, { width: 851, height: 393 }] : [{ width: 1920, height: 1080 }]) {
        await page.setViewportSize(viewport);
        await expect.poll(() => page.locator(".device-player").boundingBox()).toMatchObject({ x: 0, y: 0, ...viewport });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.locator(".player-kiosk-trigger").click();
      await expect(page.getByRole("region", { name: "Kiosk controls" })).toBeVisible();
      await page.getByRole("button", { name: "Exit kiosk mode" }).click();
      await expect(surface).toHaveAttribute("data-kiosk", "off");
      await expect(page.locator(".device-player img")).toBeVisible();
      expect((await context.cookies()).find(cookie => cookie.name === "easyad_player")?.value).toBe(playerCookie?.value);
      await page.getByRole("button", { name: "Start kiosk mode" }).click();
      await expect(surface).toHaveAttribute("data-kiosk", "on");
      await expect.poll(async () => (await surface.getAttribute("data-controls")) === "hidden" || await page.getByRole("alert").filter({ hasText: "Fullscreen unavailable" }).isVisible()).toBe(true);
      // Fullscreen support depends on the browser automation host. Restore the
      // viewport before verifying the offline document, preserving kiosk mode.
      if (await page.evaluate(() => Boolean(document.fullscreenElement))) {
        await page.evaluate(() => document.exitFullscreen());
        await expect(surface).toHaveAttribute("data-controls", "visible");
      }
      if (await page.getByRole("button", { name: "Hide controls", exact: true }).isVisible()) await page.getByRole("button", { name: "Hide controls", exact: true }).click();
      await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open("easyad-player-shell-v1")).match("/player")))).toBe(true);
      await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
      await context.setOffline(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(surface).toHaveAttribute("data-kiosk", "on");
      await expect(page.locator(".device-player img")).toBeVisible({ timeout: 15_000 });
      expect(await page.locator(".device-player img").evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await page.getByRole("button", { name: "Hide controls", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`${platform}-kiosk-offline.png`) });
      await context.setOffline(false);
      await expect.poll(async () => (await context.request.get("/api/player/manifest")).status()).toBe(200);
    } finally { await context.close(); }
  });
}
