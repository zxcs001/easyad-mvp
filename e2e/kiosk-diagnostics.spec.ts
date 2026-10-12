import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb, getDb } from "../app/lib/db";
import { createPairingCode } from "../app/lib/players";
const origin = "http://localhost:3100";
test.afterAll(() => closeDb());
test("paired kiosk reports health and recovers remotely without losing pairing, media or stored evidence", async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const fixture = await createPlayerFixtures(`DIAG-${Date.now()}`);
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), display = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  try {
    expect((await owner.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0 })).status()).toBe(303);
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#167452" } }).png().toBuffer();
    const upload = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/media`, { headers: { Origin: origin }, multipart: { title: "Kiosk recovery message", file: { name: "message.png", mimeType: "image/png", buffer: bytes } } });
    expect(upload.status()).toBe(201); const { resource } = await upload.json();
    const player = await display.newPage(); let downloads = 0;
    player.on("request", request => { if (request.url().includes("/api/player/assets/")) downloads++; });
    await player.goto(`${origin}/player?kiosk=1`);
    await player.getByLabel("Pairing code", { exact: true }).fill((await createPairingCode(fixture.institution, fixture.screen.id)).code);
    await player.getByRole("button", { name: "Pair this screen", exact: true }).click();
    const image = player.locator(`[data-player-slide="${resource.id}"] img`);
    await expect(image).toBeVisible({ timeout: 30000 });
    const paired = (await getDb().query("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id])).rows[0].id;
    const cookie = (await display.cookies()).find(item => item.name === "easyad_player")!.value;
    await expect.poll(async () => (await getDb().query("SELECT diagnostics FROM players WHERE id=$1", [paired])).rows[0].diagnostics?.assetCount, { timeout: 20000 }).toBe(1);
    const firstReport = (await getDb().query("SELECT diagnostics FROM players WHERE id=$1", [paired])).rows[0].diagnostics;
    expect(firstReport).toMatchObject({ kiosk: true, visible: true, browser: "Chrome", storageAvailable: true, appliedRevision: expect.any(Number) });
    const page = await owner.newPage(); await page.goto(`${origin}/government?view=fleet`);
    await page.getByRole("tab", { name: "Kiosk diagnostics", exact: true }).click();
    const card = page.getByRole("article", { name: fixture.screen.name, exact: true });
    await expect(card.getByText("Cached media", { exact: true })).toBeVisible();
    const status = async (id: string) => (await getDb().query("SELECT status FROM player_recovery_commands WHERE id=$1", [id])).rows[0]?.status;
    async function recovery(label: string, kind: string) {
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      const response = page.waitForResponse(response => response.url().endsWith(`/api/inventory/${fixture.screen.id}/player/recovery`) && response.request().method() === "POST");
      await card.getByRole("button", { name: label, exact: true }).click();
      const queued = await response; expect(queued.status()).toBe(202);
      const command = (await queued.json()).command; expect(command.kind).toBe(kind); return command.id as string;
    }
    const fresh = await recovery("Refresh content", "refresh_content");
    await expect.poll(() => status(fresh), { timeout: 20000 }).toBe("succeeded");
    // Keep a quarantined evidence record: recovery must never silently delete it.
    await player.evaluate(async playerId => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("easyad-player-v2", 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => { const tx = db.transaction("outbox", "readwrite"); tx.objectStore("outbox").put({ eventId: "DIAG-QUARANTINED", playerId, rejected: 422, event: {} }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); db.close();
    }, paired);
    const oldUrl = await image.getAttribute("src"), before = downloads;
    await player.route("**/api/player/assets/**", async route => { await new Promise(resolve => setTimeout(resolve, 10000)); await route.continue().catch(() => {}); });
    await player.route("**/api/player/events", async route => { await new Promise(resolve => setTimeout(resolve, 10000)); await route.continue().catch(() => {}); });
    const rebuild = await recovery("Rebuild media cache", "rebuild_cache");
    await expect.poll(() => status(rebuild), { timeout: 20000 }).toBe("received");
    const duringDownload = Date.now();
    await expect.poll(async () => new Date((await getDb().query("SELECT last_seen_at FROM players WHERE id=$1", [paired])).rows[0].last_seen_at).getTime(), { timeout: 10000 }).toBeGreaterThan(duringDownload + 1000);
    await expect(image).toBeVisible();
    await expect.poll(() => status(rebuild), { timeout: 20000 }).toBe("succeeded");
    await player.unrouteAll({ behavior: "wait" });
    expect(downloads).toBeGreaterThan(before); await expect(image).toBeVisible(); expect(await image.getAttribute("src")).not.toBe(oldUrl);
    const reload = await recovery("Reload kiosk page", "reload_player");
    await expect.poll(() => status(reload), { timeout: 45000 }).toBe("succeeded");
    await expect(image).toBeVisible(); expect(player.url()).toContain("kiosk=1");
    expect((await display.cookies()).find(item => item.name === "easyad_player")!.value).toBe(cookie);
    await expect.poll(async () => (await getDb().query("SELECT diagnostics FROM players WHERE id=$1", [paired])).rows[0].diagnostics.sessionId).not.toBe(firstReport.sessionId);
    await expect.poll(async () => (await getDb().query("SELECT diagnostics FROM players WHERE id=$1", [paired])).rows[0].diagnostics.playback, { timeout: 15000 }).toBe("playing");
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(card.getByText("Reported complete", { exact: false }).first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("fleet-diagnostics-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("fleet-diagnostics-phone.png"), fullPage: true });

    await display.setOffline(true);
    const expired = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/player/recovery`, { headers: { Origin: origin }, data: { kind: "reload_player", playerId: paired, requestKey: randomUUID() } });
    expect(expired.status()).toBe(202); const expiredId = (await expired.json()).command.id;
    expect(await status(expiredId)).toBe("queued");
    await getDb().query("UPDATE player_recovery_commands SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [expiredId]);
    await display.setOffline(false); await expect.poll(() => status(expiredId), { timeout: 20000 }).toBe("expired");
    // Failed rebuilding leaves the previous valid cache available for offline restart.
    await player.route("**/api/player/assets/**", route => route.fulfill({ status: 404, body: "" }));
    const failed = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/player/recovery`, { headers: { Origin: origin }, data: { kind: "rebuild_cache", playerId: paired, requestKey: randomUUID() } });
    expect(failed.status()).toBe(202); const failedId = (await failed.json()).command.id;
    await expect.poll(() => status(failedId), { timeout: 20000 }).toBe("failed");
    await expect.poll(() => player.evaluate(async () => Boolean(await (await caches.open("easyad-player-shell-v1")).match("/player")))).toBe(true);
    await display.setOffline(true); await player.reload({ waitUntil: "domcontentloaded" });
    await expect(image).toBeVisible({ timeout: 15000 }); expect(await image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBe(640);
    const retained = await player.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open("easyad-player-v2", 1); request.onsuccess = () => resolve(request.result); });
      const record = await new Promise(resolve => { const request = db.transaction("outbox").objectStore("outbox").get("DIAG-QUARANTINED"); request.onsuccess = () => resolve(request.result); }); db.close(); return record;
    });
    expect(retained).toMatchObject({ playerId: paired, rejected: 422 });
    await player.screenshot({ path: testInfo.outputPath("fleet-recovery-offline.png") });
  } finally { await owner.close(); await display.close(); }
});
