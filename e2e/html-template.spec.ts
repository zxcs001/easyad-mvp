import { expect, test } from "@playwright/test";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb, getDb } from "../app/lib/db";
import { createPairingCode } from "../app/lib/players";

const origin = "http://localhost:3100";

test.afterAll(async () => closeDb());

test("edited HTML templates are sanitized, private during review, and displayed after approval", async ({ browser }) => {
  const fixture = await createPlayerFixtures(`HTML-${Date.now()}`);
  const advertiser = await browser.newContext();
  const institution = await browser.newContext();
  const other = await browser.newContext();
  const anonymous = await browser.newContext();
  const display = await browser.newContext();
  try {
    for (const [context, email] of [[advertiser, fixture.advertiser.email], [institution, fixture.institution.email], [other, fixture.otherInstitution.email]] as const) {
      expect((await context.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email, password: pilotPassword }, maxRedirects: 0 })).status()).toBe(303);
    }

    const [{ today, tomorrow }] = (await getDb().query<{ today: string; tomorrow: string }>("SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 1)::text AS tomorrow")).rows;
    const bookingResponse = await advertiser.request.post(`${origin}/api/bookings`, { headers: { Origin: origin }, multipart: {
      inventoryId: fixture.screen.id, campaign: "HTML template test", start: today, end: tomorrow, adSlots: "1",
    } });
    expect(bookingResponse.status()).toBe(201);
    const { booking } = await bookingResponse.json() as { booking: { id: string } };
    const editorPage = await advertiser.newPage();
    await editorPage.goto(`${origin}/?view=creative&bookingId=${booking.id}`);
    // The ready-made design opens on plain fields; the HTML editor is the advanced option.
    const headline = editorPage.getByRole("textbox", { name: "Headline" });
    await expect(headline).toBeVisible();
    await expect(editorPage.getByRole("textbox", { name: "Template HTML" })).toBeHidden();
    await expect(editorPage.getByRole("link", { name: "Retail design: The weekend edit" })).toHaveAttribute("aria-current", "true");
    await expect(editorPage.getByRole("link", { name: "Finance design: The next chapter" })).toBeVisible();
    await expect(editorPage.getByRole("link", { name: "Event design: After dark" })).toBeVisible();
    const examplesResponse = await advertiser.request.get(`${origin}/api/creative/template-preview`);
    expect(examplesResponse.status()).toBe(200);
    const { examples } = await examplesResponse.json() as { examples: Record<string, string> };
    for (const topic of ["retail", "finance", "event"]) {
      expect(examples[topic]).toContain(`class="${topic}"`);
      const examplePage = await advertiser.newPage();
      await examplePage.setViewportSize({ width: 1280, height: 720 });
      await examplePage.setContent(examples[topic]);
      await examplePage.screenshot({ path: `docs/verification/template-${topic}.png` });
      await examplePage.close();
    }
    for (const topic of ["Retail", "Finance", "Event"]) {
      await expect(editorPage.frameLocator(`iframe[title="${topic} design example"]`).locator("h1")).toBeVisible();
    }
    await editorPage.setViewportSize({ width: 390, height: 844 });
    await editorPage.screenshot({ path: "docs/verification/html-template-gallery-phone.png" });
    await headline.fill("Fresh this\nweek.");
    await expect(editorPage.frameLocator('iframe[title="Template preview"]').locator("h1 em")).toHaveText("WEEK.");
    await editorPage.screenshot({ path: "docs/verification/quick-ad-fields-phone.png", fullPage: true });
    await editorPage.getByText("Edit the HTML instead (advanced)").click();
    const editor = editorPage.getByRole("textbox", { name: "Template HTML" });
    await expect(editor).toHaveValue(/FRESH THIS<br>/);
    await editor.fill("<h1>Browser preview</h1>");
    await expect(editorPage.getByText("You changed the HTML by hand, so these fields no longer control the ad.")).toBeVisible();
    await expect(editorPage.frameLocator('iframe[title="Template preview"]').locator("h1")).toHaveText("Browser preview");
    await expect(editor).toBeInViewport();
    const previewBox = await editorPage.locator(".creative-html-preview").boundingBox();
    const frameBox = await editorPage.locator(".creative-html-preview iframe").boundingBox();
    expect(frameBox?.width).toBeGreaterThan((previewBox?.width ?? 0) - 3);
    await editorPage.screenshot({ path: "docs/verification/html-template-editor-phone.png", fullPage: true });
    // The fields now sit between the preview and the HTML editor, so bring the preview back into view first.
    await editorPage.locator(".creative-html-preview").scrollIntoViewIfNeeded();
    await editorPage.frameLocator('iframe[title="Template preview"]').locator("body").screenshot({ path: "docs/verification/html-template-preview.png" });
    const source = `<section class="content" onclick="alert(1)"><h1 style="color:red">Safe offer</h1><script>alert(1)</script><a href="javascript:alert(1)">Visit us</a><img src="https://bad.example/pixel"></section>`;
    const submitted = await advertiser.request.post(`${origin}/api/bookings/${booking.id}/creative`, { headers: { Origin: origin }, data: {
      template: "retail", format: "digital", width: 1920, height: 1080, safeZone: 10, distortion: 0, html: source,
    } });
    expect(submitted.status()).toBe(201);
    const { creative } = await submitted.json() as { creative: { id: string; publicUrl: string; mimeType: string; fileType: string } };
    expect(creative.mimeType).toBe("text/html");
    expect(creative.fileType).toBe("html");

    expect((await other.request.get(`${origin}${creative.publicUrl}`)).status()).toBe(404);
    expect((await anonymous.request.get(`${origin}${creative.publicUrl}`)).status()).toBe(404);
    const privatePreview = await advertiser.request.get(`${origin}${creative.publicUrl}`);
    expect(privatePreview.status()).toBe(200);
    expect(privatePreview.headers()["content-security-policy"]).toContain("sandbox");
    const rendered = await privatePreview.text();
    expect(rendered).toContain("Safe offer");
    expect(rendered).not.toMatch(/<script|onclick=|style="color:red"|javascript:|bad\.example|<img/i);

    const approval = await institution.request.patch(`${origin}/api/bookings/${booking.id}`, { headers: { Origin: origin }, data: { status: "approved" } });
    expect(approval.status()).toBe(200);
    expect((await anonymous.request.get(`${origin}${creative.publicUrl}`)).status()).toBe(200);
    expect((await anonymous.request.get(`${origin}/media/${creative.id}`)).status()).toBe(404);
    const playerPage = await display.newPage();
    await playerPage.goto(`${origin}/player`);
    const pairing = await createPairingCode(fixture.institution, fixture.screen.id);
    await playerPage.getByLabel("Pairing code", { exact: true }).fill(pairing.code);
    await playerPage.getByRole("button", { name: "Pair this screen", exact: true }).click();
    await expect(playerPage.locator(".device-player")).toBeVisible({ timeout: 30_000 });
    const cachedFrame = playerPage.frameLocator(`[data-player-slide="${creative.id}"] iframe`);
    await expect(cachedFrame.locator("h1")).toHaveText("Safe offer", { timeout: 30_000 });
    await expect.poll(() => playerPage.evaluate(async () => Boolean(await (await caches.open("easyad-player-shell-v1")).match("/player")))).toBe(true);
    await display.setOffline(true);
    await playerPage.close();
    const offlinePage = await display.newPage();
    await offlinePage.goto(`${origin}/player`, { waitUntil: "domcontentloaded" });
    const offlineFrame = offlinePage.frameLocator(`[data-player-slide="${creative.id}"] iframe`);
    await expect(offlineFrame.locator("h1")).toHaveText("Safe offer", { timeout: 15_000 });
    expect(await offlineFrame.locator("body").evaluate((body) => getComputedStyle(body).backgroundColor)).toBe("rgb(248, 207, 121)");
    await offlinePage.screenshot({ path: "docs/verification/html-template-offline-player.png" });
    await display.setOffline(false);
    await offlinePage.close();
    const legacyId = `CRV-LEGACY-${Date.now()}`;
    await getDb().query(`INSERT INTO creatives
      (id,booking_id,source,template,format,width,height,file_type,file_size,safe_zone,distortion,original_name,mime_type,public_url,storage_path,status,created_at)
      VALUES ($1,$2,'template','finance','digital',1920,1080,'png',80,10,0,NULL,NULL,NULL,NULL,'approved',NOW()::text)`, [legacyId, booking.id]);
    const legacy = await anonymous.request.get(`${origin}/creative-html/${legacyId}`);
    expect(legacy.status()).toBe(200);
    expect(await legacy.text()).toContain("Make room<br>for what’s");
    const active = await anonymous.request.get(`${origin}/api/public/devices/${fixture.screen.id}/media`);
    expect(active.status()).toBe(200);
    const listed = JSON.stringify(await active.json());
    expect(listed).toContain(creative.id);
    expect(listed).toContain(legacyId);
    expect(listed).toContain('"mediaType":"html"');
    const screen = await anonymous.newPage();
    await screen.goto(`${origin}/inventory/${fixture.screen.id}`);
    await expect(screen.frameLocator(`iframe[src="${creative.publicUrl}"]`).first().locator("h1")).toHaveText("Safe offer");
  } finally {
    await Promise.all([advertiser.close(), institution.close(), other.close(), anonymous.close(), display.close()]);
  }
});
