// Fill-in-the-blanks ads. Each ready-made design has a few plain fields
// (business name, headline, one more line, call to action ...). The fields
// build the same HTML the design ships with, so a small-business owner never
// has to edit tags. The HTML editor stays available as an advanced option.
import { defaultCreativeHtml, type CreativeTemplateTopic } from "./creative-templates";

export type QuickAdFieldId = "brand" | "tagline" | "presenter" | "headline" | "detail" | "action" | "when" | "where" | "sticker" | "closing";
export type QuickAdFields = Partial<Record<QuickAdFieldId, string>>;

export type QuickAdField = {
  id: QuickAdFieldId;
  label: string;
  hint?: string;
  maxLength: number;
  multiline?: boolean;
};

const headlineField: QuickAdField = { id: "headline", label: "Headline", hint: "Press Enter for a new line. The last word is highlighted.", maxLength: 48, multiline: true };
const detailField: QuickAdField = { id: "detail", label: "One more line", maxLength: 60 };

export const quickAdFieldsByTopic: Record<CreativeTemplateTopic, QuickAdField[]> = {
  retail: [
    { id: "brand", label: "Business name", maxLength: 28 },
    { id: "tagline", label: "Short tagline", maxLength: 24 },
    headlineField,
    detailField,
    { id: "action", label: "Call to action", maxLength: 32 },
    { id: "when", label: "When", maxLength: 24 },
    { id: "where", label: "Where", maxLength: 28 },
    { id: "sticker", label: "Sticker text", hint: "Optional. Leave it empty to remove the sticker.", maxLength: 24, multiline: true },
  ],
  finance: [
    { id: "brand", label: "Business name", maxLength: 28 },
    { id: "tagline", label: "Line above the headline", maxLength: 32 },
    headlineField,
    detailField,
    { id: "action", label: "Call to action", maxLength: 32 },
    { id: "closing", label: "Closing line", maxLength: 44 },
  ],
  event: [
    { id: "presenter", label: "Line above the headline", hint: "For example, who presents the event.", maxLength: 32 },
    headlineField,
    detailField,
    { id: "when", label: "When", maxLength: 24 },
    { id: "where", label: "Where", maxLength: 28 },
    { id: "closing", label: "Closing line", maxLength: 36 },
    { id: "action", label: "Call to action", maxLength: 24 },
  ],
};

export const defaultQuickAdFields: Record<CreativeTemplateTopic, QuickAdFields> = {
  retail: { brand: "Pine & Port", tagline: "Local goods", headline: "Good\nthings,\nlocally.", detail: "Fresh finds for slower weekends.", action: "Explore the weekend edit", when: "Open this weekend", where: "Downtown Thunder Bay", sticker: "Made to\nbe found" },
  finance: { brand: "Cedar Financial", tagline: "A clearer way forward", headline: "Make room\nfor what’s next.", detail: "Everyday banking with space to plan ahead.", action: "Start a conversation", closing: "Thoughtful banking, close to home." },
  event: { presenter: "Harbour Lights presents", headline: "After\ndark.", detail: "Music. Food. Good company.", when: "Friday · 7 PM", where: "The waterfront", closing: "One city. One good night.", action: "Come through" },
};

/** Ready-to-use headlines, so nobody starts from an empty box. */
export const headlineIdeas: Record<CreativeTemplateTopic, string[]> = {
  retail: ["Fresh this\nweek.", "Made here.\nSold here.", "Your weekend\nstarts here."],
  finance: ["Plan your\nnext step.", "Money advice\nnear you.", "Start saving\ntoday."],
  event: ["One night\nonly.", "Live this\nFriday.", "Doors open\nat 7."],
};

export function quickAdFields(topic: CreativeTemplateTopic, fields?: QuickAdFields): Required<QuickAdFields> {
  const merged = { ...defaultQuickAdFields[topic], ...fields };
  return Object.fromEntries((["brand", "tagline", "presenter", "headline", "detail", "action", "when", "where", "sticker", "closing"] as QuickAdFieldId[]).map((id) => [id, merged[id] ?? ""])) as Required<QuickAdFields>;
}

/** Builds the design's HTML from the fields. Every value is escaped text. */
export function composeQuickAdHtml(topic: CreativeTemplateTopic, input?: QuickAdFields) {
  const f = quickAdFields(topic, input);
  if (topic === "retail") {
    const overline = [f.brand, f.tagline].map(clean).filter(Boolean).map(upper).join(" · ");
    const sticker = lines(f.sticker).map(upper);
    return `<section class="retail-copy">
  <p class="retail-overline">${overline}</p>
  <h1>${headline(f.headline, true)}</h1>
  <p class="retail-detail">${text(f.detail)}</p>
  <p class="retail-action">${upper(f.action)} <span>↗</span></p>
</section>
<div class="retail-scene"><div class="retail-sun"></div><div class="retail-bag"><div class="retail-bag-label">${initials(f.brand)}</div></div>${sticker.length ? `<div class="retail-card">${sticker.join("<br>")}</div>` : ""}</div>
<p class="retail-foot">${upper(f.when)} <span>${upper(f.where)}</span></p>`;
  }
  if (topic === "finance") {
    return `<section class="finance-copy">
  <p class="finance-brand"><span class="finance-mark">${initials(f.brand).slice(0, 1)}</span> ${upper(f.brand)}</p>
  <p class="finance-overline">${upper(f.tagline)}</p>
  <h1>${headline(f.headline, false)}</h1>
  <p class="finance-detail">${text(f.detail)}</p>
  <p class="finance-action">${upper(f.action)} <span>→</span></p>
</section>
<div class="finance-art"><div class="finance-ring ring-one"></div><div class="finance-ring ring-two"></div><div class="finance-ring ring-three"></div><span class="finance-dot"></span></div>
<p class="finance-foot">${upper(f.closing)}</p>`;
  }
  return `<section class="event-copy">
  <p class="event-overline">${upper(f.presenter)}</p>
  <h1>${headline(f.headline, true)}</h1>
  <p class="event-detail">${text(f.detail)}</p>
  <p class="event-action">${upper(f.when)} <span>${upper(f.where)}</span></p>
</section>
<div class="event-art"><div class="event-orb"></div><div class="event-streak streak-one"></div><div class="event-streak streak-two"></div><div class="event-streak streak-three"></div></div>
<p class="event-foot">${upper(f.closing)} <span>${upper(f.action)} ↗</span></p>`;
}

/** The HTML a design submits: hand-edited HTML when there is some, otherwise the fields. */
export function effectiveTemplateHtml(draft: { template: CreativeTemplateTopic; htmlByTopic?: Partial<Record<CreativeTemplateTopic, string>>; fieldsByTopic?: Partial<Record<CreativeTemplateTopic, QuickAdFields>> }) {
  return draft.htmlByTopic?.[draft.template] ?? (draft.fieldsByTopic?.[draft.template] ? composeQuickAdHtml(draft.template, draft.fieldsByTopic[draft.template]) : defaultCreativeHtml[draft.template]);
}

// --- Glance test ---------------------------------------------------------------

export type GlanceCheck = { id: string; label: string; ok: boolean; message: string };

/** Words a passer-by has to read: the headline, the extra line and the call to action. */
export function glanceWordCount(topic: CreativeTemplateTopic, input?: QuickAdFields) {
  const f = quickAdFields(topic, input);
  return words(f.headline) + words(f.detail) + words(f.action);
}

/**
 * A screen beside a road or a walkway is read in a few seconds. These checks
 * are advice, not rules: they never block a submission.
 */
export function glanceChecks(topic: CreativeTemplateTopic, input?: QuickAdFields): GlanceCheck[] {
  const f = quickAdFields(topic, input);
  const headlineWords = words(f.headline);
  const longestLine = Math.max(0, ...lines(f.headline).map((line) => line.length));
  const total = glanceWordCount(topic, input);
  return [
    { id: "headline-words", label: "Short headline", ok: headlineWords > 0 && headlineWords <= 6, message: headlineWords ? `${headlineWords} words. Six or fewer reads at a glance.` : "Add a headline." },
    { id: "headline-lines", label: "Lines fit the screen", ok: longestLine > 0 && longestLine <= 16, message: longestLine > 16 ? "A headline line is long. Break it with Enter so each line has 16 characters or fewer." : "Every headline line has 16 characters or fewer." },
    { id: "total-words", label: "Few words in total", ok: total <= 15, message: `${total} words to read. Fifteen or fewer works for a passing audience.` },
    { id: "action", label: "Clear next step", ok: words(f.action) > 0, message: words(f.action) ? "The ad tells people what to do next." : "Add a call to action, for example \"Visit this weekend\"." },
  ];
}

function words(value: string) {
  return clean(value).split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function lines(value: string) {
  return value.split(/\r?\n/).map(clean).filter(Boolean);
}

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function text(value: string) {
  return escapeHtml(clean(value));
}

function upper(value: string) {
  return escapeHtml(clean(value).toLocaleUpperCase("en-CA"));
}

function initials(brand: string) {
  const letters = clean(brand).split(" ").map((word) => word.match(/[\p{L}\p{N}&]/u)?.[0] ?? "").join("").toLocaleUpperCase("en-CA");
  return escapeHtml(letters.slice(0, 3) || "★");
}

// Lines join with <br>. The last word is wrapped in <em>, which each design
// shows in its accent colour.
function headline(value: string, uppercase: boolean) {
  const rows = lines(value).map((line) => uppercase ? line.toLocaleUpperCase("en-CA") : line);
  if (!rows.length) return "";
  const last = rows[rows.length - 1];
  const split = last.lastIndexOf(" ");
  const lead = split < 0 ? "" : last.slice(0, split + 1);
  const word = split < 0 ? last : last.slice(split + 1);
  return [...rows.slice(0, -1).map(escapeHtml), `${escapeHtml(lead)}<em>${escapeHtml(word)}</em>`].join("<br>");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
