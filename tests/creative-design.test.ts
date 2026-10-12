import { expect, test } from "vitest";
import sharp from "sharp";
import { creativeDesign, colourContrast } from "../app/creative-design";
import { validateDesignLogo } from "../app/lib/creative-design-assets";
import { renderCreativeDocument, sanitizeCreativeHtml } from "../app/lib/creative-template";
import { defaultCreativeHtml } from "../app/creative-templates";
import { decodeCreativeDraft, encodeCreativeDraft } from "../app/creative-draft";
import type { CreativeDraft } from "../app/types";

const base: CreativeDraft = { template: "retail", format: "digital", width: 1920, height: 1080, fileType: "html", fileSize: 1, safeZone: 10, distortion: 0 };
test.each([
  { background: "red;position:fixed" }, { font: "url(https://bad.example)" }, { layout: "unknown" },
  { headlineScale: 200 }, { headlineScale: 80.1 }, { decorations: "false" },
  { logoDataUrl: "https://bad.example/logo.png" }, { logoDataUrl: "data:image/svg+xml;base64,PHN2Zz4=" },
  [], null,
])("rejects arbitrary CSS, invalid settings, and external image sources: %j", value => {
  expect(() => creativeDesign("retail", value)).toThrow();
});
test("normalizes the allowlisted settings and ignores unknown properties", () => {
  const design = creativeDesign("finance", { foreground: "#abcdef", font: "serif", arbitraryCss: "evil" });
  expect(design.foreground).toBe("#ABCDEF");
  expect(design.font).toBe("serif");
  expect(design).not.toHaveProperty("arbitraryCss");
  expect(colourContrast("#000000", "#FFFFFF")).toBeCloseTo(21);
  expect(colourContrast("#FFFFFF", "#FFFFFF")).toBe(1);
});
test("logos must fully decode as a bounded PNG or JPEG", async () => {
  const png = await sharp({ create: { width: 32, height: 20, channels: 4, background: "#1456A0" } }).png().toBuffer();
  const logoDataUrl = `data:image/png;base64,${png.toString("base64")}`;
  await expect(validateDesignLogo(logoDataUrl)).resolves.toBeUndefined();
  await expect(validateDesignLogo(`data:image/jpeg;base64,${png.toString("base64")}`)).rejects.toThrow("valid PNG or JPEG");
  await expect(validateDesignLogo("data:image/png;base64,bm90IGFuIGltYWdl")).rejects.toThrow();
  const huge = await sharp({ create: { width: 1025, height: 1, channels: 3, background: "white" } }).png().toBuffer();
  await expect(validateDesignLogo(`data:image/png;base64,${huge.toString("base64")}`)).rejects.toThrow();
  const document = renderCreativeDocument("retail", sanitizeCreativeHtml(defaultCreativeHtml.retail), { design: { palette: "custom", background: "#EAF4FF", font: "serif", layout: "centered", logoDataUrl } });
  expect(document).toContain("ad-layout-centered ad-font-serif ad-custom-colours");
  expect(document).toContain(`src="${logoDataUrl}"`);
  expect(document).toContain("img-src data:");
  expect(document).not.toContain("https://");
});
test("stored drafts preserve content but cannot change the booked output specification", () => {
  const raw = encodeCreativeDraft({ ...base, width: 1, fieldsByTopic: { retail: { headline: "Hello" } }, designsByTopic: { retail: creativeDesign("retail", { font: "serif" }) }, responseUrl: "business.ca" });
  const restored = decodeCreativeDraft(raw, { ...base, format: "transit", width: 3000, height: 1000 });
  expect(restored).toMatchObject({ format: "transit", width: 3000, height: 1000, fieldsByTopic: { retail: { headline: "Hello" } }, designsByTopic: { retail: { font: "serif" } }, responseUrl: "business.ca" });
  expect(decodeCreativeDraft("broken", base)).toBeNull();
  expect(decodeCreativeDraft(JSON.stringify({ version: 1, draft: { template: "retail", fieldsByTopic: { retail: { headline: "x".repeat(200) } } } }), base)).toBeNull();
  expect(decodeCreativeDraft(JSON.stringify({ version: 1, draft: { template: "retail", designsByTopic: { retail: { font: "evil" } } } }), base)).toBeNull();
});
