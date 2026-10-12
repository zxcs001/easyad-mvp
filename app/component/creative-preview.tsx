"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/client";

export function CreativeCanvas({ document, width, height, safeZone = 8, guides = false, title }: { document?: string; width: number; height: number; safeZone?: number; guides?: boolean; title: string }) {
  const { t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const resize = () => setScale((root.current?.clientWidth ?? 0) / width);
    resize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (root.current) observer?.observe(root.current);
    window.addEventListener("resize", resize);
    return () => { observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, [width]);
  return <div ref={root} className="creative-native-preview" style={{ aspectRatio: `${width} / ${height}` }}>
    {document ? <iframe title={title} sandbox="" referrerPolicy="no-referrer" tabIndex={-1} srcDoc={document} width={width} height={height} style={{ width, height, transform: `scale(${scale})` }} /> : <span>{t("Preparing safe preview…")}</span>}
    {guides ? <div className="creative-preview-guide" aria-hidden="true" style={{ inset: `${safeZone}%` }} /> : null}
  </div>;
}
export default function CreativePreview({ document, width, height, safeZone }: { document?: string; width: number; height: number; safeZone: number }) {
  const { t } = useI18n();
  const [guides, setGuides] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  return <div className="creative-preview-panel">
    <div className="creative-section-heading"><strong>{t("Live preview")}</strong><button type="button" className="secondary-button" disabled={!document} onClick={() => dialog.current?.showModal()}>{t("Enlarge preview")}</button></div>
    <CreativeCanvas document={document} width={width} height={height} safeZone={safeZone} guides={guides} title={t("Template preview")} />
    <div className="creative-preview-caption"><label className="creative-check"><input type="checkbox" checked={guides} onChange={event => setGuides(event.target.checked)} />{t("Show safe zone")}</label><span>{width} × {height}</span></div>
    <dialog ref={dialog} className="creative-preview-dialog" aria-label={t("Enlarged ad preview")}>
      <div className="creative-section-heading"><strong>{t("Enlarged ad preview")}</strong><button type="button" className="secondary-button" onClick={() => dialog.current?.close()}>{t("Close preview")}</button></div>
      <CreativeCanvas document={document} width={width} height={height} safeZone={safeZone} guides={guides} title={t("Enlarged template preview")} />
    </dialog>
  </div>;
}
