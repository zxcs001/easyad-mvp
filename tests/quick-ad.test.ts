import { expect, test } from "vitest";
import { creativeTemplateTopics, defaultCreativeHtml } from "../app/creative-templates";
import { sanitizeCreativeHtml } from "../app/lib/creative-template";
import { composeQuickAdHtml, effectiveTemplateHtml, glanceChecks, glanceWordCount } from "../app/quick-ad";

test("the default fields build exactly the HTML each design ships with", () => {
  for (const topic of creativeTemplateTopics) expect(composeQuickAdHtml(topic)).toBe(defaultCreativeHtml[topic]);
});

test("fields become escaped text in the design's own structure, and survive the sanitizer unchanged", () => {
  const html = composeQuickAdHtml("retail", { brand: "Bea's <Bakery>", tagline: "", headline: "Fresh\nbread daily", detail: "<script>alert(1)</script>", action: "Visit today", when: "Mon–Sat", where: "Red River Rd", sticker: "" });
  expect(html).toContain('<p class="retail-overline">BEA&#39;S &lt;BAKERY&gt;</p>');
  expect(html).toContain("<h1>FRESH<br>BREAD <em>DAILY</em></h1>");
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("retail-card");
  expect(html).toContain('<div class="retail-bag-label">BB</div>');
  expect(sanitizeCreativeHtml(html)).toBe(html);
});

test("hand-edited HTML wins over the fields; without either the design's example is used", () => {
  expect(effectiveTemplateHtml({ template: "event" })).toBe(defaultCreativeHtml.event);
  expect(effectiveTemplateHtml({ template: "event", fieldsByTopic: { event: { headline: "Doors at\n7." } } })).toContain("DOORS AT<br><em>7.</em>");
  expect(effectiveTemplateHtml({ template: "event", fieldsByTopic: { event: { headline: "Ignored" } }, htmlByTopic: { event: "<h1>Mine</h1>" } })).toBe("<h1>Mine</h1>");
});

test("the glance test counts what a passer-by reads and gives advice", () => {
  expect(glanceWordCount("retail")).toBe(12);
  expect(glanceChecks("retail").every((check) => check.ok)).toBe(true);
  const crowded = glanceChecks("finance", { headline: "The very best savings account rates in the whole region", action: "", detail: "Come in and talk to one of our friendly advisors about your plans" });
  expect(Object.fromEntries(crowded.map((check) => [check.id, check.ok]))).toEqual({ "headline-words": false, "headline-lines": false, "total-words": false, action: false });
});
