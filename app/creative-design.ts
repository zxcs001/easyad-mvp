import type { CreativeTemplateTopic } from "./creative-templates";

export type CreativeDesign = {
  palette: "template" | "custom";
  background: string;
  foreground: string;
  accent: string;
  layout: "split" | "centered" | "type";
  font: "template" | "sans" | "serif" | "condensed";
  headlineScale: number;
  decorations: boolean;
  logoDataUrl: string;
};
export const MAX_LOGO_BYTES = 128 * 1024;
export const colourPresets = [
  { id: "warm", label: "Warm", background: "#F8CF79", foreground: "#15242D", accent: "#9F3423" },
  { id: "forest", label: "Forest", background: "#E8F1E9", foreground: "#17362F", accent: "#216E55" },
  { id: "ocean", label: "Ocean", background: "#EAF4FF", foreground: "#142C47", accent: "#1456A0" },
  { id: "night", label: "Night", background: "#171531", foreground: "#FFF4DF", accent: "#FF9B80" },
];
const topicColours = { retail: colourPresets[0], finance: colourPresets[1], event: colourPresets[3] };

/** A small, validated design vocabulary. Never accept arbitrary CSS or URLs. */
export function creativeDesign(topic: CreativeTemplateTopic, input?: unknown): CreativeDesign {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) throw new Error("Invalid design settings.");
  const value = (input ?? {}) as Record<string, unknown>;
  const defaults: CreativeDesign = { palette: "template", background: topicColours[topic].background, foreground: topicColours[topic].foreground, accent: topicColours[topic].accent, layout: "split", font: "template", headlineScale: 100, decorations: true, logoDataUrl: "" };
  const design = { ...defaults };
  for (const key of ["background", "foreground", "accent"] as const) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(value[key])) throw new Error("Choose a valid six-digit colour.");
    design[key] = value[key].toUpperCase();
  }
  const choices = { palette: ["template", "custom"], layout: ["split", "centered", "type"], font: ["template", "sans", "serif", "condensed"] } as const;
  for (const key of ["palette", "layout", "font"] as const) {
    if (value[key] === undefined) continue;
    if (!(choices[key] as readonly unknown[]).includes(value[key])) throw new Error("Invalid design settings.");
    Object.assign(design, { [key]: value[key] });
  }
  if (value.headlineScale !== undefined) {
    if (typeof value.headlineScale !== "number" || !Number.isInteger(value.headlineScale) || value.headlineScale < 80 || value.headlineScale > 110) throw new Error("Headline size must be between 80% and 110%.");
    design.headlineScale = value.headlineScale;
  }
  if (value.decorations !== undefined) {
    if (typeof value.decorations !== "boolean") throw new Error("Invalid design settings.");
    design.decorations = value.decorations;
  }
  if (value.logoDataUrl !== undefined) {
    if (typeof value.logoDataUrl !== "string" || (value.logoDataUrl !== "" && (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value.logoDataUrl) || value.logoDataUrl.length > Math.ceil(MAX_LOGO_BYTES / 3) * 4 + 32))) throw new Error("Choose a PNG or JPEG logo up to 128 KB after resizing.");
    design.logoDataUrl = value.logoDataUrl;
  }
  return design;
}

export function colourContrast(a: string, b: string) {
  function luminance(hex: string) {
    const [r, g, blue] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return .2126 * r + .7152 * g + .0722 * blue;
  }
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}
