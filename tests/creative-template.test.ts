import { describe, expect, test } from "vitest";
import { creativeTemplateExamples, creativeTemplateTopics, defaultCreativeHtml } from "../app/creative-templates";
import { renderCreativeDocument, sanitizeCreativeHtml } from "../app/lib/creative-template";

describe("HTML creative templates", () => {
  test("provides three editable, visible starter topics", () => {
    expect(creativeTemplateTopics).toEqual(["retail", "finance", "event"]);
    for (const topic of creativeTemplateTopics) {
      expect(sanitizeCreativeHtml(defaultCreativeHtml[topic])).toContain("<h1>");
      expect(renderCreativeDocument(topic, sanitizeCreativeHtml(defaultCreativeHtml[topic]))).toContain(`class="${topic}"`);
      expect(creativeTemplateExamples[topic].name).toBeTruthy();
      expect(creativeTemplateExamples[topic].description).toBeTruthy();
      expect(defaultCreativeHtml[topic]).toMatch(/class=".+-art|class=".+-scene/);
    }
    expect(defaultCreativeHtml.retail).toContain("DOWNTOWN THUNDER BAY");
    expect(defaultCreativeHtml.finance).toContain("CEDAR FINANCIAL");
    expect(defaultCreativeHtml.event).toContain("FRIDAY · 7 PM");
  });

  test("strips executable, URL-bearing and styled markup before rendering", () => {
    const sanitized = sanitizeCreativeHtml(`<section class="content" onclick="alert(1)">
      <h1 style="background:url(https://bad.example/x)">Hello &amp; welcome</h1>
      <script>alert(1)</script><svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>
      <iframe src="https://bad.example"></iframe><a href="javascript:alert(1)">Visit us</a>
      <img src="https://bad.example/tracker"><p class="detail bad;position:absolute">Today</p>
    </section>`);
    expect(sanitized).toContain("Hello &amp; welcome");
    expect(sanitized).toContain("Visit us");
    expect(sanitized).toContain('<section class="content">');
    expect(sanitized).not.toMatch(/script|svg|iframe|<a|<img|onclick|onerror|javascript:|bad\.example|style=|position:/i);
    const document = renderCreativeDocument("retail", sanitized);
    expect(document).toContain("default-src 'none'");
    expect(document).toContain(sanitized);
  });

  test("rejects empty, non-text and oversized submissions", () => {
    expect(() => sanitizeCreativeHtml("<script>alert(1)</script>")).toThrow("visible text");
    expect(() => sanitizeCreativeHtml(123)).toThrow("Enter template HTML");
    expect(() => sanitizeCreativeHtml("a".repeat(16_385))).toThrow("16 KB");
  });
});

test("a server-made QR code joins the ad; anything that is not a plain SVG is dropped", async () => {
  const { responseQrSvg } = await import("../app/lib/responses");
  const svg = await responseQrSvg("https://easyad.example/go/ABCDEFGH");
  const html = sanitizeCreativeHtml(defaultCreativeHtml.retail);
  expect(renderCreativeDocument("retail", html, { qrSvg: svg })).toContain('<aside class="ad-qr" aria-label="QR code"><svg');
  expect(renderCreativeDocument("retail", html, { qrSvg: '<svg onload="alert(1)"></svg>' })).not.toContain("ad-qr\"");
  expect(renderCreativeDocument("retail", html, { qrSvg: "<script>alert(1)</script>" })).not.toContain("<script>");
});
