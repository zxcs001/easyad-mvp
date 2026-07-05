"use client";

import { useEffect, useState } from "react";
import { ApprovalEvent, Booking, Creative, FormatKey, InventoryItem, formats } from "../data";
import type { MediaResource } from "../data";
import { capitalize, money, overlaps, toDate } from "../utils";
import { EditorInput, Meter, PanelHeading } from "./shared-ui";
import PreciseLocationPicker from "./precise-location-picker";
import { deviceTemplates } from "./device-templates";
import AsyncButton from "./async-button";
import { toast } from "./toast";

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
  deleteMediaResource: (id: string) => Promise<void>;
  canManage: boolean;
  canDelete: boolean;
}) {
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
          action={canManage ? <button className="primary-button" type="button" onClick={() => { setFormItem({ ...newItem }); setIsCreating(true); setSaveError(""); }}>Add device</button> : <a className="primary-button" href="/login">Sign in to manage</a>}
        />
        {hasInventory ? <div className="inventory-table inventory-management-table">
          <div className="table-head inventory-management-head"><span>Unit</span><span>Operator</span><span>Format</span><span>Rate</span><span>Occupancy</span><span>Availability</span><span>Publish state</span></div>
          {inventory.map((unit) => (
            <button className={`table-row ${selectedId === unit.id ? "selected" : ""}`} key={unit.id} onClick={() => { setIsCreating(false); setSaveError(""); select(unit.id); }}>
              <span><strong>{unit.name}</strong><small>{unit.address}</small>{unit.tags?.length ? <small>{unit.tags.join(", ")}</small> : null}</span>
              <span>{unit.operator}</span>
              <span>{formats[unit.format].label}</span>
              <span>{money(unit.price)}</span>
              <span><Meter value={unit.occupancy} />{unit.occupancy}%</span>
              <span>{unit.availableFrom}<small>{unit.availableTo}</small></span>
              <span><span className={`status ${unit.approvalStatus === "approved" ? "good" : unit.approvalStatus === "rejected" ? "bad" : ""}`}>{unit.approvalStatus ?? "approved"}</span></span>
            </button>
          ))}
        </div> : <div className="empty-state"><strong>No inventory records yet</strong><span>Add a device to configure its inventory record and upload public media resources.</span></div>}
      </div>
      {canDelete ? <div className="panel span-2">
        <PanelHeading eyebrow="Publishing workflow" title="Inventory approvals" />
        <div className="approval-list">
          {pendingInventory.length ? pendingInventory.map((unit) => (
            <div className="approval-card" key={unit.id}>
              <div><span className="eyebrow">{unit.operator}</span><strong>{unit.name}</strong><small>{unit.address} - {formats[unit.format].label}</small></div>
              <span className="status">pending approval</span>
              <div className="approval-actions">
                <AsyncButton onClick={() => updateInventoryApproval(unit.id, "approved")} successMessage={`${unit.name} published.`} errorMessage="Could not publish this device.">Publish</AsyncButton>
                <AsyncButton onClick={() => updateInventoryApproval(unit.id, "rejected")} successMessage={`${unit.name} rejected.`} errorMessage="Could not reject this device.">Reject</AsyncButton>
              </div>
            </div>
          )) : <div className="empty-state"><strong>No inventory awaiting review</strong><span>Operator-created devices appear here before they are published.</span></div>}
        </div>
      </div> : null}
      {showDevicePanels ? <>
      <div className="panel">
        <PanelHeading
          eyebrow={canDelete ? "Super admin controls" : "Inventory record"}
          title={isCreating ? "New inventory device" : item.name}
          action={canManage ? (
            <div className="inventory-draft-actions">
              <button className="secondary-button" type="button" disabled={saving} onClick={() => { setFormItem(isCreating ? { ...newItem } : { ...item }); setIsCreating(false); setSaveError(""); }}>Cancel</button>
              {!isCreating && canDelete ? <button className="danger-button" type="button" onClick={deleteInventory}>Delete</button> : null}
              <button className={`primary-button${justSaved ? " is-success-pulse" : ""}`} type="submit" form="inventory-device-form" disabled={saving}>{saving ? <span className="inline-pending"><span className="async-spinner" />{isCreating ? "Creating..." : "Saving..."}</span> : justSaved ? "Saved" : (isCreating ? "Create device" : "Save changes")}</button>
            </div>
          ) : undefined}
        />
        {!isCreating ? <div className="public-url-box">
          <span className="eyebrow">Public device URLs</span>
          <a href={`/devices/${item.id}`} target="_blank" rel="noreferrer">/devices/{item.id}</a>
          <a href={`/inventory/${item.id}`} target="_blank" rel="noreferrer">/inventory/{item.id}</a>
        </div> : null}
        <form id="inventory-device-form" onSubmit={submitInventory}>
          <div className="form-grid compact">
            <EditorInput label="Name" value={editorItem.name} disabled={!canManage || saving} onChange={(value) => updateField("name", value)} />
            <EditorInput label="Operator" value={editorItem.operator} disabled={!canManage || saving} onChange={(value) => updateField("operator", value)} />
            <EditorInput label="Address" value={editorItem.address} disabled={!canManage || saving} onChange={(value) => updateField("address", value)} />
            <label>Format<select className="select" disabled={!canManage || saving} value={editorItem.format} onChange={(event) => updateField("format", event.target.value)}>{(Object.keys(formats) as FormatKey[]).map((key) => <option key={key} value={key}>{formats[key].label}</option>)}</select></label>
            <label>Display template<select className="select" disabled={!canManage || saving} value={editorItem.displayTemplate ?? "fullscreen"} onChange={(event) => updateField("displayTemplate", event.target.value)}>{deviceTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select></label>
            <label className="check-row"><input type="checkbox" checked={editorItem.commentsEnabled !== false} disabled={!canManage || saving} onChange={(event) => updateField("commentsEnabled", event.target.checked)} />Show visitor comments on the map place panel</label>
            <EditorInput label="Map position X" type="number" value={editorItem.x} disabled={!canManage || saving} onChange={(value) => updateField("x", Number(value))} />
            <EditorInput label="Map position Y" type="number" value={editorItem.y} disabled={!canManage || saving} onChange={(value) => updateField("y", Number(value))} />
            <div className="inventory-location-picker">
              <span className="field-label">Device location</span>
              <PreciseLocationPicker point={{ x: editorItem.x, y: editorItem.y }} onChange={(point) => { updateField("x", roundCoordinate(point.x)); updateField("y", roundCoordinate(point.y)); }} />
            </div>
            <EditorInput label="Daily rate" type="number" value={editorItem.price} disabled={!canManage || saving} onChange={(value) => updateField("price", Number(value))} />
            <EditorInput label="Impressions" type="number" value={editorItem.impressions} disabled={!canManage || saving} onChange={(value) => updateField("impressions", Number(value))} />
            <EditorInput label="Traffic" type="number" value={editorItem.traffic} disabled={!canManage || saving} onChange={(value) => updateField("traffic", Number(value))} />
            <EditorInput label="Audience" value={editorItem.audience} disabled={!canManage || saving} onChange={(value) => updateField("audience", value)} />
            <TagEditor tags={editorItem.tags ?? []} disabled={!canManage || saving} onChange={(tags) => updateField("tags", tags)} />
            <label>Competitor density<select className="select" disabled={!canManage || saving} value={editorItem.competitor} onChange={(event) => updateField("competitor", event.target.value)}>{["Low", "Medium", "High"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <EditorInput label="Occupancy (%)" type="number" value={editorItem.occupancy} disabled={!canManage || saving} onChange={(value) => updateField("occupancy", Number(value))} />
            <EditorInput label="Image loop interval (seconds)" type="number" value={editorItem.imageInterval} disabled={!canManage || saving} onChange={(value) => updateField("imageInterval", clampImageInterval(Number(value)))} />
            <EditorInput label="Max loop capacity (seconds)" type="number" value={editorItem.maxLoopSeconds} disabled={!canManage || saving} onChange={(value) => updateField("maxLoopSeconds", clampLoopCapacity(Number(value)))} />
            <EditorInput label="Availability start" type="date" value={editorItem.availableFrom} disabled={!canManage || saving} onChange={(value) => updateField("availableFrom", value)} />
            <EditorInput label="Availability end" type="date" value={editorItem.availableTo} disabled={!canManage || saving} onChange={(value) => updateField("availableTo", value)} />
          </div>
          {saveError ? <span className="form-error">{saveError}</span> : null}
        </form>
      </div>
      <div className="panel">
        <PanelHeading eyebrow="Public media resources" title="Images and videos" />
        {canManage ? <MediaUploadForm uploadMedia={uploadMedia} /> : <div className="empty">Sign in as an operator or super admin to upload resources.</div>}
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
              {canDelete ? <button className="danger-button" onClick={() => void deleteMediaResource(resource.id)}>Delete</button> : null}
            </div>
          )) : <div className="empty">No uploaded resources yet.</div>}
        </div>
      </div>
      </> : <div className="panel span-2">
        <div className="empty-state">
          <strong>Add a device first</strong>
          <span>Create an inventory device before configuring its record or uploading public media resources.</span>
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
      <span className="field-label">Device tags</span>
      <div className="tag-options">
        {suggestedDeviceTags.map((tag) => <button className={`tag-chip ${normalizedTags.includes(tag) ? "selected" : ""}`} key={tag} type="button" disabled={disabled} onClick={() => toggleTag(tag)}>{tag}</button>)}
      </div>
      <div className="tag-custom-input">
        <input aria-label="Custom device tag" disabled={disabled} value={customTag} placeholder="Custom tag" onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomTag(); } }} />
        <button className="secondary-button" type="button" disabled={disabled || !customTag.trim()} onClick={addCustomTag}>Add tag</button>
      </div>
      {normalizedTags.length ? <div className="tag-selection">{normalizedTags.map((tag) => <button key={tag} className="tag-chip selected" type="button" disabled={disabled} onClick={() => toggleTag(tag)}>{tag} x</button>)}</div> : null}
    </div>
  );
}

const maxUploadBytes = 50 * 1024 * 1024;

function MediaUploadForm({ uploadMedia }: { uploadMedia: (file: File, title: string) => Promise<boolean> }) {
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
    <form className="media-upload" onSubmit={submit}>
      <label>Resource title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Lobby screen loop" /></label>
      <label>Image or video<input name="file" type="file" accept="image/*,video/*" required /></label>
      {error ? <span className="form-error">{error}</span> : null}
      <button className="primary-button" disabled={busy} type="submit">{busy ? "Uploading..." : "Upload resource"}</button>
    </form>
  );
}

export function CalendarView({ inventory, bookings }: { inventory: InventoryItem[]; bookings: Booking[] }) {
  const weeks = ["Jun 22", "Jun 29", "Jul 6", "Jul 13", "Jul 20", "Jul 27", "Aug 3", "Aug 10"];
  return (
    <section className="panel">
      <PanelHeading eyebrow="Calendar and availability" title="Campaign schedule" />
      <div className="calendar">
        <div className="calendar-head"><span>Inventory</span>{weeks.map((week) => <span key={week}>{week}</span>)}</div>
        {inventory.map((item) => <div className="calendar-row" key={item.id}><strong>{item.name}</strong>{weeks.map((_, index) => <CalendarCell item={item} index={index} bookings={bookings} key={index} />)}</div>)}
      </div>
    </section>
  );
}

export function ApprovalsView({
  bookings,
  inventory,
  creatives,
  approvalHistory,
  hasConflict,
  updateBooking,
}: {
  bookings: Booking[];
  inventory: InventoryItem[];
  creatives: Creative[];
  approvalHistory: ApprovalEvent[];
  hasConflict: (inventoryId: string, start: string, end: string, excludeId?: string) => boolean;
  updateBooking: (id: string, updates: Partial<Booking>) => Promise<boolean>;
}) {
  const pending = bookings.filter((booking) => ["pending approval", "creative review"].includes(booking.status));
  return (
    <section className="grid approvals-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow="Operator workflow" title="Approvals" />
        <div className="approval-list">
          {pending.length ? pending.map((booking) => {
            const item = inventory.find((unit) => unit.id === booking.inventoryId) ?? inventory[0];
            const conflict = hasConflict(booking.inventoryId, booking.start, booking.end, booking.id);
            const creative = creatives.find((entry) => entry.bookingId === booking.id);
            return (
              <div className={`approval-card${creative?.publicUrl ? " has-creative-preview" : ""}`} key={booking.id}>
                <div>
                  <span className="eyebrow">{booking.advertiser}</span>
                  <strong>{booking.campaign}</strong>
                  <small>{item.name} - {booking.start} to {booking.end}</small>
                  <small>{booking.adSlots} ad slot{booking.adSlots === 1 ? "" : "s"} reserved for this device loop</small>
                  <small>{creative ? `Creative: ${creative.source === "upload" ? creative.originalName ?? "Uploaded media" : capitalize(creative.template)} ${creative.width}x${creative.height} ${creative.fileType.toUpperCase()}` : "Creative: not submitted yet"}</small>
                  {creative?.publicUrl ? <small><a href={creative.publicUrl} target="_blank" rel="noreferrer">Open uploaded media</a></small> : null}
                </div>
                {creative?.publicUrl ? (
                  <a className="approval-creative-preview" href={creative.publicUrl} target="_blank" rel="noreferrer" aria-label={`Preview uploaded creative for ${booking.campaign}`}>
                    {creative.mimeType?.startsWith("video/") ? (
                      <video muted playsInline preload="metadata" src={creative.publicUrl} />
                    ) : (
                      <img src={creative.publicUrl} alt={`Uploaded creative for ${booking.campaign}`} loading="lazy" />
                    )}
                    <span>Preview media</span>
                  </a>
                ) : null}
                <span className={`status ${conflict ? "bad" : "good"}`}>{conflict ? "Over capacity" : "Clear"}</span>
                <span className="status">{booking.creativeStatus}</span>
                <div className="approval-actions">
                  {conflict ? (
                    <span className="disabled-action">Approve</span>
                  ) : (
                    <AsyncButton onClick={() => updateBooking(booking.id, { status: "approved", creativeStatus: "approved" })} successMessage={`${booking.campaign} approved.`} errorMessage="Could not approve this campaign.">Approve</AsyncButton>
                  )}
                  <AsyncButton onClick={() => updateBooking(booking.id, { status: "rejected" })} successMessage={`${booking.campaign} rejected.`} errorMessage="Could not reject this campaign.">Reject</AsyncButton>
                </div>
              </div>
            );
          }) : (
            <div className="empty-state">
              <strong>No approvals waiting</strong>
              <span>Approved or rejected campaigns move out of this queue.</span>
            </div>
          )}
        </div>
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Operator audit trail" title="Approval history" />
        <div className="approval-history">
          {approvalHistory.length ? approvalHistory.map((event) => (
            <div className="approval-history-row" key={event.id}>
              <span className={`status ${event.action === "approved" ? "good" : "bad"}`}>{event.action}</span>
              <span><strong>{event.campaign}</strong><small>{event.bookingId} - {event.inventoryId}</small></span>
              <span>{event.previousStatus}<small>to {event.nextStatus}</small></span>
              <span>{event.actorName}<small>{new Date(event.createdAt).toLocaleString()}</small></span>
            </div>
          )) : (
            <div className="empty-state"><strong>No approval history yet</strong><span>Approved and rejected campaigns will appear here for tracking.</span></div>
          )}
        </div>
      </div>
      <div className="panel"><PanelHeading eyebrow="Automation" title="Controls" /><div className="automation-list"><div><strong>Capacity prevention</strong><span>Blocks reservations only when overlapping loop seconds exceed the device maximum.</span></div><div><strong>Creative gate</strong><span>Requires approved dimensions, safe zone, file type, and distortion checks.</span></div><div><strong>Billing state</strong><span>Creates invoice-ready spend and revenue split records.</span></div></div></div>
    </section>
  );
}

function CalendarCell({ item, index, bookings }: { item: InventoryItem; index: number; bookings: Booking[] }) {
  const weekStart = new Date(2026, 5, 22 + index * 7);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const booking = bookings.find((entry) => entry.inventoryId === item.id && overlaps(toDate(weekStart), toDate(weekEnd), entry.start, entry.end));
  return <span className={`cal-cell ${booking ? "booked" : "available"}`}>{booking ? booking.status.split(" ")[0] : "Open"}</span>;
}
