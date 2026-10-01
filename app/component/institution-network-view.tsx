"use client";

import "./institution-network-view.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Images, MapPinned, MonitorUp, Radio, ShieldAlert } from "lucide-react";
import type { Booking, Creative, DeviceAlert, DeviceAlertType, InventoryItem, MediaResource } from "../data";
import { deviceTemplates, resolveDeviceTemplate } from "./device-templates";
import type { DeviceMediaSlide } from "./device-media-carousel";
import DeviceScreen, { ScaledDevicePreview } from "./device-screen";
import MapLibreInventoryMap from "./maplibre-inventory-map";
import { PanelHeading } from "./shared-ui";
import AppDialog from "./app-dialog";
import { toast } from "./toast";
import { useExpiringClock } from "./use-expiring-clock";
import { useI18n } from "../i18n/client";
import { toDate } from "../utils";
import { isDigitalInventory } from "../lib/inventory-delivery";
import PlayerControl from "./player-control";
import ScreenSettingsDialog, { type ScreenSettings } from "./screen-settings-dialog";

export type EmergencyOverrideDraft = {
  alertType: DeviceAlertType;
  title: string;
  message: string;
  area: string;
  targetDeviceIds: string[];
  expiresAt: string;
};

type MutationResult<T> = { value?: T; error?: string };

export default function InstitutionNetworkView({
  institutionName,
  isSuperAdmin = false,
  inventory,
  mediaResources,
  bookings,
  creatives,
  alerts,
  selectedId,
  onSelect,
  onOpenInventory,
  onUploadMedia,
  onSetPublishState,
  onCreateAlert,
  onEndAlert,
  onSaveSettings,
}: {
  institutionName: string;
  isSuperAdmin?: boolean;
  inventory: InventoryItem[];
  mediaResources: MediaResource[];
  bookings: Booking[];
  creatives: Creative[];
  alerts: DeviceAlert[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenInventory: (id: string) => void;
  onUploadMedia: (deviceId: string, file: File, title: string) => Promise<MutationResult<true>>;
  onSetPublishState: (id: string, published: boolean) => Promise<MutationResult<InventoryItem>>;
  onCreateAlert: (draft: EmergencyOverrideDraft) => Promise<MutationResult<DeviceAlert>>;
  onEndAlert: (id: string) => Promise<MutationResult<DeviceAlert>>;
  onSaveSettings?: (id: string, settings: ScreenSettings) => Promise<MutationResult<InventoryItem>>;
}) {
  const { t } = useI18n();
  const [publishDialog, setPublishDialog] = useState(false);
  const [alertDialog, setAlertDialog] = useState(false);
  const [uploadDialog, setUploadDialog] = useState(false);
  const [endAlertDialog, setEndAlertDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const filteredInventory = useMemo(() => inventory.filter((device) => `${device.name} ${device.address} ${device.id} ${device.building ?? ""} ${device.department ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [inventory, query]);
  const selected = inventory.find((device) => device.id === selectedId) ?? inventory[0] ?? null;
  const publishedDevices = inventory.filter((device) => device.approvalStatus === "approved");
  const emergencyScopeDevices = useMemo(() => isSuperAdmin
    ? inventory.filter((device) => Boolean(selected?.institutionId) && device.institutionId === selected?.institutionId)
    : inventory, [inventory, isSuperAdmin, selected?.institutionId]);
  const publishedAlertTargets = emergencyScopeDevices.filter((device) => device.approvalStatus === "approved");
  const alertClock = useExpiringClock(alerts.filter((alert) => alert.status === "active").map((alert) => alert.expiresAt));
  const activeAlerts = alerts.filter((alert) => alert.status === "active" && Date.parse(alert.expiresAt) > alertClock);
  const selectedAlert = selected ? activeAlerts.find((alert) => alert.targetDeviceIds.includes(selected.id)) ?? null : null;
  const selectedResources = selected ? mediaResources.filter((resource) => resource.inventoryId === selected.id) : [];
  const selectedApprovedResources = selectedResources.filter((resource) => resource.approvalStatus === "approved");
  const slides = useMemo(() => selected ? deviceSlides(selected, mediaResources, bookings, creatives) : [], [bookings, creatives, mediaResources, selected]);
  const mapCenter = selected ?? averagePoint(inventory);

  useEffect(() => {
    if (selected && selected.id !== selectedId) onSelect(selected.id);
  }, [onSelect, selected, selectedId]);

  async function confirmPublishState() {
    if (!selected) return;
    setBusy(true);
    setDialogError("");
    const publish = selected.approvalStatus !== "approved";
    const result = await onSetPublishState(selected.id, publish);
    setBusy(false);
    if (result.error) {
      setDialogError(result.error);
      return;
    }
    setPublishDialog(false);
    toast.success(publish ? "Screen published." : "Screen unpublished.");
  }

  async function endSelectedAlert() {
    if (!selectedAlert) return;
    setBusy(true);
    setDialogError("");
    const result = await onEndAlert(selectedAlert.id);
    setBusy(false);
    if (result.error) {
      setDialogError(result.error);
      return;
    }
    setEndAlertDialog(false);
    toast.info("Emergency override ended.");
  }

  if (!selected) {
    return (
      <section className="panel institution-network-empty">
        <MonitorUp aria-hidden="true" />
        <h2>{t(isSuperAdmin ? "No institution screens available" : "No screens in this institution")}</h2>
        <p>{t(isSuperAdmin ? "Create or assign an institution-owned device to make it available in Screen control." : "Add the first device to place it on the fleet map, upload content, and create a representative screen preview.")}</p>
        <button className="primary-button" onClick={() => onOpenInventory("")} type="button">{t("Add a device")}</button>
      </section>
    );
  }

  const template = resolveDeviceTemplate(undefined, selected.displayTemplate);
  const templateLabel = deviceTemplates.find((entry) => entry.id === template)?.label ?? "Full screen";
  const isPublished = selected.approvalStatus === "approved";
  const publishVerb = isPublished ? "Unpublish screen" : "Publish screen";

  return (
    <section className="institution-network">
      <div className="network-summary" aria-label={t(isSuperAdmin ? "All institution screen networks summary" : "Institution screen network summary")}>
        <NetworkMetric icon={<MapPinned />} label="Managed screens" value={inventory.length} />
        <NetworkMetric icon={<Radio />} label="Published" value={publishedDevices.length} tone="good" />
        <NetworkMetric icon={<Images />} label="Media resources" value={mediaResources.length} />
        <NetworkMetric icon={<ShieldAlert />} label="Active overrides" value={activeAlerts.length} tone={activeAlerts.length ? "warn" : ""} />
      </div>

      {activeAlerts.length ? (
        <div className="network-active-banner" role="status">
          <span><ShieldAlert aria-hidden="true" /></span>
          <div><strong>{t(activeAlerts.length === 1 ? "{count} emergency override active" : "{count} emergency overrides active", { count: activeAlerts.length })}</strong><small>{t("Targeted screens show the override instead of their regular content until it is ended or expires.")}</small></div>
        </div>
      ) : null}

      <div className="network-control-grid">
        <div className="panel network-map-panel">
          <PanelHeading eyebrow={isSuperAdmin ? "All institution fleets" : "Institution-owned fleet"} title="Device map" action={<span className="status good">{t("{count} scoped", { count: inventory.length })}</span>} />
          <div className="network-map-stage">
            <MapLibreInventoryMap inventory={inventory} visibleInventory={filteredInventory} selectedInventoryId={selected.id} selectedLocation={mapCenter} radius={30} showCompetitors={false} followSelectedLocation={false} onSelect={onSelect} />
          </div>
          <div className="network-search">
            <label>{t("Find a screen")}<input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search name, location or screen ID")} /></label>
            {query ? <button className="ghost-button" type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>{t("Clear search")}</button> : null}
          </div>
          <p className="network-result-count" role="status">{t("{count} of {total} screens", { count: filteredInventory.length, total: inventory.length })}</p>
          <div className="network-device-strip" aria-label={t(isSuperAdmin ? "Institution devices across the platform" : "Institution devices")}>
            {filteredInventory.map((device) => {
              const alertActive = activeAlerts.some((alert) => alert.targetDeviceIds.includes(device.id));
              return (
                <button aria-pressed={device.id === selected.id} className={device.id === selected.id ? "selected" : ""} key={device.id} onClick={() => onSelect(device.id)} type="button">
                  <span className={`network-device-dot ${device.approvalStatus === "approved" ? "published" : "unpublished"}${alertActive ? " alert" : ""}`} aria-hidden="true" />
                  <span><strong>{device.name}</strong><small title={device.address}>{device.address}</small><small>{t(alertActive ? "Emergency override active" : device.approvalStatus === "approved" ? "Published" : "Unpublished")}</small></span>
                </button>
              );
            })}
          </div>
          {!filteredInventory.length ? <p>{t("No matching screens. Clear the search to see your fleet.")}</p> : null}
        </div>

        <div className="panel network-preview-panel">
          <PanelHeading
            eyebrow="Representative screen content"
            title={selected.name}
            action={<span className={`status ${selectedAlert ? "bad" : isPublished ? "good" : ""}`}>{t(selectedAlert ? "Override active" : isPublished ? "Published" : "Unpublished")}</span>}
          />
          <div className="network-preview-note"><Radio aria-hidden="true" /><span>{t("Content preview, not a live camera feed")}</span></div>
          <ScaledDevicePreview className="network-screen-frame">
            <DeviceScreen inventoryName={selected.name} city={deriveCity(selected.address)} imageInterval={selected.imageInterval} slides={slides} template={template} displayLanguage={selected.displayLanguage ?? "en"} activeAlert={selectedAlert} preview />
          </ScaledDevicePreview>
          <div className="network-device-meta">
            <div><span>{t("Template")}</span><strong>{t(templateLabel)}</strong></div>
            <div><span>{t("Approved content")}</span><strong>{t(selectedApprovedResources.length === 1 ? "{count} item" : "{count} items", { count: selectedApprovedResources.length })}</strong></div>
            <div><span>{t("Location")}</span><strong>{selected.address}</strong></div>
            <div><span>{t("Screen ID")}</span><strong>{selected.id}</strong></div>
            <div><span>{t("Display language")}</span><strong>{t(selected.displayLanguage === "fr" ? "French" : "English")}</strong></div>
            <div><span>{t("Image duration")}</span><strong>{t("{count} seconds", { count: selected.imageInterval })}</strong></div>
            {selected.building ? <div><span>{t("Building")}</span><strong>{selected.building}</strong></div> : null}
            {selected.department ? <div><span>{t("Department")}</span><strong>{selected.department}</strong></div> : null}
          </div>
          <div className="network-device-actions">
            <button className="secondary-button" onClick={() => onOpenInventory(selected.id)} type="button"><MonitorUp aria-hidden="true" />{t("Manage device")}</button>
            <button className="secondary-button" onClick={() => setUploadDialog(true)} type="button"><Images aria-hidden="true" />{t(isPublished ? "Publish content" : "Add approved content")}</button>
            {onSaveSettings && isDigitalInventory(selected) ? <button className="secondary-button" onClick={() => setSettingsOpen(true)} type="button">{t("Edit display settings")}</button> : null}
            {isPublished && isDigitalInventory(selected) ? <a className="ghost-button" href={`/devices/${selected.id}`} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{t("Open device view")}</a> : <span aria-disabled="true" className="disabled-action">{t("Device view unavailable")}</span>}
            <button className={isPublished ? "warning-button" : "primary-button"} onClick={() => { setDialogError(""); setPublishDialog(true); }} type="button">{t(publishVerb)}</button>
          </div>
          <p className="network-delivery-note">{t("Changes are available to connected players on their next refresh. Check Player connection for delivery status.")}</p>
        </div>
      </div>

      <section className="panel network-content-panel" aria-label={t("Screen content")}>
        <PanelHeading eyebrow={selected.name} title="Screen content" action={<button className="secondary-button" onClick={() => onOpenInventory(selected.id)} type="button">{t("Manage content")}</button>} />
        <p className="network-delivery-note">{t("Uploaded resources and their approval status. Scheduled content and emergency overrides may change what plays.")}</p>
        {selectedResources.length ? <ul className="network-content-list">{selectedResources.map((resource) => <li key={resource.id}>
          <div className="network-content-thumbnail">{resource.mediaType === "image" ? <img src={resource.publicUrl} alt="" loading="lazy" /> : <Images aria-hidden="true" />}</div>
          <div><strong>{resource.title}</strong><small>{resource.originalName}</small><span className={`status ${resource.approvalStatus === "approved" ? "good" : ""}`}>{t(resource.approvalStatus)}</span></div>
        </li>)}</ul> : <div className="empty-state"><strong>{t("No content uploaded to this screen")}</strong><span>{t("Add an image or video to start your screen rotation.")}</span><button className="primary-button" type="button" onClick={() => setUploadDialog(true)}>{t("Add content")}</button></div>}
      </section>

      {settingsOpen && onSaveSettings ? <ScreenSettingsDialog key={`settings-${selected.id}`} screen={selected} onClose={() => setSettingsOpen(false)} onSave={onSaveSettings} /> : null}

      {isDigitalInventory(selected) ? <PlayerControl key={selected.id} inventoryId={selected.id} screenName={selected.name} /> : null}

      <div className="panel network-alert-panel">
        <div className="network-alert-copy">
          <span className="network-alert-icon"><AlertTriangle aria-hidden="true" /></span>
          <div><span className="eyebrow">{t("Local-government controls")}</span><h2>{t("Emergency screen override")}</h2><p>{t("Replace regular content on selected published screens with an AMBER Alert, evacuation notice, or public-safety message.")}</p></div>
        </div>
        <div className="network-alert-boundary"><strong>{t("Screen delivery only")}</strong><span>{t(isSuperAdmin ? "This does not issue an alert through Alert Ready, wireless alerts, police systems, or any other official public-alert network. Use it only after the responsible agency authorizes the message." : "This does not issue an alert through Alert Ready, wireless alerts, police systems, or any other official public-alert network. Use it only after your agency authorizes the message.")}</span></div>
        <div className="network-alert-actions">
          {selectedAlert ? <button className="danger-button" onClick={() => { setDialogError(""); setEndAlertDialog(true); }} type="button">{t("End override on this screen")}</button> : null}
          <button className="warning-button" disabled={!publishedAlertTargets.length} onClick={() => setAlertDialog(true)} type="button"><ShieldAlert aria-hidden="true" />{t("Create emergency override")}</button>
          {isSuperAdmin && !selected.institutionId ? <small>{t("Choose a screen assigned to an institution before creating an override.")}</small> : null}
        </div>
      </div>

      <PublishStateDialog busy={busy} error={dialogError} isPublished={isPublished} open={publishDialog} screenName={selected.name} onClose={() => { if (!busy) setPublishDialog(false); }} onConfirm={() => void confirmPublishState()} />
      <ContentUploadDialog isScreenPublished={isPublished} open={uploadDialog} screenName={selected.name} onClose={() => setUploadDialog(false)} onUpload={async (file, title) => {
        const result = await onUploadMedia(selected.id, file, title);
        if (result.error) return result.error;
        setUploadDialog(false);
        toast.success(isPublished ? "Content published." : "Content approved and ready for this screen.");
        return "";
      }} />
      <EmergencyOverrideDialog busy={busy} devices={emergencyScopeDevices} institutionName={institutionName} isSuperAdmin={isSuperAdmin} open={alertDialog} selectedDeviceId={selected.id} onClose={() => { if (!busy) setAlertDialog(false); }} onPublish={async (draft) => {
        setBusy(true);
        const result = await onCreateAlert(draft);
        setBusy(false);
        if (result.error) return result.error;
        setAlertDialog(false);
        toast.success("Emergency override published.");
        return "";
      }} />
      <EndAlertDialog alert={selectedAlert} busy={busy} error={dialogError} open={endAlertDialog} onClose={() => { if (!busy) setEndAlertDialog(false); }} onConfirm={() => void endSelectedAlert()} />
    </section>
  );
}

function ContentUploadDialog({ open, screenName, isScreenPublished, onClose, onUpload }: { open: boolean; screenName: string; isScreenPublished: boolean; onClose: () => void; onUpload: (file: File, title: string) => Promise<string> }) {
  const { t } = useI18n();
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBusy(false);
    setError("");
  }, [open]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileInput = event.currentTarget.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setError("Choose a PNG, JPEG, WebP, MP4, or WebM file.");
      fileInput?.focus();
      return;
    }
    const supportedTypes = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]);
    if (!supportedTypes.has(file.type) || file.size > 50 * 1024 * 1024) {
      setError("Choose a supported image or video no larger than 50 MB.");
      fileInput.focus();
      return;
    }
    setBusy(true);
    setError("");
    const result = await onUpload(file, title.trim() || file.name);
    setBusy(false);
    if (result) setError(result);
  }

  return (
    <AppDialog dismissible={!busy} initialFocusRef={titleRef} open={open} title={t(isScreenPublished ? "Publish screen content" : "Add approved screen content")} description={t(isScreenPublished ? "Upload an image or video to {name}. Institution content publishes immediately without an approval queue." : "Upload an image or video to {name}. It is approved immediately and will enter rotation when the screen is published.", { name: screenName })} onClose={onClose}>
      <form className="network-upload-form" noValidate onSubmit={submit}>
        <div className="network-direct-publish-note" role="note"><Radio aria-hidden="true" /><span><strong>{t("No approval required")}</strong><small>{t(isScreenPublished ? "This content joins the live screen rotation after upload completes." : "This content is ready immediately, but the screen remains unpublished.")}</small></span></div>
        <label>{t("Content title")}<input maxLength={120} placeholder={t("Community event poster")} ref={titleRef} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>{t("Image or video")}<input accept="image/png,image/jpeg,image/webp,video/mp4,video/webm" name="file" type="file" /></label>
        <p className="network-upload-help">{t("PNG, JPEG, WebP, MP4, or WebM · Maximum 50 MB")}</p>
        {error ? <p className="dialog-error" role="alert">{t(error)}</p> : null}
        <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose} type="button">{t("Cancel")}</button><button className="primary-button" disabled={busy} type="submit">{t(busy ? "Publishing…" : isScreenPublished ? "Publish content" : "Add approved content")}</button></div>
      </form>
    </AppDialog>
  );
}

function NetworkMetric({ icon, label, value, tone = "" }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  const { t } = useI18n();
  return <div className={`network-metric ${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{t(label)}</small></div></div>;
}

function PublishStateDialog({ open, busy, error, isPublished, screenName, onClose, onConfirm }: { open: boolean; busy: boolean; error: string; isPublished: boolean; screenName: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const verb = isPublished ? "Unpublish screen" : "Publish screen";
  return (
    <AppDialog open={open} title={t(verb)} description={t(isPublished ? "{name} will no longer be available through its public device, inventory, or media URLs." : "{name} and its approved content will become reachable through the public device and inventory views.", { name: screenName })} onClose={onClose} dismissible={!busy} initialFocusRef={cancelRef}>
      <div className="network-confirm-dialog">
        <div className="network-confirm-object"><MonitorUp aria-hidden="true" /><div><span>{t("Screen")}</span><strong>{screenName}</strong></div></div>
        {error ? <p className="dialog-error" role="alert">{t(error)}</p> : null}
        <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose} ref={cancelRef} type="button">{t("Cancel")}</button><button className={isPublished ? "warning-button" : "primary-button"} disabled={busy} onClick={onConfirm} type="button">{t(busy ? "Updating…" : verb)}</button></div>
      </div>
    </AppDialog>
  );
}

function EmergencyOverrideDialog({ open, busy, devices, selectedDeviceId, institutionName, isSuperAdmin, onClose, onPublish }: { open: boolean; busy: boolean; devices: InventoryItem[]; selectedDeviceId: string; institutionName: string; isSuperAdmin: boolean; onClose: () => void; onPublish: (draft: EmergencyOverrideDraft) => Promise<string> }) {
  const { t } = useI18n();
  const published = useMemo(() => devices.filter((device) => device.approvalStatus === "approved"), [devices]);
  const titleRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => emptyAlertDraft(selectedDeviceId, published));
  const [duration, setDuration] = useState(60);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState("");
  const wasOpen = useRef(false);

  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setDraft(emptyAlertDraft(selectedDeviceId, published));
    setDuration(60);
    setAuthorized(false);
    setError("");
  }, [open, published, selectedDeviceId]);

  function toggleTarget(id: string) {
    setDraft((current) => ({ ...current, targetDeviceIds: current.targetDeviceIds.includes(id) ? current.targetDeviceIds.filter((entry) => entry !== id) : [...current.targetDeviceIds, id] }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.message.trim() || !draft.area.trim() || !draft.targetDeviceIds.length || !authorized) {
      setError("Complete the message, choose at least one published screen, and confirm authorization.");
      if (!draft.title.trim()) titleRef.current?.focus();
      return;
    }
    setError("");
    const result = await onPublish({ ...draft, title: draft.title.trim(), message: draft.message.trim(), area: draft.area.trim(), expiresAt: new Date(Date.now() + duration * 60_000).toISOString() });
    if (result) setError(result);
  }

  return (
    <AppDialog className="emergency-compose-dialog" dismissible={!busy} initialFocusRef={titleRef} open={open} title={t("Create emergency screen override")} description={t("Publish a high-priority message to screens owned by {name}.", { name: institutionName })} onClose={onClose}>
      <form className="emergency-compose-form" noValidate onSubmit={submit}>
        <div className="emergency-form-boundary"><ShieldAlert aria-hidden="true" /><p><strong>{t("Screen delivery only.")}</strong> {t(isSuperAdmin ? "Confirm the alert through the responsible agency's official process before using this override." : "Confirm the alert through your agency's official process before using this override.")}</p></div>
        <div className="emergency-form-grid">
          <label>{t("Message type")}<select value={draft.alertType} onChange={(event) => setDraft((current) => ({ ...current, alertType: event.target.value as DeviceAlertType }))}><option value="public-safety">{t("Public safety")}</option><option value="evacuation">{t("Evacuation")}</option><option value="amber">{t("AMBER Alert")}</option></select></label>
          <label>{t("Display duration")}<select value={duration} onChange={(event) => setDuration(Number(event.target.value))}><option value={30}>{t("30 minutes")}</option><option value={60}>{t("1 hour")}</option><option value={180}>{t("3 hours")}</option><option value={360}>{t("6 hours")}</option><option value={720}>{t("12 hours")}</option></select></label>
          <label className="span-2">{t("Alert headline")}<input aria-invalid={Boolean(error && !draft.title.trim())} maxLength={120} ref={titleRef} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder={t("Short, specific headline")} /></label>
          <label className="span-2">{t("Area or location")}<input maxLength={160} value={draft.area} onChange={(event) => setDraft((current) => ({ ...current, area: event.target.value }))} placeholder={t("Affected neighbourhood, route, or municipality")} /></label>
          <label className="span-2">{t("Instructions")}<textarea className="resize-none" maxLength={600} rows={5} value={draft.message} onChange={(event) => setDraft((current) => ({ ...current, message: event.target.value }))} placeholder={t("State what happened and what people should do now.")} /></label>
        </div>
        <fieldset className="emergency-targets"><legend>{t("Target published screens")}</legend><div className="emergency-target-toolbar"><span>{t("{selected} of {total} selected", { selected: draft.targetDeviceIds.length, total: published.length })}</span><button className="ghost-button" onClick={() => setDraft((current) => ({ ...current, targetDeviceIds: published.map((device) => device.id) }))} type="button">{t("Select all published")}</button></div><div className="emergency-target-list">{devices.map((device) => <label className={device.approvalStatus === "approved" ? "" : "disabled"} key={device.id}><input checked={draft.targetDeviceIds.includes(device.id)} disabled={device.approvalStatus !== "approved"} onChange={() => toggleTarget(device.id)} type="checkbox" /><span><strong>{device.name}</strong><small>{device.approvalStatus === "approved" ? device.address : t("Publish this screen before targeting it")}</small></span></label>)}</div></fieldset>
        <label className="emergency-authorization"><input checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} type="checkbox" /><span>{t(isSuperAdmin ? "I confirm that the responsible agency has authorized this exact message and target scope." : "I confirm that my agency has authorized this exact message and target scope.")}</span></label>
        {error ? <p className="dialog-error" role="alert">{t(error)}</p> : null}
        <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose} type="button">{t("Cancel")}</button><button className="warning-button" disabled={busy || !authorized || !draft.targetDeviceIds.length} type="submit">{t(busy ? "Publishing…" : "Publish emergency override")}</button></div>
      </form>
    </AppDialog>
  );
}

function EndAlertDialog({ alert, open, busy, error, onClose, onConfirm }: { alert: DeviceAlert | null; open: boolean; busy: boolean; error: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AppDialog dismissible={!busy} initialFocusRef={cancelRef} open={open && Boolean(alert)} title={t("End emergency override")} description={alert ? t(alert.targetDeviceIds.length === 1 ? "{title} will stop replacing regular content on {count} targeted screen." : "{title} will stop replacing regular content on all {count} targeted screens.", { title: alert.title, count: alert.targetDeviceIds.length }) : undefined} onClose={onClose}>
      <div className="network-confirm-dialog">
        <p>{t("End this override only when the agency has cleared the screen message. Regular scheduled content resumes immediately.")}</p>
        {error ? <p className="dialog-error" role="alert">{t(error)}</p> : null}
        <div className="dialog-actions"><button className="secondary-button" disabled={busy} onClick={onClose} ref={cancelRef} type="button">{t("Keep override active")}</button><button className="danger-button" disabled={busy} onClick={onConfirm} type="button">{t(busy ? "Ending…" : "End override")}</button></div>
      </div>
    </AppDialog>
  );
}

function emptyAlertDraft(selectedDeviceId: string, published: InventoryItem[]): EmergencyOverrideDraft {
  return { alertType: "public-safety", title: "", message: "", area: "", targetDeviceIds: published.some((device) => device.id === selectedDeviceId) ? [selectedDeviceId] : [], expiresAt: "" };
}

function deviceSlides(selected: InventoryItem, mediaResources: MediaResource[], bookings: Booking[], creatives: Creative[]): DeviceMediaSlide[] {
  const mediaSlides = mediaResources.filter((resource) => resource.inventoryId === selected.id && resource.approvalStatus === "approved" && (resource.mediaType === "image" || resource.mediaType === "video")).map((resource) => ({ id: resource.id, title: resource.title, subtitle: resource.originalName, mediaType: resource.mediaType as "image" | "video", publicUrl: resource.publicUrl, createdAt: resource.createdAt }));
  const today = toDate(new Date()); // local date, not the UTC date
  const bookingMap = new Map(bookings.filter((booking) => booking.inventoryId === selected.id && booking.start <= today && booking.end >= today && ["approved", "scheduled", "live"].includes(booking.status)).map((booking) => [booking.id, booking]));
  const creativeSlides = creatives.filter((creative) => creative.status === "approved" && Boolean(creative.publicUrl) && bookingMap.has(creative.bookingId)).map((creative) => { const booking = bookingMap.get(creative.bookingId)!; return { id: creative.id, title: booking.campaign, subtitle: booking.advertiser, mediaType: creative.mimeType === "text/html" ? "html" as const : creative.mimeType?.startsWith("video/") ? "video" as const : "image" as const, publicUrl: creative.publicUrl!, createdAt: creative.createdAt }; });
  return [...mediaSlides, ...creativeSlides].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function averagePoint(inventory: InventoryItem[]) {
  if (!inventory.length) return { x: 50, y: 50 };
  return { x: inventory.reduce((sum, device) => sum + device.x, 0) / inventory.length, y: inventory.reduce((sum, device) => sum + device.y, 0) / inventory.length };
}

function deriveCity(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(", ") : "Local service area";
}
