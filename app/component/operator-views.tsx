"use client";

import "./operator-views.css";
import { useEffect, useState } from "react";
import { ApprovalEvent, Booking, Creative, FormatKey, InventoryItem, formats } from "../data";
import type { MediaResource } from "../data";
import { capitalize, money, overlaps, toDate } from "../utils";
import { EditorInput, Meter, PanelHeading } from "./shared-ui";
import PreciseLocationPicker from "./precise-location-picker";
import { deviceTemplates } from "./device-templates";
import AsyncButton from "./async-button";
import LocalDateTime from "./local-date-time";
import AddressFields, { addressIssue } from "./address-fields";
import { toast } from "./toast";
import { useI18n } from "../i18n/client";
import { localeNames, locales } from "../i18n/config";
import { isDigitalInventory, isStaticInventory } from "../lib/inventory-delivery";
import { inventoryAvailabilityLabel, isValidAvailabilityWindow } from "../lib/inventory-availability";

export function InventoryView({
  inventory,
  selectedId,
  select,
  item,
  newItem,
  mediaResources,
  addInventory,
  deleteInventory,
  saveInventory,
  updateInventoryApproval,
  uploadMedia,
  deleteMediaResource,
  canManage,
  canDelete,
}: {
  inventory: InventoryItem[];
  selectedId: string;
  select: (id: string) => void;
  item: InventoryItem;
  newItem: InventoryItem;
  mediaResources: MediaResource[];
  addInventory: (item: InventoryItem) => Promise<boolean>;
  deleteInventory: () => void;
  saveInventory: (item: InventoryItem) => Promise<boolean>;
  updateInventoryApproval: (id: string, approvalStatus: NonNullable<InventoryItem["approvalStatus"]>) => Promise<boolean>;
  uploadMedia: (file: File, title: string) => Promise<boolean>;
  deleteMediaResource: (id: string) => Promise<boolean | void>;
  canManage: boolean;
  canDelete: boolean;
}) {
  const { locale, t } = useI18n();
  const [formItem, setFormItem] = useState<InventoryItem>(item);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const editorItem = formItem;
  const hasInventory = inventory.length > 0;
  const showDevicePanels = hasInventory || isCreating;
  const pendingInventory = inventory.filter((unit) => unit.approvalStatus === "pending approval");

  useEffect(() => {
    if (!isCreating) setFormItem(item);
  }, [item, isCreating]);

  function updateField(field: keyof InventoryItem, value: string | number | boolean | string[]) {
    setFormItem((current) => ({ ...current, [field]: value }));
  }

  async function submitInventory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidAvailabilityWindow(formItem)) {
      const message = "Choose a valid availability start and end date.";
      setSaveError(message);
      toast.error(message);
      return;
    }
    // A new device must carry a real address; its public page says where the
    // screen is. An existing device keeps whatever it already holds, so an
    // edit to another field is never blocked by an old address; the block
    // applies only when this edit touched the address itself.
    // Say which field is missing, and put the person in it. A grey button with
    // no reason leaves them guessing what the form wants.
    const addressProblem = isCreating || formItem.address !== item.address ? addressIssue(formItem.address) : "";
    if (addressProblem) {
      // The address block already shows this sentence under the fields. The
      // form error would repeat it word for word, so the toast carries it
      // instead and the focus lands in the field that is missing.
      setSaveError("");
      toast.error(addressProblem);
      document.querySelector<HTMLElement>('.address-fields [aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const saved = isCreating ? await addInventory(formItem) : await saveInventory(formItem);
      if (!saved) {
        const message = isCreating ? "Unable to create the device. Please try again." : "Unable to save changes. Please try again.";
        setSaveError(message);
        toast.error(message);
      } else {
        toast.success(isCreating ? "Device created." : "Changes saved.");
        setJustSaved(true);
        window.setTimeout(() => setJustSaved(false), 1600);
        if (isCreating) setIsCreating(false);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid inventory-grid">
      <div className="panel span-2">
        <PanelHeading
          eyebrow="Centralized inventory database"
          title="Devices and inventory"
          action={canManage ? <button className="primary-button" type="button" onClick={() => { setFormItem({ ...newItem }); setIsCreating(true); setSaveError(""); }}>{t("Add device")}</button> : <a className="primary-button" href="/login">{t("Sign in to manage")}</a>}
        />
        {hasInventory ? <div className="inventory-table inventory-management-table">
          <div className="table-head inventory-management-head"><span>{t("Unit")}</span><span>{t("Operator")}</span><span>{t("Format")}</span><span>{t("Rate")}</span><span>{t("Occupancy")}</span><span>{t("Availability")}</span><span>{t("Status")}</span></div>
          {inventory.map((unit) => {
            const staticInventory = isStaticInventory(unit);
            const availability = inventoryAvailabilityLabel(unit);
            return (
              <button className={`table-row ${selectedId === unit.id ? "selected" : ""}`} key={unit.id} onClick={() => { setIsCreating(false); setSaveError(""); select(unit.id); }}>
                <span><strong>{unit.name}</strong><small>{unit.address}</small>{unit.tags?.length ? <small>{unit.tags.join(", ")}</small> : null}</span>
                <span>{unit.operator}</span>
                <span><span className="status">{t(unit.deliveryMode === "static" ? "Static" : unit.deliveryMode === "digital" ? "Digital" : "Delivery mode pending")}</span><small>{t(formats[unit.format].label)}</small></span>
                <span>{money(unit.price, locale)}</span>
                <span><Meter value={unit.occupancy} />{unit.occupancy}%</span>
                <span>{unit.availableFrom}<small>{unit.availableTo}</small></span>
                <span><span className={`status ${staticInventory ? availability === "Available" ? "good" : "bad" : unit.approvalStatus === "approved" ? "good" : unit.approvalStatus === "rejected" ? "bad" : ""}`}>{t(staticInventory ? availability : unit.approvalStatus ?? "approved")}</span></span>
              </button>
            );
          })}
        </div> : <div className="empty-state"><strong>{t("No inventory records yet")}</strong><span>{t("Add a device to configure its inventory record and upload public media resources.")}</span></div>}
      </div>
      {canDelete ? <div className="panel span-2">
        <PanelHeading eyebrow="Publishing workflow" title="Inventory approvals" />
        <div className="approval-list">
          {pendingInventory.length ? pendingInventory.map((unit) => (
            <div className="approval-card" key={unit.id}>
              <div><span className="eyebrow">{unit.operator}</span><strong>{unit.name}</strong><small>{unit.address} - {t(formats[unit.format].label)}</small></div>
              <span className="status">{t("pending approval")}</span>
              <div className="approval-actions">
                <AsyncButton onClick={() => updateInventoryApproval(unit.id, "approved")} successMessage={`${unit.name} published.`} errorMessage="Could not publish this device.">Publish</AsyncButton>
                <AsyncButton onClick={() => updateInventoryApproval(unit.id, "rejected")} successMessage={`${unit.name} rejected.`} errorMessage="Could not reject this device.">Reject</AsyncButton>
              </div>
            </div>
          )) : <div className="empty-state"><strong>{t("No inventory awaiting review")}</strong><span>{t("Operator-created devices appear here before they are published.")}</span></div>}
        </div>
      </div> : null}
      {showDevicePanels ? <>
      <div className="panel">
        <PanelHeading
          eyebrow={canDelete ? "Super admin controls" : "Inventory record"}
          title={isCreating ? "New inventory device" : item.name}
          action={canManage ? (
            <div className="inventory-draft-actions">
              <button className="secondary-button" type="button" disabled={saving} onClick={() => { setFormItem(isCreating ? { ...newItem } : { ...item }); setIsCreating(false); setSaveError(""); }}>{t("Cancel")}</button>
              {!isCreating && canDelete ? <button className="danger-button" type="button" onClick={deleteInventory}>{t("Delete")}</button> : null}
              <button className={`primary-button${justSaved ? " is-success-pulse" : ""}`} type="submit" form="inventory-device-form" disabled={saving}>{saving ? <span className="inline-pending"><span className="async-spinner" />{t(isCreating ? "Creating..." : "Saving...")}</span> : t(justSaved ? "Saved" : (isCreating ? "Create device" : "Save changes"))}</button>
            </div>
          ) : undefined}
        />
        {!isCreating && isDigitalInventory(item) ? <div className="public-url-box">
          <span className="eyebrow">{t("Public device URLs")}</span>
          <a href={`/devices/${item.id}`} target="_blank" rel="noreferrer">/devices/{item.id}</a>
          <a href={`/inventory/${item.id}`} target="_blank" rel="noreferrer">/inventory/{item.id}</a>
        </div> : null}
        <form id="inventory-device-form" noValidate onSubmit={submitInventory}>
          {isStaticInventory(editorItem) ? <div className={`decision-banner ${inventoryAvailabilityLabel(editorItem) === "Available" ? "good" : "bad"}`}>
            <strong>{t("Physical billboard status")}: {t(inventoryAvailabilityLabel(editorItem))}</strong>
            <span>{t("This status is calculated from the availability dates below.")}</span>
          </div> : null}
          <div className="form-grid compact">
            <EditorInput label="Name" value={editorItem.name} disabled={!canManage || saving} onChange={(value) => updateField("name", value)} />
            <EditorInput label="Operator" value={editorItem.operator} disabled={!canManage || saving} onChange={(value) => updateField("operator", value)} />
            <AddressFields value={editorItem.address} disabled={!canManage || saving} onChange={(value) => updateField("address", value)} />
            <label>{t("Format")}<select className="select" disabled={!canManage || saving} value={editorItem.format} onChange={(event) => updateField("format", event.target.value)}>{(Object.keys(formats) as FormatKey[]).map((key) => <option key={key} value={key}>{t(formats[key].label)}</option>)}</select></label>
            <label>{t("Delivery mode")}<select className="select" disabled={!canManage || saving} value={editorItem.deliveryMode ?? "unknown"} onChange={(event) => updateField("deliveryMode", event.target.value)}><option value="digital">{t("Digital")}</option><option value="static">{t("Static")}</option><option value="unknown">{t("Needs classification")}</option></select></label>
            <EditorInput label="Product type" value={editorItem.productType ?? editorItem.format} disabled={!canManage || saving} onChange={(value) => updateField("productType", value)} />
            <EditorInput label="Production lead time (days)" type="number" value={editorItem.productionLeadDays ?? 0} disabled={!canManage || saving} onChange={(value) => updateField("productionLeadDays", Math.max(0, Number(value)))} />
            <EditorInput label="Installation lead time (days)" type="number" value={editorItem.installationLeadDays ?? 0} disabled={!canManage || saving} onChange={(value) => updateField("installationLeadDays", Math.max(0, Number(value)))} />
            {editorItem.deliveryMode === "static" && !isCreating ? <a className="secondary-button" href={`/api/inventory/${editorItem.id}/specifications`} target="_blank" rel="noreferrer">{t("Download production specifications")}</a> : null}
            <label>{t("Display template")}<select className="select" disabled={!canManage || saving} value={editorItem.displayTemplate ?? "fullscreen"} onChange={(event) => updateField("displayTemplate", event.target.value)}>{deviceTemplates.map((template) => <option key={template.id} value={template.id}>{t(template.label)}</option>)}</select></label>
            <label>{t("Device display language")}<select aria-describedby="device-display-language-help" aria-label={t("Device display language")} className="select" disabled={!canManage || saving} value={editorItem.displayLanguage ?? "en"} onChange={(event) => updateField("displayLanguage", event.target.value)}>{locales.map((option) => <option key={option} value={option}>{localeNames[option]}</option>)}</select><small id="device-display-language-help">{t("Controls only the public device display. Website language stays unchanged.")}</small></label>
            <label className="check-row"><input type="checkbox" checked={editorItem.commentsEnabled !== false} disabled={!canManage || saving} onChange={(event) => updateField("commentsEnabled", event.target.checked)} />{t("Show visitor comments on the map place panel")}</label>
            <EditorInput label="Map position X" type="number" value={editorItem.x} disabled={!canManage || saving} onChange={(value) => updateField("x", Number(value))} />
            <EditorInput label="Map position Y" type="number" value={editorItem.y} disabled={!canManage || saving} onChange={(value) => updateField("y", Number(value))} />
            <div className="inventory-location-picker">
              <span className="field-label">{t("Device location")}</span>
              <PreciseLocationPicker point={{ x: editorItem.x, y: editorItem.y }} onChange={(point) => { updateField("x", roundCoordinate(point.x)); updateField("y", roundCoordinate(point.y)); }} />
            </div>
            <EditorInput label="Daily rate" type="number" value={editorItem.price} disabled={!canManage || saving} onChange={(value) => updateField("price", Number(value))} />
            <EditorInput label="Impressions" type="number" value={editorItem.impressions} disabled={!canManage || saving} onChange={(value) => updateField("impressions", Number(value))} />
            <EditorInput label="Traffic" type="number" value={editorItem.traffic} disabled={!canManage || saving} onChange={(value) => updateField("traffic", Number(value))} />
            <EditorInput label="Audience" value={editorItem.audience} disabled={!canManage || saving} onChange={(value) => updateField("audience", value)} />
            <TagEditor tags={editorItem.tags ?? []} disabled={!canManage || saving} onChange={(tags) => updateField("tags", tags)} />
            <label>{t("Competitor density")}<select className="select" disabled={!canManage || saving} value={editorItem.competitor} onChange={(event) => updateField("competitor", event.target.value)}>{["Low", "Medium", "High"].map((value) => <option key={value} value={value}>{t(value)}</option>)}</select></label>
            <EditorInput label="Occupancy (%)" type="number" value={editorItem.occupancy} disabled={!canManage || saving} onChange={(value) => updateField("occupancy", Number(value))} />
            {editorItem.deliveryMode === "digital" ? <><EditorInput label="Image loop interval (seconds)" type="number" value={editorItem.imageInterval} disabled={!canManage || saving} onChange={(value) => updateField("imageInterval", clampImageInterval(Number(value)))} /><EditorInput label="Max loop capacity (seconds)" type="number" value={editorItem.maxLoopSeconds} disabled={!canManage || saving} onChange={(value) => updateField("maxLoopSeconds", clampLoopCapacity(Number(value)))} /></> : null}
            <EditorInput label="Availability start" type="date" value={editorItem.availableFrom} disabled={!canManage || saving} onChange={(value) => updateField("availableFrom", value)} />
            <EditorInput label="Availability end" type="date" value={editorItem.availableTo} disabled={!canManage || saving} onChange={(value) => updateField("availableTo", value)} />
          </div>
          {saveError ? <span className="form-error">{t(saveError)}</span> : null}
        </form>
      </div>
      <div className="panel">
        <PanelHeading eyebrow="Public media resources" title="Images and videos" />
        {canManage ? <MediaUploadForm uploadMedia={uploadMedia} /> : <div className="empty">{t("Sign in as an operator or super admin to upload resources.")}</div>}
        <div className="media-list">
          {mediaResources.length ? mediaResources.map((resource) => (
            <div className="media-card" key={resource.id}>
              {resource.mediaType === "video" ? (
                <video controls src={resource.publicUrl} />
              ) : (
                <img alt={resource.title} src={resource.publicUrl} />
              )}
              <div>
                <strong>{resource.title}</strong>
                <span>{resource.originalName}</span>
                <a href={resource.publicUrl} target="_blank" rel="noreferrer">{resource.publicUrl}</a>
              </div>
              {canDelete ? <button className="danger-button" onClick={() => void deleteMediaResource(resource.id)}>{t("Delete")}</button> : null}
            </div>
          )) : <div className="empty">{t("No uploaded resources yet.")}</div>}
        </div>
      </div>
      </> : <div className="panel span-2">
        <div className="empty-state">
          <strong>{t("Add a device first")}</strong>
          <span>{t("Create an inventory device before configuring its record or uploading public media resources.")}</span>
        </div>
      </div>}
    </section>
  );
}

function clampImageInterval(value: number) {
  return Math.min(60, Math.max(2, Math.round(Number.isFinite(value) ? value : 6)));
}

function clampLoopCapacity(value: number) {
  return Math.min(3600, Math.max(2, Math.round(Number.isFinite(value) ? value : 120)));
}

function roundCoordinate(value: number) {
  return Math.round(value * 100000) / 100000;
}

const suggestedDeviceTags = [
  "small", "medium", "large", "digital", "physical", "government", "private", "liberal", "conservative",
  "urban", "rural", "commercial", "high-income", "medium-income", "low-income", "18-24", "25-34", "35-49",
  "50-plus", "near-university", "near-major-highway", "near-bars-clubs", "near-transit", "retail", "sports",
  "commuter", "tourism", "residential",
];

function TagEditor({ tags, disabled, onChange }: { tags: string[]; disabled: boolean; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [customTag, setCustomTag] = useState("");
  const normalizedTags = tags ?? [];

  function toggleTag(tag: string) {
    if (disabled) return;
    onChange(normalizedTags.includes(tag) ? normalizedTags.filter((entry) => entry !== tag) : [...normalizedTags, tag]);
  }

  function addCustomTag() {
    const tag = customTag.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
    if (!tag || normalizedTags.includes(tag) || disabled) return;
    onChange([...normalizedTags, tag]);
    setCustomTag("");
  }

  return (
    <div className="tag-editor">
      <span className="field-label">{t("Device tags")}</span>
      <div className="tag-options">
        {suggestedDeviceTags.map((tag) => <button className={`tag-chip ${normalizedTags.includes(tag) ? "selected" : ""}`} key={tag} type="button" disabled={disabled} onClick={() => toggleTag(tag)}>{t(tag)}</button>)}
      </div>
      <div className="tag-custom-input">
        <input aria-label={t("Custom device tag")} disabled={disabled} value={customTag} placeholder={t("Custom tag")} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addCustomTag(); } }} />
        <button className="secondary-button" type="button" disabled={disabled || !customTag.trim()} onClick={addCustomTag}>{t("Add tag")}</button>
      </div>
      {normalizedTags.length ? <div className="tag-selection">{normalizedTags.map((tag) => <button key={tag} className="tag-chip selected" type="button" disabled={disabled} onClick={() => toggleTag(tag)}>{t(tag)} x</button>)}</div> : null}
    </div>
  );
}

const maxUploadBytes = 50 * 1024 * 1024;

function MediaUploadForm({ uploadMedia }: { uploadMedia: (file: File, title: string) => Promise<boolean> }) {
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) return;
    if (file.size > maxUploadBytes) {
      setError("Files must be 50 MB or smaller.");
      toast.error("Files must be 50 MB or smaller.");
      return;
    }
    try {
      setBusy(true);
      setError("");
      const uploaded = await uploadMedia(file, title || file.name);
      if (!uploaded) {
        setError("Upload failed. Please try again.");
        toast.error("Upload failed. Please try again.");
        return;
      }
      setTitle("");
      form.reset();
      toast.success("Media uploaded.");
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : "Upload failed. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="media-upload" noValidate onSubmit={submit}>
      <label>{t("Resource title")}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("Lobby screen loop")} /></label>
      <label>{t("Image or video")}<input name="file" type="file" accept="image/*,video/*" required /></label>
      {error ? <span className="form-error">{t(error)}</span> : null}
      <button className="primary-button" disabled={busy} type="submit">{t(busy ? "Uploading..." : "Upload resource")}</button>
    </form>
  );
}

export function CalendarView({ inventory, bookings }: { inventory: InventoryItem[]; bookings: Booking[] }) {
  const { formatDate, t } = useI18n();
  // Eight weeks from the Monday of this week. The weeks were fixed at 22 June
  // 2026, so the schedule showed only past weeks, all "Available". Today is read
  // after mount: the server runs in UTC and would print different dates.
  const [firstWeek, setFirstWeek] = useState<Date | null>(null);
  useEffect(() => {
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    setFirstWeek(monday);
  }, []);
  const weeks = firstWeek
    ? Array.from({ length: 8 }, (_, index) => {
      const week = new Date(firstWeek);
      week.setDate(firstWeek.getDate() + index * 7);
      return week;
    })
    : [];
  return (
    <section className="panel">
      <PanelHeading eyebrow="Calendar and availability" title="Campaign schedule" />
      <div className="calendar">
        <div className="calendar-head"><span>{t("Inventory")}</span>{weeks.map((week) => <span key={week.toISOString()}>{formatDate(week, { month: "short", day: "numeric" })}</span>)}</div>
        {inventory.map((item) => <div className="calendar-row" key={item.id}><strong>{item.name}</strong>{weeks.map((week) => <CalendarCell item={item} weekStart={week} bookings={bookings} key={week.toISOString()} />)}</div>)}
      </div>
    </section>
  );
}

export function ApprovalsView({
  bookings,
  inventory,
  creatives,
  mediaResources,
  canReviewDeviceContent,
  approvalHistory,
  hasConflict,
  updateBooking,
  updateMediaApproval,
}: {
  bookings: Booking[];
  inventory: InventoryItem[];
  creatives: Creative[];
  mediaResources: MediaResource[];
  canReviewDeviceContent: boolean;
  approvalHistory: ApprovalEvent[];
  hasConflict: (inventoryId: string, start: string, end: string, excludeId?: string) => boolean;
  updateBooking: (id: string, updates: Partial<Booking>) => Promise<boolean>;
  updateMediaApproval: (id: string, approvalStatus: Extract<MediaResource["approvalStatus"], "approved" | "rejected">) => Promise<boolean>;
}) {
  const { formatDate, t } = useI18n();
  const pending = bookings.filter((booking) => ["pending approval", "creative review"].includes(booking.status));
  const pendingDeviceMedia = canReviewDeviceContent ? mediaResources.filter((resource) => resource.approvalStatus === "pending review") : [];
  return (
    <section className="grid approvals-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow="Operator workflow" title="Approvals" />
        <div className="approval-list">
          {pending.length || pendingDeviceMedia.length ? <>
          {pending.map((booking) => {
            // No fallback to the first device: a booking whose device was
            // deleted showed another device's name, or crashed with none left.
            const item = inventory.find((unit) => unit.id === booking.inventoryId);
            const conflict = hasConflict(booking.inventoryId, booking.start, booking.end, booking.id);
            const creative = creatives.find((entry) => entry.bookingId === booking.id);
            return (
              <div className={`approval-card${creative?.publicUrl ? " has-creative-preview" : ""}`} key={booking.id}>
                <div>
                  <span className="eyebrow">{booking.advertiser}</span>
                  <strong>{booking.campaign}</strong>
                  <small>{item?.name ?? booking.inventoryId} - {booking.start} {t("to")} {booking.end}</small>
                  <small>{t(booking.adSlots === 1 ? "{count} ad slot reserved for this device loop" : "{count} ad slots reserved for this device loop", { count: booking.adSlots })}</small>
                  <small>{creative ? t("Creative: {source} {width}x{height} {type}", { source: creative.source === "upload" ? creative.originalName ?? t("Uploaded media") : t(capitalize(creative.template)), width: creative.width, height: creative.height, type: creative.fileType.toUpperCase() }) : t("Creative: not submitted yet")}</small>
                  {creative?.publicUrl ? <small><a href={creative.publicUrl} target="_blank" rel="noreferrer">{t("Open uploaded media")}</a></small> : null}
                </div>
                {creative?.publicUrl ? (
                  <a className="approval-creative-preview" href={creative.publicUrl} target="_blank" rel="noreferrer" aria-label={t("Preview uploaded creative for {campaign}", { campaign: booking.campaign })}>
                    {creative.mimeType?.startsWith("video/") ? (
                      <video muted playsInline preload="metadata" src={creative.publicUrl} />
                    ) : (
                      <img src={creative.publicUrl} alt={t("Uploaded creative for {campaign}", { campaign: booking.campaign })} loading="lazy" />
                    )}
                    <span>{t("Preview media")}</span>
                  </a>
                ) : null}
                <span className={`status ${conflict ? "bad" : "good"}`}>{t(conflict ? "Over capacity" : "Clear")}</span>
                <span className="status">{t(booking.creativeStatus)}</span>
                <div className="approval-actions">
                  {conflict ? (
                    <span className="disabled-action">{t("Approve")}</span>
                  ) : (
                    <AsyncButton onClick={() => updateBooking(booking.id, { status: "approved", creativeStatus: "approved" })} successMessage={`${booking.campaign} approved.`} errorMessage="Could not approve this campaign.">Approve</AsyncButton>
                  )}
                  <AsyncButton onClick={() => updateBooking(booking.id, { status: "rejected" })} successMessage={`${booking.campaign} rejected.`} errorMessage="Could not reject this campaign.">Reject</AsyncButton>
                </div>
              </div>
            );
          })}
          {pendingDeviceMedia.map((resource) => {
            const device = inventory.find((unit) => unit.id === resource.inventoryId);
            return (
              <div className="approval-card has-creative-preview" key={resource.id}>
                <div>
                  <span className="eyebrow">{t("Operator-submitted device content")}</span>
                  <strong>{resource.title}</strong>
                  <small>{device?.name ?? resource.inventoryId} - {resource.originalName}</small>
                  <small>{t("Institution-owned uploads bypass this queue; delegated operator uploads require review.")}</small>
                </div>
                <a className="approval-creative-preview" href={resource.publicUrl} target="_blank" rel="noreferrer" aria-label={t("Preview device content {title}", { title: resource.title })}>
                  {resource.mediaType === "video" ? <video muted playsInline preload="metadata" src={resource.publicUrl} /> : <img src={resource.publicUrl} alt={t("Submitted device content {title}", { title: resource.title })} loading="lazy" />}
                  <span>{t("Preview media")}</span>
                </a>
                <span className="status">{t("pending review")}</span>
                <div className="approval-actions">
                  <AsyncButton onClick={() => updateMediaApproval(resource.id, "approved")} successMessage={`${resource.title} approved.`} errorMessage="Could not approve this content.">Approve</AsyncButton>
                  <AsyncButton onClick={() => updateMediaApproval(resource.id, "rejected")} successMessage={`${resource.title} rejected.`} errorMessage="Could not reject this content.">Reject</AsyncButton>
                </div>
              </div>
            );
          })}
          </> : (
            <div className="empty-state">
              <strong>{t("No approvals waiting")}</strong>
              <span>{t("Approved or rejected campaigns and delegated device content move out of this queue.")}</span>
            </div>
          )}
        </div>
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Operator audit trail" title="Approval history" />
        <div className="approval-history">
          {approvalHistory.length ? approvalHistory.map((event) => (
            <div className="approval-history-row" key={event.id}>
              <span className={`status ${event.action === "approved" ? "good" : "bad"}`}>{t(event.action)}</span>
              <span><strong>{event.campaign}</strong><small>{event.bookingId} - {event.inventoryId}</small></span>
              <span>{t(event.previousStatus)}<small>{t("to")} {t(event.nextStatus)}</small></span>
              <span>{event.actorName}<small><LocalDateTime value={event.createdAt} options={{ dateStyle: "medium", timeStyle: "short" }} /></small></span>
            </div>
          )) : (
            <div className="empty-state"><strong>{t("No approval history yet")}</strong><span>{t("Approved and rejected campaigns will appear here for tracking.")}</span></div>
          )}
        </div>
      </div>
      <div className="panel"><PanelHeading eyebrow="Automation" title="Controls" /><div className="automation-list"><div><strong>{t("Capacity prevention")}</strong><span>{t("Blocks reservations only when overlapping loop seconds exceed the device maximum.")}</span></div><div><strong>{t("Creative gate")}</strong><span>{t("Requires approved dimensions, safe zone, file type, and distortion checks.")}</span></div><div><strong>{t("Billing state")}</strong><span>{t("Creates invoice-ready spend and revenue split records.")}</span></div></div></div>
    </section>
  );
}

function CalendarCell({ item, weekStart, bookings }: { item: InventoryItem; weekStart: Date; bookings: Booking[] }) {
  const { t } = useI18n();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const booking = bookings.find((entry) => entry.inventoryId === item.id && overlaps(toDate(weekStart), toDate(weekEnd), entry.start, entry.end));
  // A short label per status. It printed the first word of the status, so a
  // cell read "pending" or "creative", untranslated even in French.
  return <span className={`cal-cell ${booking ? "booked" : "available"}`}>{t(booking ? calendarStatusLabels[booking.status] ?? capitalize(booking.status) : "Available")}</span>;
}

const calendarStatusLabels: Record<string, string> = {
  "pending approval": "Pending",
  "creative review": "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  live: "Live",
  completed: "Completed",
  rejected: "Rejected",
};
