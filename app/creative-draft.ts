import { creativeTemplateTopics, isCreativeTemplateTopic } from "./creative-templates";
import { creativeDesign } from "./creative-design";
import { quickAdFieldsByTopic } from "./quick-ad";
import type { CreativeDraft } from "./types";

export function draftContent(draft: CreativeDraft) {
  return { template: draft.template, fieldsByTopic: draft.fieldsByTopic, htmlByTopic: draft.htmlByTopic, designsByTopic: draft.designsByTopic, responseUrl: draft.responseUrl };
}
export function encodeCreativeDraft(draft: CreativeDraft) { return JSON.stringify({ version: 1, draft: draftContent(draft) }); }
export function freshCreativeDraft(base: CreativeDraft): CreativeDraft {
  const { fieldsByTopic: _fields, htmlByTopic: _html, designsByTopic: _designs, responseUrl: _response, ...spec } = base;
  return { ...spec, template: "retail" };
}

/** Browser drafts contain editable content, never authority over output specs. */
export function decodeCreativeDraft(raw: string | null, base: CreativeDraft): CreativeDraft | null {
  if (!raw || raw.length > 750000) return null;
  try {
    const parsed = JSON.parse(raw);
    const value = parsed?.draft;
    if (parsed?.version !== 1 || !value || !isCreativeTemplateTopic(value.template)) return null;
    const next: CreativeDraft = { ...freshCreativeDraft(base), template: value.template };
    for (const topic of creativeTemplateTopics) {
      const fields = value.fieldsByTopic?.[topic];
      if (fields !== undefined) {
        if (!fields || typeof fields !== "object" || Array.isArray(fields)) return null;
        const safeFields: NonNullable<CreativeDraft["fieldsByTopic"]>[typeof topic] = {};
        for (const field of quickAdFieldsByTopic[topic]) {
          if (fields[field.id] === undefined) continue;
          if (typeof fields[field.id] !== "string" || fields[field.id].length > field.maxLength) return null;
          safeFields[field.id] = fields[field.id];
        }
        next.fieldsByTopic = { ...next.fieldsByTopic, [topic]: safeFields };
      }
      const html = value.htmlByTopic?.[topic];
      if (html !== undefined) {
        if (typeof html !== "string" || html.length > 16384) return null;
        next.htmlByTopic = { ...next.htmlByTopic, [topic]: html };
      }
      const design = value.designsByTopic?.[topic];
      if (design !== undefined) next.designsByTopic = { ...next.designsByTopic, [topic]: creativeDesign(topic, design) };
    }
    if (value.responseUrl !== undefined) {
      if (typeof value.responseUrl !== "string" || value.responseUrl.length > 500) return null;
      next.responseUrl = value.responseUrl;
    }
    return next;
  } catch { return null; }
}

/** Typing one field is one undo step; switching controls starts a new step. */
export function draftChangeGroup(before: CreativeDraft, after: CreativeDraft) {
  if (before.template !== after.template) return "template";
  const topic = after.template;
  for (const map of ["fieldsByTopic", "designsByTopic"] as const) {
    const previous = before[map]?.[topic], next = after[map]?.[topic];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    const keys = Object.keys({ ...previous, ...next });
    const changed = keys.filter(key => (previous as Record<string, unknown> | undefined)?.[key] !== (next as Record<string, unknown> | undefined)?.[key]);
    return `${map}:${topic}:${changed.join(",")}`;
  }
  return before.responseUrl !== after.responseUrl ? "responseUrl" : "html";
}
