import { expect, test } from "@playwright/test";
import { closeDb, createBookingRecord, createPopLog, getDb } from "../app/lib/db";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";

test.afterAll(async () => closeDb());

test("reports keep demo delivery unknown, recover from errors and share declarations with print", async ({ browser }, testInfo) => {
  const fixture = await createPlayerFixtures(`REPORT-${Date.now()}`);
  const today = new Date().toISOString().slice(0, 10);
  const booking = await createBookingRecord({ id: `BK-REPORT-${Date.now()}`, advertiser: fixture.advertiser.name, inventoryId: fixture.screen.id, campaign: "Accurate delivery check", start: today, end: today, adSlots: 1, creativeStatus: "approved", status: "live", spend: 100, paid: false, pop: 100 }, fixture.advertiser.id);
  await getDb().query("UPDATE inventory SET measurement_source='Pilot audience estimate' WHERE id=$1", [fixture.screen.id]);
  await createPopLog({ bookingId: booking.id, inventoryId: fixture.screen.id, plays: 1000, impressions: 10000, status: "verified", source: "demo-seed", playedAt: new Date().toISOString() });
  const context = await browser.newContext();
  try {
    const login = await context.request.post("/api/auth/login", { headers: { Origin: "http://localhost:3100" }, form: { email: fixture.advertiser.email, password: pilotPassword }, maxRedirects: 0 });
    expect(login.status()).toBe(303);
    const page = await context.newPage();
    await page.goto("/?role=advertiser&view=reports");
    await expect(page.getByText(/Delivery unknown:/)).toBeVisible();
    const overview = page.locator(".reports-grid > .panel").first();
    await expect(overview.getByText("Estimated views", { exact: true }).locator(".." )).toContainText("—");
    await expect(page.getByText("Demo plays (excluded)").locator("..")).toContainText("1,000");
    await expect(page.getByText("Verified CPM", { exact: true })).toHaveCount(0);
    await page.route("**/api/delivery", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Unavailable" }) }));
    await page.getByRole("button", { name: "Refresh delivery" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Delivery evidence is unavailable" })).toBeVisible();
    await expect(overview.getByText("Player-reported completed plays", { exact: true }).locator("..")).toContainText("—");
    await page.unroute("**/api/delivery");
    await createPopLog({ bookingId: booking.id, inventoryId: fixture.screen.id, plays: 10, impressions: 1, status: "verified", source: "operator-declaration", playedAt: new Date().toISOString() });
    await page.getByRole("button", { name: "Refresh delivery" }).click();
    await expect(page.getByText("Estimate based on operator declarations; no authenticated player reports.")).toBeVisible();
    await expect(overview.getByText("Operator-declared completed plays", { exact: true }).locator("..")).toContainText("10");
    await expect(overview.getByText("Estimated views", { exact: true }).locator("..")).toContainText("<1");
    await expect(overview.getByText("Estimated CPM", { exact: true }).locator("..")).toContainText("$144,000.00");
    await page.screenshot({ path: testInfo.outputPath("delivery-report-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.locator(".reports-grid").evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("delivery-report-mobile.png"), fullPage: true });
    const print = await context.newPage();
    await print.goto(`/report/${booking.id}`);
    await expect(print.getByText("Estimate based on operator declarations; no authenticated player reports.")).toBeVisible();
    await expect(print.getByText("Operator-declared completed plays").locator("..")).toContainText("10");
    await expect(print.getByText("Demo plays (excluded)").locator("..")).toContainText("1,000");
    await expect(print.getByText("Audience figure from Pilot audience estimate", { exact: false })).toBeVisible();
    await print.emulateMedia({ media: "print" });
    await expect(print.getByRole("button", { name: "Print or save as PDF" })).toBeHidden();
    await print.screenshot({ path: testInfo.outputPath("delivery-report-print.png"), fullPage: true });
  } finally { await context.close(); }
});
