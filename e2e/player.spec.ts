import { expect, test, type BrowserContext } from "@playwright/test";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { getCampaignDetail, transitionCampaign } from "../app/lib/campaigns";
import { closeDb, getDb } from "../app/lib/db";
import { writeFileSync } from "node:fs";
import { LOCALE_COOKIE_NAME } from "../app/i18n/config";

let fixture: Awaited<ReturnType<typeof createPlayerFixtures>>;
const origin = "http://localhost:3100";
test.beforeAll(async () => {
  fixture = await createPlayerFixtures("PLAYER-E2E");
  const campaign=await getCampaignDetail(fixture.advertiser,fixture.campaignId);
  if(campaign?.campaign.status==="planning")await transitionCampaign(fixture.admin,fixture.campaignId,{action:"operator_confirm",expectedVersion:campaign.campaign.version});
  await getDb().query("UPDATE players SET revoked_at=NOW() WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id]);
  await getDb().query("DELETE FROM media_resources WHERE inventory_id=$1", [fixture.screen.id]);
  await getDb().query("UPDATE device_alerts SET status='ended' WHERE institution_id=$1", [fixture.institution.id]);
});
test.afterAll(async () => closeDb());

async function login(context: BrowserContext, email: string) {
  const response = await context.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email, password: pilotPassword }, maxRedirects: 0 });
  expect(response.status()).toBe(303);
  expect((await context.cookies()).some((cookie) => cookie.name === "ooh_session")).toBe(true);
}

test("P0 role boundaries and campaign flags are exercised with reproducible mixed fixtures", async ({ browser }) => {
  for (const account of [fixture.institution, fixture.otherInstitution, fixture.admin, fixture.advertiser, fixture.operator]) {
    const context = await browser.newContext();
    try {
      await login(context, account.email);
      const status = await context.request.get(`${origin}/api/inventory/${fixture.screen.id}/player`);
      expect(status.status()).toBe([fixture.institution.id, fixture.admin.id].includes(account.id) ? 200 : 403);
      const campaigns = await context.request.get(`${origin}/api/campaigns`);
      expect(campaigns.status()).toBe(process.env.PILOT_CAMPAIGN_FLAGS === "false" ? 404 : 200);
      const page = await context.newPage();
      await page.goto(account.role === "institutional" || account.role === "admin" ? "/government" : `/?role=${account.role}&view=${account.role === "operator" ? "inventory" : "campaigns"}`);
      await expect(page.locator("main").first()).toBeVisible();
      await expect(page.getByText("Application error", { exact: false })).toHaveCount(0);
      if(account.role==="advertiser"&&process.env.PILOT_CAMPAIGN_FLAGS!=="false") {
        await page.getByRole("button",{name:/PLAYER-E2E mixed campaign/}).click();
        await expect(page.getByText(/seconds per .* second loop/)).toBeVisible();
        await page.getByRole("button",{name:"Open campaign report",exact:true}).click();
        await expect(page.getByText("Player-reported completed plays",{exact:true})).toBeVisible();
      }
    } finally { await context.close(); }
  }
});

test("paired Chrome screen updates without reload, acknowledges revisions, recovers, and respects revocation", async ({ browser }, testInfo) => {
  test.setTimeout(240_000);
  const owner = await browser.newContext();
  const display = await browser.newContext();
  try {
    await login(owner, fixture.institution.email);
    const page = await display.newPage();
    const dashboard = await owner.newPage();
    await dashboard.goto("/government?view=network");
    const control = dashboard.getByRole("region", { name: "Player connection" });
    await expect(control).toBeVisible();
    await control.getByRole("button", { name: "Create pairing code" }).click();
    const code = await control.getByLabel("Pairing code", { exact: true }).inputValue();
    expect(code).toMatch(/^[A-F0-9]{12}$/);
    await page.goto("/player");
    await page.getByLabel("Pairing code", { exact: true }).fill(code);
    await page.getByRole("button", { name: "Pair this screen", exact: true }).click();
    await expect(page.locator(".device-player")).toBeVisible();
    const credential = (await display.cookies()).find((cookie) => cookie.name === "easyad_player")!;
    expect(credential.httpOnly).toBe(true); expect(credential.path).toBe("/api/player");
    expect(await page.evaluate(() => document.cookie)).not.toContain("easyad_player");
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    const endpoint = `${origin}/api/inventory/${fixture.screen.id}/player`;
    const status = async () => (await (await owner.request.get(endpoint)).json()).player;
    await expect.poll(async () => { const p = await status(); return p.appliedRevision === p.expectedRevision && p.appliedRevision > 0; }).toBe(true);

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
    const upload = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/media`, { headers: { Origin: origin }, multipart: { title: "Pilot approved image", file: { name: "pilot.png", mimeType: "image/png", buffer: png } } });
    expect(upload.status()).toBe(201);
    const resource = (await upload.json()).resource;
    await expect(page.locator(`[data-player-slide="${resource.id}"] img`)).toBeVisible({ timeout: 30_000 });
    expect(await page.locator(`[data-player-slide="${resource.id}"] img`).evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

    const samples: number[] = [];
    for (const interval of [7, 8, 9, 10, 11]) {
      const started = Date.now();
      expect((await owner.request.patch(`${origin}/api/inventory/${fixture.screen.id}`, { headers: { Origin: origin }, data: { imageInterval: interval } })).ok()).toBe(true);
      const expectedRevision = (await status()).expectedRevision;
      await expect.poll(async () => (await status()).appliedRevision, { timeout: 30_000, intervals: [500, 1000] }).toBe(expectedRevision);
      samples.push(Date.now() - started);
    }
    const p95 = [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
    expect(p95).toBeLessThan(30_000);
    const latencyPath = testInfo.outputPath("publication-latency.json");
    writeFileSync(latencyPath, JSON.stringify({ samples, p95, unit: "ms", count: samples.length, pollMs: 10000, runtime: "Windows desktop Chrome", claims: "Applied acknowledgment only, not playback evidence" }, null, 2));
    await testInfo.attach("publication-latency.json", { path: latencyPath, contentType: "application/json" });

    const alertResponse = await owner.request.post(`${origin}/api/institution/alerts`, { headers: { Origin: origin }, data: { alertType: "public-safety", title: "Pilot screen notice", message: "Test notice only", area: "Lobby", targetDeviceIds: [fixture.screen.id], expiresAt: new Date(Date.now() + 120_000).toISOString() } });
    expect(alertResponse.status()).toBe(201);
    const alert = (await alertResponse.json()).alert;
    await expect(page.getByRole("heading", { name: "Pilot screen notice" })).toBeVisible({ timeout: 30_000 });
    expect((await owner.request.patch(`${origin}/api/institution/alerts/${alert.id}`, { headers: { Origin: origin }, data: { action: "end" } })).ok()).toBe(true);
    await expect(page.getByRole("heading", { name: "Pilot screen notice" })).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator(`[data-player-slide="${resource.id}"] img`)).toBeVisible();

    // Keep the same browser page open across a genuine browser-network outage.
    await display.setOffline(true);
    await expect.poll(async () => (await status()).connection, { timeout: 30_000 }).toBe("stale");
    await display.setOffline(false);
    await expect.poll(async () => (await status()).connection, { timeout: 30_000 }).toBe("online");

    expect((await owner.request.delete(`${origin}/api/media/${resource.id}`, { headers: { Origin: origin } })).ok()).toBe(true);
    await expect(page.locator(`[data-player-slide="${resource.id}"] img`)).toHaveCount(0, { timeout: 30_000 });
    expect((await owner.request.patch(`${origin}/api/inventory/${fixture.screen.id}`, { headers: { Origin: origin }, data: { approvalStatus: "pending approval" } })).ok()).toBe(true);
    await expect(page.getByText("This screen is unpublished. Waiting for approved content.")).toBeVisible({ timeout: 30_000 });

    // Public display requests carry no player authority and do not alter acknowledgments.
    const before = await status();
    const preview = await owner.request.get(`${origin}/api/public/devices/${fixture.screen.id}/media`);
    expect(preview.status()).toBe(404);
    expect((await status()).appliedRevision).toBe(before.appliedRevision);
    expect((await owner.request.delete(endpoint, { headers: { Origin: origin }, data: { playerId: before.id } })).ok()).toBe(true);
    await expect(page.getByRole("button", { name: "Pair this screen", exact: true })).toBeVisible({ timeout: 30_000 });
    expect((await display.request.get(`${origin}/api/player/manifest`)).status()).toBe(401);
    await dashboard.reload();
    await expect(control.getByText("Not paired", { exact: true })).toBeVisible();
    await dashboard.setViewportSize({ width: 390, height: 844 });
    await control.scrollIntoViewIfNeeded();
    await expect(control.getByRole("button", { name: "Create pairing code" })).toBeVisible();
    await dashboard.screenshot({ path: testInfo.outputPath("player-control-mobile.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("player-pairing-mobile.png"), fullPage: true });
  } finally { await owner.close(); await display.close(); }
});

test("player setup supports French, keyboard validation, reduced motion, and 200 percent reflow", async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 780, height: 844 }, reducedMotion: "reduce" });
  try {
    await context.addCookies([{ name: LOCALE_COOKIE_NAME, value: "fr", url: origin }]);
    const page = await context.newPage();
    await page.goto("/player");
    const input = page.getByLabel("Code de jumelage", { exact: true });
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute("type", "password");
    await input.focus();
    await page.keyboard.press("Enter");
    await expect(input).toBeFocused();
    await expect(page.getByRole("alert").filter({ hasText: "Entrez un code" })).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Afficher le code de jumelage" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(input).toHaveAttribute("type", "text");
    await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const button = page.getByRole("button", { name: "Jumeler cet écran" });
    const background = await button.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ path: testInfo.outputPath("player-french-200-percent.png"), fullPage: true });
    await page.emulateMedia({ forcedColors: "active" });
    await expect(button).toBeVisible();
  } finally { await context.close(); }
});
