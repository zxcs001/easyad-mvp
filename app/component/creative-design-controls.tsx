"use client";
import { useEffect, useRef, useState } from "react";
import { colourContrast, colourPresets, creativeDesign, type CreativeDesign } from "../creative-design";
import type { CreativeTemplateTopic } from "../creative-templates";
import { useI18n } from "../i18n/client";

export default function CreativeDesignControls({ topic, value, onChange, ownerId, onBusyChange }: {
  topic: CreativeTemplateTopic; value?: CreativeDesign; onChange: (value: CreativeDesign) => void;
  ownerId?: string; onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useI18n();
  const design = creativeDesign(topic, value);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const current = useRef(design);
  current.current = design;
  useEffect(() => () => { request.current?.abort(); onBusyChange(false); }, [onBusyChange]);
  function change(update: Partial<CreativeDesign>) { onChange({ ...current.current, ...update }); setMessage(null); }
  async function uploadLogo(file?: File) {
    request.current?.abort();
    if (!file) { setBusy(false); onBusyChange(false); return; }
    const controller = new AbortController(); request.current = controller;
    setBusy(true); onBusyChange(true); setError(null); setMessage(null);
    try {
      const form = new FormData(); form.set("file", file);
      const response = await fetch("/api/creative/logo", { method: "POST", body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || typeof result.logoDataUrl !== "string") throw new Error(result.error ?? "Logo could not be uploaded.");
      if (!controller.signal.aborted) change({ logoDataUrl: creativeDesign(topic, { logoDataUrl: result.logoDataUrl }).logoDataUrl });
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Logo could not be uploaded.");
    } finally { if (!controller.signal.aborted) { setBusy(false); onBusyChange(false); } }
  }
  function brand(action: "save" | "use") {
    if (!ownerId) return;
    try {
      const key = `easyad:brand:v1:${encodeURIComponent(ownerId)}`;
      if (action === "save") {
        const { palette, background, foreground, accent, font, logoDataUrl } = current.current;
        localStorage.setItem(key, JSON.stringify({ version: 1, design: { palette, background, foreground, accent, font, logoDataUrl } }));
        setMessage("Brand saved in this browser.");
      } else {
        const raw = localStorage.getItem(key);
        if (!raw || raw.length > 200000) { setMessage("Save your brand first."); return; }
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1) throw new Error();
        const { palette, background, foreground, accent, font, logoDataUrl } = creativeDesign(topic, parsed.design);
        change({ palette, background, foreground, accent, font, logoDataUrl });
        setMessage("Saved brand applied.");
      }
      setError(null);
    } catch { setError("Browser storage is unavailable. You can keep editing."); }
  }
  const lowContrast = design.palette === "custom" && Math.min(colourContrast(design.background, design.foreground), colourContrast(design.background, design.accent)) < 4.5;
  return <section className="creative-design-controls" aria-label={t("Brand and layout")}>
    <div className="creative-section-heading"><strong>{t("Brand and layout")}</strong>{ownerId ? <div className="button-row">
      <button type="button" className="secondary-button" disabled={busy} onClick={() => brand("save")}>{t("Save brand")}</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => brand("use")}>{t("Use saved brand")}</button>
    </div> : null}</div>
    <div className="creative-palette" role="group" aria-label={t("Colour palette")}>
      <button type="button" aria-pressed={design.palette === "template"} onClick={() => change({ palette: "template" })}>{t("Template colours")}</button>
      {colourPresets.map(preset => <button key={preset.id} type="button" aria-pressed={design.palette === "custom" && design.background === preset.background && design.foreground === preset.foreground && design.accent === preset.accent} onClick={() => change({ palette: "custom", background: preset.background, foreground: preset.foreground, accent: preset.accent })}>
        <span className="creative-palette-swatches" aria-hidden="true">{[preset.background, preset.foreground, preset.accent].map(colour => <i key={colour} style={{ background: colour }} />)}</span>{t(preset.label)}
      </button>)}
    </div>
    <div className="creative-colours">{([ ["background", "Background colour"], ["foreground", "Text colour"], ["accent", "Accent colour"] ] as const).map(([key, label]) => <label key={key}>{t(label)}<input type="color" value={design[key]} onChange={event => change({ palette: "custom", [key]: event.target.value.toUpperCase() })} /><small>{design[key]}</small></label>)}</div>
    {lowContrast ? <p className="helper-text" role="status">{t("Some colours have low contrast. Choose darker text or a lighter background so the ad is easier to read.")}</p> : null}
    <div className="form-grid compact">
      <label>{t("Layout")}<select className="select" aria-label={t("Layout")} value={design.layout} onChange={event => change({ layout: event.target.value as CreativeDesign["layout"] })}>
        <option value="split">{t("Split: text and artwork")}</option><option value="centered">{t("Centred")}</option><option value="type">{t("Type first")}</option>
      </select></label>
      <label>{t("Typography")}<select className="select" aria-label={t("Typography")} value={design.font} onChange={event => change({ font: event.target.value as CreativeDesign["font"] })}>
        <option value="template">{t("Template font")}</option><option value="sans">{t("Modern sans")}</option><option value="serif">{t("Editorial serif")}</option><option value="condensed">{t("Bold condensed")}</option>
      </select></label>
      <label className="creative-size-control">{t("Headline size: {count}%", { count: design.headlineScale })}<input type="range" min={80} max={110} step={1} value={design.headlineScale} onChange={event => change({ headlineScale: Number(event.target.value) })} /></label>
      <label className="creative-check"><input type="checkbox" checked={design.decorations} onChange={event => change({ decorations: event.target.checked })} />{t("Show decorative artwork")}</label>
    </div>
    <div className="creative-logo-control">
      <label>{t("Brand logo (optional)")}<input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={event => { void uploadLogo(event.target.files?.[0]); event.target.value = ""; }} /><small>{t("PNG or JPEG, up to 2 MB. The logo is resized and included in your ad.")}</small></label>
      {design.logoDataUrl ? <div className="creative-logo-sample"><img src={design.logoDataUrl} alt={t("Brand logo")} /><button type="button" className="secondary-button" onClick={() => { request.current?.abort(); setBusy(false); onBusyChange(false); change({ logoDataUrl: "" }); }}>{t("Remove logo")}</button></div> : null}
    </div>
    {busy ? <p role="status">{t("Preparing logo…")}</p> : null}
    {message ? <p className="helper-text" role="status">{t(message)}</p> : null}
    {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
  </section>;
}
