import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb } from "../app/lib/db";
import { createPairingCode } from "../app/lib/players";
const origin = "http://localhost:3100";
test.afterAll(async () => closeDb());
test("owner saves weekly hours, pauses, resumes, and the offline player follows daily windows", async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const fixture = await createPlayerFixtures(`REC-${Date.now()}`);
  const owner = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), display = await browser.newContext(), anonymous = await browser.newContext();
  try {
    expect((await owner.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email: fixture.institution.email, password: pilotPassword }, maxRedirects: 0 })).status()).toBe(303);
    const bytes = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#167452" } }).png().toBuffer();
    const upload = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/media`, { headers: { Origin: origin }, multipart: { title: "Weekly service message", file: { name: "message.png", mimeType: "image/png", buffer: bytes } } });
    expect(upload.status()).toBe(201);
    const { resource } = await upload.json();
    const page = await owner.newPage();
    await page.goto(`${origin}/government?view=resources`);
    await page.getByRole("button", { name: /Weekly service message/ }).click();
    const editor = page.getByRole("region", { name: "Recurring content schedule" });
    await expect(editor).toBeVisible();
    await editor.getByLabel("Repeat", { exact: true }).selectOption("weekly");
    for (const day of ["Monday", "Wednesday", "Friday"]) await editor.getByLabel(day, { exact: true }).uncheck();
    await editor.getByLabel("All day", { exact: true }).uncheck();
    await editor.getByLabel("Start time", { exact: true }).fill("22:00");
    await editor.getByLabel("End time", { exact: true }).fill("02:00");
    await editor.getByLabel("Timezone", { exact: true }).fill("America/Vancouver");
    await editor.getByLabel("First date (optional)", { exact: true }).fill("2026-10-01");
    await editor.getByLabel("Last date (optional)", { exact: true }).fill("2099-12-31");
    const saved = page.waitForResponse(response => response.url().endsWith(`/api/media/${resource.id}/schedule`) && response.request().method() === "PATCH");
    await editor.getByRole("button", { name: "Save schedule", exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(editor.getByRole("button", { name: "Save schedule", exact: true })).toBeDisabled();
    await page.reload();
    await expect(editor.getByLabel("Start time", { exact: true })).toHaveValue("22:00");
    await expect(editor.getByLabel("Tuesday", { exact: true })).toBeChecked();
    await expect(editor.getByLabel("Monday", { exact: true })).not.toBeChecked();
    await editor.getByRole("button", { name: "Pause schedule", exact: true }).click();
    await expect(page.locator(".cms-detail .cms-status")).toHaveText("Schedule paused");
    await page.screenshot({ path: testInfo.outputPath("recurring-content-desktop.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await editor.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("recurring-content-phone.png"), fullPage: true });
    await editor.getByRole("button", { name: "Resume schedule", exact: true }).click();
    await expect(editor.getByRole("button", { name: "Pause schedule", exact: true })).toBeEnabled();
    expect((await anonymous.request.get(`${origin}${resource.publicUrl}`)).status()).toBe(404);

    const initialTime = Date.now(), starts = Math.ceil((initialTime + 30000) / 60000) * 60000, ends = starts + 60000;
    const clockTime = (value: number) => new Date(value).toISOString().slice(11, 16);
    const current = await owner.request.get(`${origin}/api/inventory/${fixture.screen.id}/media`);
    const revision = (await current.json()).resources.find((item: { id: string }) => item.id === resource.id).revision;
    const recurring = await owner.request.patch(`${origin}/api/media/${resource.id}/schedule`, { headers: { Origin: origin }, data: { revision, schedule: { version: 1, timezone: "UTC", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: clockTime(starts), endTime: clockTime(ends), startDate: null, endDate: null, paused: false } } });
    expect(recurring.status()).toBe(200);
    expect((await anonymous.request.get(`${origin}/api/public/devices/${fixture.screen.id}/media`)).status()).toBe(200);
    expect((await (await anonymous.request.get(`${origin}/api/public/devices/${fixture.screen.id}/media`)).json()).items).toHaveLength(0);
    const player = await display.newPage();
    await player.clock.install({ time: new Date(initialTime) });
    await player.goto(`${origin}/player`);
    await player.getByLabel("Pairing code", { exact: true }).fill((await createPairingCode(fixture.institution, fixture.screen.id)).code);
    await player.getByRole("button", { name: "Pair this screen", exact: true }).click();
    await expect(player.locator(".device-player")).toBeVisible();
    await expect(player.locator(`[data-player-slide="${resource.id}"] img`)).toHaveCount(0);
    await expect.poll(() => player.evaluate(async () => Boolean(await (await caches.open("easyad-player-shell-v1")).match("/player")))).toBe(true);
    await display.setOffline(true);
    // Existing cached manifest and asset turn on and off solely from the local clock.
    await player.clock.runFor(starts - initialTime + 1000);
    await expect(player.locator(`[data-player-slide="${resource.id}"] img`)).toBeVisible();
    await player.screenshot({ path: testInfo.outputPath("recurring-content-offline.png") });
    await player.clock.runFor(61000);
    await expect(player.locator(`[data-player-slide="${resource.id}"] img`)).toHaveCount(0);
  } finally { await owner.close(); await display.close(); await anonymous.close(); }
});

test("operator edits enter owner review with visible rules and the displayed revision", async ({ browser }) => {
  const fixture = await createPlayerFixtures(`REC-REVIEW-${Date.now()}`);
  const owner = await browser.newContext(), operator = await browser.newContext();
  try {
    for (const [context, account] of [[owner, fixture.institution], [operator, fixture.operator]] as const) expect((await context.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email: account.email, password: pilotPassword }, maxRedirects: 0 })).status()).toBe(303);
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#167452" } }).png().toBuffer();
    const upload = await owner.request.post(`${origin}/api/inventory/${fixture.screen.id}/media`, { headers: { Origin: origin }, multipart: { title: "Review recurring hours", file: { name: "message.png", mimeType: "image/png", buffer: bytes } } });
    const { resource } = await upload.json();
    const edit = await operator.request.patch(`${origin}/api/media/${resource.id}/schedule`, { headers: { Origin: origin }, data: { revision: resource.revision, schedule: { version: 1, timezone: "Europe/Paris", daysOfWeek: [0, 1, 2, 3, 4, 5, 6], startTime: "00:00", endTime: "24:00", startDate: null, endDate: null, paused: false } } });
    expect(edit.status()).toBe(200);
    expect((await edit.json()).resource.approvalStatus).toBe("pending review");
    const page = await owner.newPage();
    await page.goto(`${origin}/government?view=approvals`);
    const card = page.locator(".approval-card").filter({ hasText: "Review recurring hours" });
    await expect(card.getByText("Every day · All day · Europe/Paris", { exact: true })).toBeVisible();
    const approval = page.waitForResponse(response => response.url().endsWith(`/api/media/${resource.id}`) && response.request().method() === "PATCH");
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    const response = await approval;
    expect(response.request().postDataJSON()).toEqual({ approvalStatus: "approved", revision: 2 });
    expect(response.status()).toBe(200);
    await expect(card).toHaveCount(0);
  } finally { await owner.close(); await operator.close(); }
});
