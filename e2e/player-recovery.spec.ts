import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { createPlayerFixtures } from "../tests/helpers/player-fixtures";
import { closeDb, createDeviceAlert, createMediaResource, getDb } from "../app/lib/db";
import { createPairingCode } from "../app/lib/players";
import { storeMedia } from "../app/lib/media-storage";
test.afterAll(() => closeDb());
test("P2 mixed media persists offline across renderer restart, then drains evidence without duplicates", async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createPlayerFixtures("P2-RECOVERY");
    await getDb().query("UPDATE players SET revoked_at=NOW() WHERE inventory_id=$1", [fixture.screen.id]);
    await getDb().query("DELETE FROM media_resources WHERE inventory_id=$1", [fixture.screen.id]);
    await getDb().query("UPDATE inventory SET image_interval=2 WHERE id=$1", [fixture.screen.id]);
    const context = await browser.newContext();
    let page = await context.newPage();
    try {
        await page.goto("/player");
        const recording = await page.evaluate(async () => {
            const canvas = document.createElement("canvas");
            canvas.width = 64;
            canvas.height = 36;
            const ctx = canvas.getContext("2d")!;
            const stream = canvas.captureStream(10);
            const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
            const chunks: Blob[] = [];
            const stopped = new Promise<string>(resolve => { recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.readAsDataURL(new Blob(chunks, { type: "video/webm" })); }; });
            recorder.start();
            let frame = 0;
            const timer = setInterval(() => { ctx.fillStyle = frame++ % 2 ? "#1f7a5a" : "#131b24"; ctx.fillRect(0, 0, 64, 36); }, 100);
            await new Promise(resolve => setTimeout(resolve, 1100));
            clearInterval(timer);
            recorder.stop();
            stream.getTracks().forEach(track => track.stop());
            return stopped;
        });
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
        for (const [name, type, bytes] of [["image", "image/png", png], ["video", "video/webm", Buffer.from(recording, "base64")], ["broken", "image/png", Buffer.from("corrupt media")]] as const) {
            const id = `P2-MEDIA-${name}`;
            const storagePath = await storeMedia(`pilot/${id}.${type.split("/")[1]}`, bytes, type);
            await createMediaResource({ id, inventoryId: fixture.screen.id, ownerId: fixture.institution.id, title: name, originalName: name, mimeType: type, mediaType: type.startsWith("video") ? "video" : "image", approvalStatus: "approved", sizeBytes: bytes.length, storagePath, publicUrl: `/media/${id}`, createdAt: new Date().toISOString() });
        }
        const code = await createPairingCode(fixture.institution, fixture.screen.id);
        await page.getByLabel("Pairing code", { exact: true }).fill(code.code);
        await page.getByRole("button", { name: "Pair this screen", exact: true }).click();
        await expect(page.locator(".device-player")).toBeVisible({ timeout: 30000 });
        const player = (await getDb().query("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id])).rows[0];
        const events = async () => (await getDb().query("SELECT * FROM digital_delivery_events WHERE player_id=$1", [player.id])).rows;
        await expect.poll(async () => (await events()).some(row => row.evidence.slideId === "P2-MEDIA-image" && row.event_type === "delivered"), { timeout: 40000 }).toBe(true);
        await expect.poll(async () => (await events()).some(row => row.evidence.slideId === "P2-MEDIA-video" && row.event_type === "delivered"), { timeout: 40000 }).toBe(true);
        expect((await events()).filter(row => row.evidence.slideId === "P2-MEDIA-broken" && row.event_type === "delivered")).toHaveLength(0);
        await expect.poll(() => page.evaluate(async () => Boolean(await (await caches.open("easyad-player-shell-v1")).match("/player")))).toBe(true);
        await context.setOffline(true);
        await page.waitForTimeout(9000);
        const pending = () => page.evaluate(() => new Promise<number>((resolve, reject) => { const open = indexedDB.open("easyad-player-v2", 1); open.onsuccess = () => { const request = open.result.transaction("outbox").objectStore("outbox").count(); request.onsuccess = () => { open.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error); }; }));
        await expect.poll(pending).toBeGreaterThan(0);
        await page.close();
        page = await context.newPage();
        await page.goto("/player", { waitUntil: "domcontentloaded" });
        await expect(page.locator(".device-player")).toBeVisible({ timeout: 15000 });
        await expect(page.getByLabel("Pairing code", { exact: true })).toHaveCount(0);
        await expect(page.locator('[data-player-slide="P2-MEDIA-image"] img')).toBeVisible({timeout:15000});
        expect(await page.locator('[data-player-slide="P2-MEDIA-image"] img').evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        await page.screenshot({ path: testInfo.outputPath("offline-restored.png") });
        await context.setOffline(false);
        await expect.poll(pending, { timeout: 40000 }).toBeLessThan(3);
        const rows = await events();
        expect(new Set(rows.map(row => row.idempotency_key)).size).toBe(rows.length);
        expect(rows.filter(row => row.event_type === "delivered").every(row => row.provenance === "authenticated_player")).toBe(true);
        expect(rows.filter(row => row.evidence.slideId === "P2-MEDIA-broken" && row.event_type === "delivered")).toHaveLength(0);
        await testInfo.attach("evidence.json", { body: JSON.stringify({ events: rows.length, completed: rows.filter(row => row.event_type === "delivered").length, duplicates: 0, videoChecksum: createHash("sha256").update(Buffer.from(recording, "base64")).digest("hex"), verification: "Temporary offline and renderer restart, not a physical 24-hour soak" }), contentType: "application/json" });
    }
    finally {
        await context.close();
    }
});
test("P2 atomic cache survives quota failure; offline alert and lease expiry survive reload", async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const fixture = await createPlayerFixtures("P2-LEASE");
    await getDb().query("UPDATE players SET revoked_at=NOW() WHERE inventory_id=$1", [fixture.screen.id]);
    await getDb().query("DELETE FROM media_resources WHERE inventory_id=$1", [fixture.screen.id]);
    await getDb().query("UPDATE device_alerts SET status='ended' WHERE institution_id=$1", [fixture.institution.id]);
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.clock.install();
    try {
        const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
        const storagePath = await storeMedia("pilot/P2-LEASE.png", bytes, "image/png");
        await createMediaResource({ id: "P2-LEASE-IMAGE", inventoryId: fixture.screen.id, ownerId: fixture.institution.id, title: "Original", originalName: "image.png", mimeType: "image/png", mediaType: "image", approvalStatus: "approved", sizeBytes: bytes.length, storagePath, publicUrl: "/media/P2-LEASE-IMAGE", createdAt: new Date().toISOString() });
        await page.goto("/player");
        const code = await createPairingCode(fixture.institution, fixture.screen.id);
        await page.getByLabel("Pairing code", { exact: true }).fill(code.code);
        await page.getByRole("button", { name: "Pair this screen", exact: true }).click();
        await expect(page.locator(".device-player img")).toBeVisible({ timeout: 30000 });
        const cached = () => page.evaluate(() => new Promise<{
            revision: number;
            validUntil: string;
            generatedAt: string;
        }>((resolve) => { const open = indexedDB.open("easyad-player-v2", 1); open.onsuccess = () => { const get = open.result.transaction("state").objectStore("state").get("active"); get.onsuccess = () => { open.result.close(); resolve(get.result); }; }; }));
        const original = await cached();
        await page.evaluate(() => {
            const original = IDBObjectStore.prototype.put;
            IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore["put"]>) { if (this.name === "assets" && (window as unknown as {
                pilotQuota: boolean;
            }).pilotQuota)
                throw new DOMException("Pilot quota failure", "QuotaExceededError"); return original.apply(this, args); };
            (window as unknown as {
                pilotQuota: boolean;
            }).pilotQuota = true;
        });
        await getDb().query("UPDATE media_resources SET title='Updated' WHERE id='P2-LEASE-IMAGE'");
        await expect.poll(async () => (await getDb().query("SELECT received_revision FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id])).rows[0].received_revision, { timeout: 30000 }).toBeGreaterThan(original.revision);
        await page.waitForTimeout(1000);
        expect((await cached()).revision).toBe(original.revision);
        await expect(page.locator(".device-player img")).toBeVisible();
        await page.evaluate(() => { (window as unknown as {
            pilotQuota: boolean;
        }).pilotQuota = false; });
        await expect.poll(async () => (await cached()).revision, { timeout: 50000 }).toBeGreaterThan(original.revision);
        const alert = await createDeviceAlert({ institutionId: fixture.institution.id, alertType: "public-safety", title: "Offline expiry test", message: "Pilot only", area: "Lobby", targetDeviceIds: [fixture.screen.id], issuedBy: "Pilot", createdBy: fixture.institution.id, expiresAt: new Date(Date.now() + 40000).toISOString() });
        await expect(page.getByRole("heading", { name: "Offline expiry test" })).toBeVisible({ timeout: 30000 });
        await context.setOffline(true);
        await page.clock.fastForward(45000);
        await expect(page.getByRole("heading", { name: "Offline expiry test" })).toHaveCount(0);
        await expect(page.locator(".device-player img")).toBeVisible();
        const lease = await cached();
        expect(Date.parse(lease.validUntil) - Date.parse(lease.generatedAt)).toBe(86_400_000);
        await page.clock.fastForward(3_600_000);
        await expect(page.locator(".device-player img")).toBeVisible();
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator(".device-player img")).toBeVisible();
        await page.clock.fastForward(Math.max(1,Date.parse(lease.validUntil)-await page.evaluate(()=>Date.now())+1000));
        await expect(page.locator(".device-player")).toHaveCount(0);
        await page.reload({ waitUntil: "domcontentloaded" });
        await expect(page.locator(".device-player")).toHaveCount(0);
        await expect.poll(()=>page.locator(".player-setup").evaluate(element=>getComputedStyle(element).display)).toBe("grid");
        await page.screenshot({ path: testInfo.outputPath("expired-fallback.png") });
        await testInfo.attach("lease.json", { body: JSON.stringify({ leaseSeconds: (Date.parse(lease.validUntil) - Date.parse(lease.generatedAt)) / 1000, atomicQuotaRollback: true, offlineAlertResumed: true, expiredAfterReload: true, clock: "Boundary simulation; not a wall-clock soak" }), contentType: "application/json" });
    }
    finally {
        await context.close();
    }
});
