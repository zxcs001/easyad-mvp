import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { createPlayerFixtures, pilotPassword } from "../tests/helpers/player-fixtures";
import { closeDb, getDb } from "../app/lib/db";
import { defaultCreativeHtml, creativeTemplateTopics } from "../app/creative-templates";
import { creativeDesign } from "../app/creative-design";

const origin = "http://localhost:3100";
test.use({ actionTimeout: 10_000 });
test.afterAll(async () => closeDb());
test("branded drafts survive reload, reuse a brand, and submit the previewed design", async ({ browser }, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await createPlayerFixtures(`EDITOR-${Date.now()}`);
  const advertiser = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const anonymous = await browser.newContext();
  try {
    expect((await advertiser.request.post(`${origin}/api/auth/login`, { headers: { Origin: origin }, form: { email: fixture.advertiser.email, password: pilotPassword }, maxRedirects: 0 })).status()).toBe(303);
    const [{ today, tomorrow }] = (await getDb().query<{ today: string; tomorrow: string }>("SELECT CURRENT_DATE::text AS today, (CURRENT_DATE + 1)::text AS tomorrow")).rows;
    async function book(campaign: string) {
      const response = await advertiser.request.post(`${origin}/api/bookings`, { headers: { Origin: origin }, multipart: { inventoryId: fixture.screen.id, campaign, start: today, end: tomorrow, adSlots: "1" } });
      expect(response.status()).toBe(201);
      return (await response.json()).booking.id as string;
    }
    const first = await book("Branded creative"), second = await book("Next creative");
    const page = await advertiser.newPage();
    await page.goto(`${origin}/?role=advertiser&view=creative&bookingId=${first}`);
    const frame = page.frameLocator('iframe[title="Template preview"]');
    const headline = page.getByRole("textbox", { name: "Headline", exact: true });
    await headline.fill("Fresh this\nweek.");
    await page.getByRole("button", { name: "Ocean", exact: true }).click();
    await page.getByLabel("Typography", { exact: true }).selectOption("serif");
    await page.getByLabel("Layout", { exact: true }).selectOption("centered");
    const logoBytes = await sharp({ create: { width: 600, height: 180, channels: 3, background: "#1456A0" } }).png().toBuffer();
    await page.getByLabel("Brand logo (optional)", { exact: false }).setInputFiles({ name: "brand.png", mimeType: "image/png", buffer: logoBytes });
    await expect(frame.locator(".ad-logo img")).toBeVisible();
    await expect(frame.locator("body")).toHaveClass(/ad-layout-centered ad-font-serif ad-custom-colours/);
    await expect.poll(() => frame.locator(".artwork").evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(234, 244, 255)");
    await expect.poll(() => frame.locator(".artwork").evaluate(el => el.getBoundingClientRect().width)).toBe(1920);
    await page.getByRole("button", { name: "Save brand", exact: true }).click();
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(frame.locator(".ad-logo")).toHaveCount(0);
    await page.getByRole("button", { name: "Redo", exact: true }).click();
    await expect(frame.locator(".ad-logo img")).toBeVisible();
    await expect(page.getByText("Draft saved in this browser.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(headline).toHaveValue("Fresh this\nweek.");
    await expect(frame.locator(".ad-logo img")).toBeVisible();
    await expect(page.frameLocator('iframe[title="Retail design example"]').locator("h1")).toBeVisible();
    await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("centered");
    await page.screenshot({ path: testInfo.outputPath("creative-editor-desktop.png"), fullPage: true });
    await page.getByRole("button", { name: "Enlarge preview" }).click();
    await expect(page.getByRole("dialog", { name: "Enlarged ad preview" })).toBeVisible();
    await expect(page.frameLocator('iframe[title="Enlarged template preview"]').locator(".ad-logo img")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("creative-enlarged-preview.png") });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".creative-preview-panel > .creative-native-preview").scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.locator(".creative-preview-panel > .creative-native-preview").boundingBox();
    const frameBox = await page.locator('iframe[title="Template preview"]').boundingBox();
    expect(frameBox!.width).toBeCloseTo(box!.width, 0);
    expect(frameBox!.height).toBeCloseTo(box!.width * 1080 / 1920, 0);
    expect(await frame.locator(".artwork").evaluate(el => el.getBoundingClientRect().width)).toBe(1920);
    await page.getByLabel("Show safe zone").check();
    await expect(page.locator(".creative-preview-panel > .creative-native-preview .creative-preview-guide")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("creative-editor-phone.png"), fullPage: true });
    await page.getByRole("combobox", { name: "Campaign", exact: true }).selectOption(second);
    await expect(headline).toHaveValue("Good\nthings,\nlocally.");
    await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("split");
    await expect(frame.locator(".ad-logo")).toHaveCount(0);
    await page.getByRole("button", { name: "Use saved brand" }).click();
    await expect(frame.locator(".ad-logo img")).toBeVisible();
    await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("split");
    await page.getByRole("combobox", { name: "Campaign", exact: true }).selectOption(first);
    await expect(headline).toHaveValue("Fresh this\nweek.");
    await expect(page.getByLabel("Layout", { exact: true })).toHaveValue("centered");
    const normalizedLogo = await frame.locator(".ad-logo img").getAttribute("src");
    const submission = page.waitForResponse(response => response.url().endsWith(`/api/bookings/${first}/creative`) && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit template for review" }).click();
    const response = await submission;
    expect(response.status()).toBe(201);
    const { creative } = await response.json();
    expect(creative.status).toBe("pending review");
    expect((await anonymous.request.get(`${origin}${creative.publicUrl}`)).status()).toBe(404);
    const rendered = await advertiser.request.get(`${origin}${creative.publicUrl}`);
    expect(rendered.status()).toBe(200);
    const storedDocument = await rendered.text();
    expect(storedDocument).toContain("FRESH THIS<br><em>WEEK.</em>");
    expect(storedDocument).toContain("ad-layout-centered ad-font-serif ad-custom-colours");
    expect(storedDocument).toContain(`src="${normalizedLogo}"`);
    expect(storedDocument).toContain("--ad-bg:#EAF4FF");

    // Exercise all layouts and fonts at both supported template aspect ratios.
    const artwork = await advertiser.newPage();
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 3000, height: 1000 }]) {
    await artwork.setViewportSize(viewport);
    for (const topic of creativeTemplateTopics) for (const layout of ["split", "centered", "type"] as const) for (const font of ["template", "sans", "serif", "condensed"] as const) {
      const preview = await advertiser.request.post(`${origin}/api/creative/template-preview`, { headers: { Origin: origin }, data: { template: topic, html: defaultCreativeHtml[topic], responseUrl: "https://business.example/offer", design: creativeDesign(topic, { palette: "custom", layout, font, headlineScale: 110, logoDataUrl: normalizedLogo }) } });
      expect(preview.status()).toBe(200);
      await artwork.setContent((await preview.json()).document);
      const geometry = await artwork.evaluate(() => {
        const copy = document.querySelector<HTMLElement>('[class$="-copy"]')!.getBoundingClientRect();
        const foot = document.querySelector<HTMLElement>('[class$="-foot"]')!.getBoundingClientRect();
        const logo = document.querySelector<HTMLElement>(".ad-logo")!.getBoundingClientRect();
        return { copyBottom: copy.bottom, footTop: foot.top, logoRight: logo.right, logoBottom: logo.bottom, width: window.innerWidth, height: window.innerHeight };
      });
      expect(geometry.copyBottom, `${viewport.width}×${viewport.height}/${topic}/${layout}/${font}: text must clear the footer`).toBeLessThanOrEqual(geometry.footTop);
      expect(geometry.logoRight).toBeLessThanOrEqual(geometry.width * .92 + 1);
      expect(geometry.logoBottom).toBeLessThan(geometry.height * .5);
      if (font === "template") await artwork.screenshot({ path: testInfo.outputPath(`creative-${viewport.width}-${topic}-${layout}.png`) });
    }
    }
  } finally { await advertiser.close(); await anonymous.close(); }
});
