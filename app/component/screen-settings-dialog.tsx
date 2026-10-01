"use client";

import { useEffect, useRef, useState } from "react";
import type { InventoryItem } from "../data";
import { useI18n } from "../i18n/client";
import AppDialog from "./app-dialog";
import { deviceTemplates } from "./device-templates";
import { toast } from "./toast";

export type ScreenSettings = Pick<InventoryItem, "displayTemplate" | "displayLanguage" | "imageInterval">;

export default function ScreenSettingsDialog({ screen, onClose, onSave }: {
  screen: InventoryItem;
  onClose: () => void;
  onSave: (id: string, settings: ScreenSettings) => Promise<{ value?: InventoryItem; error?: string }>;
}) {
  const { t } = useI18n();
  const [template, setTemplate] = useState(screen.displayTemplate ?? "fullscreen");
  const [language, setLanguage] = useState(screen.displayLanguage ?? "en");
  const [duration, setDuration] = useState(String(screen.imageInterval));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidDuration, setInvalidDuration] = useState(false);
  const [discard, setDiscard] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const pending = useRef(false);
  const dirty = template !== (screen.displayTemplate ?? "fullscreen") || language !== (screen.displayLanguage ?? "en") || duration !== String(screen.imageInterval);

  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  function close() {
    if (pending.current) return;
    if (dirty) setDiscard(true);
    else onClose();
  }

  async function save() {
    if (pending.current) return;
    const seconds = Number(duration);
    if (!Number.isInteger(seconds) || seconds < 2 || seconds > 60) {
      setInvalidDuration(true);
      setError("Choose a whole number from 2 to 60 seconds.");
      durationRef.current?.focus();
      return;
    }
    setInvalidDuration(false);
    setError("");
    setDiscard(false);
    pending.current = true;
    setBusy(true);
    try {
      const result = await onSave(screen.id, { displayTemplate: template, displayLanguage: language, imageInterval: seconds });
      if (result.error || !result.value) {
        setError(result.error ?? "Unable to save display settings. Try again.");
        return;
      }
      toast.success(t("Display settings saved."));
      onClose();
    } catch {
      setError("Unable to save display settings. Try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <AppDialog open title={t("Edit display settings")} description={screen.name} onClose={close} dismissible={!busy}>
    <form className="network-upload-form network-settings-form" noValidate onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={busy}>
      <p className="network-delivery-note">{t("Save directly to this screen without an approval request. Unpublished screens remain unpublished.")}</p>
      <label>{t("Template")}<select disabled={busy} value={template} onChange={(event) => setTemplate(event.target.value as NonNullable<InventoryItem["displayTemplate"]>)}>{deviceTemplates.map((item) => <option key={item.id} value={item.id}>{t(item.label)}</option>)}</select></label>
      <label>{t("Display language")}<select disabled={busy} value={language} onChange={(event) => setLanguage(event.target.value as "en" | "fr")}><option value="en">{t("English")}</option><option value="fr">{t("French")}</option></select></label>
      <label>{t("Image duration (seconds)")}<input ref={durationRef} disabled={busy} type="number" min={2} max={60} step={1} value={duration} aria-invalid={invalidDuration || undefined} aria-describedby={invalidDuration ? "screen-settings-error" : "screen-settings-duration-help"} onChange={(event) => setDuration(event.target.value)} /></label>
      <small id="screen-settings-duration-help">{t("Images display for 2–60 seconds. Videos keep their own duration.")}</small>
      {error ? <p id="screen-settings-error" className="dialog-error" role="alert">{t(error)}</p> : null}
      {discard ? <div className="network-discard" role="group" aria-label={t("Unsaved changes")}><p>{t("Discard your unsaved display settings?")}</p><button className="secondary-button" type="button" onClick={() => setDiscard(false)}>{t("Keep editing")}</button><button className="warning-button" type="button" onClick={onClose}>{t("Discard changes")}</button></div> : null}
      <div className="dialog-actions"><button className="secondary-button" disabled={busy} type="button" onClick={close}>{t("Cancel")}</button><button className="primary-button" disabled={busy} type="submit">{t(busy ? "Saving…" : "Save changes")}</button></div>
    </form>
  </AppDialog>;
}
