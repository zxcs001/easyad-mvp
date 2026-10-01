import type { Creative } from "./data";

export type CreativeTemplateTopic = Creative["template"];

export const creativeTemplateTopics: CreativeTemplateTopic[] = ["retail", "finance", "event"];
export const creativeHtmlResponseCsp = "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

export const creativeTemplateExamples: Record<CreativeTemplateTopic, { name: string; description: string }> = {
  retail: { name: "The weekend edit", description: "A bold local shop promotion" },
  finance: { name: "The next chapter", description: "A reassuring service message" },
  event: { name: "After dark", description: "A vivid live-event announcement" },
};

export const defaultCreativeHtml: Record<CreativeTemplateTopic, string> = {
  retail: `<section class="retail-copy">
  <p class="retail-overline">PINE &amp; PORT · LOCAL GOODS</p>
  <h1>GOOD<br>THINGS,<br><em>LOCALLY.</em></h1>
  <p class="retail-detail">Fresh finds for slower weekends.</p>
  <p class="retail-action">EXPLORE THE WEEKEND EDIT <span>↗</span></p>
</section>
<div class="retail-scene"><div class="retail-sun"></div><div class="retail-bag"><div class="retail-bag-label">P&amp;P</div></div><div class="retail-card">MADE TO<br>BE FOUND</div></div>
<p class="retail-foot">OPEN THIS WEEKEND <span>DOWNTOWN THUNDER BAY</span></p>`,
  finance: `<section class="finance-copy">
  <p class="finance-brand"><span class="finance-mark">C</span> CEDAR FINANCIAL</p>
  <p class="finance-overline">A CLEARER WAY FORWARD</p>
  <h1>Make room<br>for what’s <em>next.</em></h1>
  <p class="finance-detail">Everyday banking with space to plan ahead.</p>
  <p class="finance-action">START A CONVERSATION <span>→</span></p>
</section>
<div class="finance-art"><div class="finance-ring ring-one"></div><div class="finance-ring ring-two"></div><div class="finance-ring ring-three"></div><span class="finance-dot"></span></div>
<p class="finance-foot">THOUGHTFUL BANKING, CLOSE TO HOME.</p>`,
  event: `<section class="event-copy">
  <p class="event-overline">HARBOUR LIGHTS PRESENTS</p>
  <h1>AFTER<br><em>DARK.</em></h1>
  <p class="event-detail">Music. Food. Good company.</p>
  <p class="event-action">FRIDAY · 7 PM <span>THE WATERFRONT</span></p>
</section>
<div class="event-art"><div class="event-orb"></div><div class="event-streak streak-one"></div><div class="event-streak streak-two"></div><div class="event-streak streak-three"></div></div>
<p class="event-foot">ONE CITY. ONE GOOD NIGHT. <span>COME THROUGH ↗</span></p>`,
};

export function isCreativeTemplateTopic(value: unknown): value is CreativeTemplateTopic {
  return typeof value === "string" && creativeTemplateTopics.some((topic) => topic === value);
}
