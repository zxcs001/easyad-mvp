"use client";

import "./emergency-updates-view.css";
import { useEffect, useRef, useState } from "react";
import type { DeviceAlert, DeviceAlertType } from "../data";
import type { EmergencyDelivery, EmergencyTarget, EmergencyTargeting } from "../lib/emergency-updates";
import type { EmergencyOverrideDraft } from "./institution-network-view";
import DeviceScreen, { ScaledDevicePreview } from "./device-screen";
import { PanelHeading } from "./shared-ui";
import AppDialog from "./app-dialog";
import { useI18n } from "../i18n/client";
import { toast } from "./toast";
import EmergencyPhotoInput, { useEmergencyPhoto } from "./emergency-photo-input";
import EmergencyTemplatePicker from "./emergency-template-picker";
import { emergencyPlaceholders, type EmergencyTemplate } from "../emergency-templates";

type Snapshot = { targets: EmergencyTarget[]; alerts: DeviceAlert[]; delivery: EmergencyDelivery[]; enabled: boolean; pollMs: number; deliveryGoalMs: number };
type MutationResult = { value?: DeviceAlert; error?: string };

export default function EmergencyUpdatesView({ institutionId, institutionName, institutions = [], onCreate, onEnd }: {
  institutionId: string; institutionName: string; institutions?: { id: string; name: string }[];
  onCreate: (draft: EmergencyOverrideDraft) => Promise<MutationResult>;
  onEnd: (id: string) => Promise<MutationResult>;
}) {
  const { t, formatDate } = useI18n();
  const [owner, setOwner] = useState(institutionId || institutions[0]?.id || "");
  const [mode, setMode] = useState<EmergencyTargeting["mode"]>("all");
  const [query, setQuery] = useState("");
  const [alertType, setAlertType] = useState<DeviceAlertType>("weather");
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("");
  const [message, setMessage] = useState("");
  const photo = useEmergencyPhoto();
  const [minutes, setMinutes] = useState(60);
  const [authorized, setAuthorized] = useState(false);
  const [targets, setTargets] = useState<EmergencyTarget[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [reviewedUrl, setReviewedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [ending, setEnding] = useState<DeviceAlert | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  const [selectedTemplate, setSelectedTemplate] = useState("custom");
  const [replacement, setReplacement] = useState<{ template: EmergencyTemplate | null } | null>(null);
  const templateBaseline = useRef({ title: "", message: "" });
  const unresolved = emergencyPlaceholders(title, area, message);
  const params = new URLSearchParams({ institutionId: owner, mode, query: mode === "search" ? query.trim() : "" });
  const url = `/api/institution/emergency?${params}`;
  const reviewed = reviewedUrl === url && targets.length > 0 && targets.length <= 100;

  function applyTemplate(template: EmergencyTemplate | null) {
    const nextTitle = template ? t(template.headline) : "";
    const nextMessage = template ? t(template.instructions) : "";
    setTitle(nextTitle); setMessage(nextMessage); setAlertType(template?.alertType ?? "public-safety");
    setSelectedTemplate(template?.id ?? "custom"); templateBaseline.current = { title: nextTitle, message: nextMessage };
    photo.setFile(null); setAuthorized(false); setError(""); setReplacement(null);
  }

  function chooseTemplate(template: EmergencyTemplate | null) {
    if (busy || template && selectedTemplate === template.id) return;
    const edited = title !== templateBaseline.current.title || message !== templateBaseline.current.message || Boolean(photo.file);
    if (edited) setReplacement({ template });
    else applyTemplate(template);
  }

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    setSnapshot(null);
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const response = await fetch(`/api/institution/emergency?${new URLSearchParams({ institutionId: owner, mode: "all" })}`, { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Delivery status is unavailable. Retry to refresh it.");
        if (!controller.signal.aborted) { setSnapshot(result); setStatusError(""); }
      } catch {
        if (!controller.signal.aborted) setStatusError("Delivery status is unavailable. Retry to refresh it.");
      } finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 8000); }
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [owner]);

  async function findScreens() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); setAuthorized(false);
    try {
      const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to find screens. Please retry.");
      setSnapshot(result); setTargets(result.targets); setReviewedUrl(url); setStatusError("");
      if (!result.targets.length) setError("No published digital screens match. Change the search or publish a screen first.");
      else if (result.targets.length > 100) setError("More than 100 screens match. Narrow the search before publishing.");
    } catch (error) { setReviewedUrl(""); setTargets([]); setError(error instanceof Error ? error.message : "Unable to find screens. Please retry."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (!photo.ready || photo.error) { setError(photo.error || "Wait for the photo preview to load."); return; }
    if (unresolved.length) { setError("Replace every template prompt with verified details before publishing."); return; }
    if (!reviewed || !authorized || !title.trim() || !message.trim() || !area.trim()) {
      setError("Complete the message, find the target screens, and confirm authorization."); return;
    }
    busyRef.current = true; setBusy(true); setPublishing(true); setError("");
    try {
      const result = await onCreate({ alertType, title: title.trim(), message: message.trim(), area: area.trim(), imageFile: photo.file, expiresAt: new Date(Date.now() + minutes * 60000).toISOString(), targetDeviceIds: [], targeting: { mode, query, institutionId: owner }, reviewedTargetDeviceIds: targets.map(screen => screen.id) });
      if (!result.value) throw new Error(result.error || "Emergency publishing could not be confirmed. Check delivery status before retrying.");
      setSnapshot(current => current ? { ...current, alerts: [result.value!, ...current.alerts.filter(alert => alert.id !== result.value!.id)] } : current);
      setAuthorized(false);
      toast.success("Emergency update published. Waiting for screen acknowledgments.");
    } catch (error) { setError(error instanceof Error ? error.message : "Emergency publishing could not be confirmed. Check delivery status before retrying."); }
    finally { busyRef.current = false; setBusy(false); setPublishing(false); }
  }

  async function endUpdate() {
    if (!ending || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const result = await onEnd(ending.id);
      if (!result.value) throw new Error(result.error || "Unable to end the emergency update.");
      setSnapshot(current => current ? { ...current, alerts: current.alerts.map(alert => alert.id === result.value!.id ? result.value! : alert) } : current);
      setEnding(null); setAuthorized(false); toast.success("Emergency update ended. Screens will resume regular content.");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to end the emergency update."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  const preview: DeviceAlert = { id: "PREVIEW", institutionId: owner, alertType, title: title || t("Alert headline"), area: area || t("Affected area"), message: message || t("Describe the emergency and what people should do."), status: "active", issuedBy: institutions.find(institution => institution.id === owner)?.name || institutionName, createdBy: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + minutes * 60000).toISOString(), endedAt: null, targetDeviceIds: [], image: photo.url && photo.file ? { url: photo.url, mimeType: photo.file.type, originalName: photo.file.name, sizeBytes: photo.file.size } : null };
  const date = (value: string | null) => value ? formatDate(value, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : t("Not reported");
  return <section className="emergency-updates">
    <p className="emergency-delivery-note">{t("Emergency messages replace regular content on your published digital screens. Connected players check every 10 seconds; track receipt and on-screen reports below. Offline screens receive the current alert when they reconnect, before it expires.")}</p>
    {snapshot && !snapshot.enabled ? <p className="form-error" role="alert">{t("Device delivery is not enabled. Ask your administrator to enable and pair screen players before publishing.")}</p> : null}
    <EmergencyTemplatePicker selected={selectedTemplate} disabled={busy} onChoose={chooseTemplate} />
    <div className="emergency-update-grid">
      <div className="panel">
        <PanelHeading eyebrow="Public safety" title="Publish emergency update" />
        <form onSubmit={publish}>
          <fieldset disabled={busy} className="emergency-compose-fields">
            {institutions.length ? <label>{t("Institution")}<select value={owner} onChange={event => { setOwner(event.target.value); setTargets([]); setReviewedUrl(""); setAuthorized(false); }}>{institutions.map(institution => <option key={institution.id} value={institution.id}>{institution.name}</option>)}</select></label> : null}
            <label>{t("Message type")}<select value={alertType} onChange={event => { setAlertType(event.target.value as DeviceAlertType); setAuthorized(false); }}><option value="weather">{t("Severe weather alert")}</option><option value="amber">{t("AMBER Alert")}</option><option value="evacuation">{t("Evacuation notice")}</option><option value="public-safety">{t("Public safety alert")}</option></select></label>
            <label>{t("Alert headline")}<input value={title} maxLength={120} onChange={event => { setTitle(event.target.value); setAuthorized(false); }} /></label>
            <label>{t("Affected area")}<input value={area} maxLength={160} onChange={event => { setArea(event.target.value); setAuthorized(false); }} /></label>
            <label>{t("Instructions")}<textarea value={message} maxLength={600} rows={6} onChange={event => { setMessage(event.target.value); setAuthorized(false); }} /></label>
            <EmergencyPhotoInput photo={photo} disabled={busy} onChange={() => { setAuthorized(false); setError(""); }} />
            {unresolved.length ? <div className="emergency-template-prompts" role="status"><strong>{t("Complete these template prompts before publishing:")}</strong><span>{unresolved.map(prompt => t(prompt)).join(" · ")}</span></div> : null}
            {["missing-person", "amber"].includes(selectedTemplate) ? <p className="emergency-photo-hint">{t("Add a clear photo if available, and include identifying details in the instructions.")}</p> : null}
            <label>{t("Display duration")}<select value={minutes} onChange={event => { setMinutes(Number(event.target.value)); setAuthorized(false); }}>{[15, 30, 60, 180, 360, 1440].map(value => <option key={value} value={value}>{t("{count} minutes", { count: value })}</option>)}</select></label>
            <label>{t("Find target screens")}<select value={mode} onChange={event => { setMode(event.target.value as EmergencyTargeting["mode"]); setAuthorized(false); }}><option value="all">{t("All published digital screens")}</option><option value="search">{t("Search area or screen")}</option></select></label>
            {mode === "search" ? <label>{t("Area, address, building, or screen name")}<input value={query} maxLength={160} onChange={event => { setQuery(event.target.value); setAuthorized(false); }} /></label> : null}
            <button className="secondary-button" onClick={() => void findScreens()} type="button" disabled={!owner || mode === "search" && !query.trim()}>{t("Find screens")}</button>
            {reviewedUrl === url ? <div className="emergency-matched-screens"><strong>{t(targets.length === 1 ? "{count} target screen" : "{count} target screens", { count: targets.length })}</strong><ul>{targets.map(screen => <li key={screen.id}><strong>{screen.name}</strong><small>{screen.address}</small></li>)}</ul></div> : null}
            <label className="emergency-confirm"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)} /><span>{t("I confirm that my agency has authorized this exact message and target scope.")}</span></label>
          </fieldset>
          {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
          <button className="warning-button" type="submit" disabled={busy || unresolved.length > 0 || !photo.ready || Boolean(photo.error) || !reviewed || !authorized || !snapshot?.enabled || Boolean(statusError) || !title.trim() || !area.trim() || !message.trim()}>{t(publishing ? "Publishing…" : "Publish emergency update")}</button>
        </form>
      </div>
      <div className="panel emergency-update-preview">
        <PanelHeading eyebrow="Screen preview" title="Emergency message preview" />
        <ScaledDevicePreview className="emergency-preview-frame"><DeviceScreen inventoryName={t("Emergency message preview")} city={preview.area} imageInterval={10} template="fullscreen" slides={[]} preview activeAlert={preview} /></ScaledDevicePreview>
        <p>{t("The alert takes the whole screen. Normal content resumes when the update ends or expires.")}</p>
        <a className="secondary-button" href="/government?view=network">{t("Pair or check screen players")}</a>
      </div>
    </div>
    <div className="panel">
      <PanelHeading eyebrow="Device delivery" title="Emergency delivery status" />
      <p>{t("Delivery goal: within 2 minutes for connected paired screens. An on-screen report comes from the player software and does not verify the physical panel.")}</p>
      {statusError ? <p className="form-error" role="alert">{t(statusError)}</p> : null}
      {!snapshot?.alerts.length ? <p>{t("No emergency updates yet.")}</p> : snapshot.alerts.map(alert => {
        const active = alert.status === "active" && Date.parse(alert.expiresAt) > Date.now();
        const delivery = snapshot.delivery.filter(row => row.alertId === alert.id);
        return <article className="emergency-update-record" key={alert.id}>
          <div className="emergency-record-head"><div><h3>{alert.title}</h3><small>{alert.area} · {t(active ? "Active" : alert.status === "ended" ? "Ended" : "Expired")} · {t("Display until {time}", { time: date(alert.expiresAt) })}</small></div>{active ? <button className="danger-button" disabled={busy} onClick={() => { setEnding(alert); setError(""); }} type="button">{t("End update")}</button> : null}</div>
          <p>{alert.message}</p>
          {alert.image ? <img className="emergency-record-photo" src={alert.image.url} alt={t("Emergency photo: {title}", { title: alert.title })} /> : null}
          <div className="emergency-delivery-list">{alert.targetDeviceIds.map(id => {
            const row = delivery.find(row => row.inventoryId === id);
            const state = !row ? "Awaiting status" : row.connection === "not-paired" ? "Not paired" : !active ? row.restoredAt ? "Regular content restored" : row.connection === "offline" ? "Offline — delivery unconfirmed" : "Awaiting restoration report" : row.connection === "offline" ? "Offline — delivery unconfirmed" : row.renderedAt ? "Reported on screen" : row.appliedAt ? "Applied — awaiting on-screen report" : row.receivedAt ? "Received" : "Waiting for receipt";
            return <div key={id}><strong>{row?.name || id}</strong><span className={`status ${row?.deadlineMissed ? "bad" : row?.renderedAt ? "good" : ""}`}>{t(state)}</span>{row?.deadlineMissed ? <strong className="form-error">{t("Delivery not confirmed within 2 minutes. Check this screen.")}</strong> : null}<small>{t("Received")} {date(row?.receivedAt ?? null)} · {t("Reported on screen")} {date(row?.renderedAt ?? null)}</small></div>;
          })}</div>
        </article>;
      })}
    </div>
    <AppDialog open={Boolean(replacement)} title={t("Replace current message?")} description={t("This replaces the headline and instructions and removes the current photo. Your area, duration, and target screens are kept.")} initialFocusRef={cancelRef} onClose={() => setReplacement(null)}>
      <p>{replacement ? t("New template: {name}", { name: replacement.template ? t(replacement.template.name) : t("Start blank") }) : ""}</p>
      <div className="dialog-actions"><button className="secondary-button" ref={cancelRef} type="button" onClick={() => setReplacement(null)}>{t("Keep current message")}</button><button className="primary-button" type="button" onClick={() => { if (replacement) applyTemplate(replacement.template); }}>{t("Replace message")}</button></div>
    </AppDialog>
    <AppDialog open={Boolean(ending)} title={t("End emergency update")} description={ending ? t("End {title} on all {count} target screens?", { title: ending.title, count: ending.targetDeviceIds.length }) : undefined} initialFocusRef={cancelRef} dismissible={!busy} onClose={() => { if (!busy) setEnding(null); }}>
      {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
      <div className="dialog-actions"><button className="secondary-button" ref={cancelRef} disabled={busy} onClick={() => setEnding(null)} type="button">{t("Keep update active")}</button><button className="danger-button" disabled={busy} onClick={() => void endUpdate()} type="button">{t("End update")}</button></div>
    </AppDialog>
  </section>;
}
