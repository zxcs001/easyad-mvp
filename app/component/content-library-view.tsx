"use client";

import "./content-library-view.css";
import { useMemo, useState, type ReactNode } from "react";
import { ExternalLink, FileImage, Film, Image as ImageIcon, Layers3, Search, Trash2 } from "lucide-react";
import type { Booking, Creative, InventoryItem, MediaResource } from "../data";
import type { DbUser } from "../lib/db";
import { capitalize } from "../utils";
import AsyncButton from "./async-button";
import { PanelHeading } from "./shared-ui";

type LibraryFilter = "all" | "image" | "video" | "template";
type StatusFilter = "all" | "active" | "review" | "scheduled" | "inactive";
type ResourceStatus = Exclude<StatusFilter, "all">;

type LibraryItem = {
  id: string;
  kind: "media" | "creative";
  mediaType: Exclude<LibraryFilter, "all">;
  title: string;
  subtitle: string;
  publicUrl: string | null;
  mimeType: string | null;
  createdAt: string;
  inventoryId: string;
  inventoryName: string;
  booking: Booking | null;
  status: ResourceStatus;
  statusLabel: string;
};

export default function ContentLibraryView({ currentUser, inventory, bookings, creatives, mediaResources, onDeleteMedia, onOpenCreative, onOpenInventory }: {
  currentUser?: DbUser | null;
  inventory: InventoryItem[];
  bookings: Booking[];
  creatives: Creative[];
  mediaResources: MediaResource[];
  onDeleteMedia: (id: string) => Promise<boolean>;
  onOpenCreative: (booking: Booking) => void;
  onOpenInventory: (inventoryId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<LibraryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useMemo(() => buildLibraryItems(inventory, bookings, creatives, mediaResources), [inventory, bookings, creatives, mediaResources]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => typeFilter === "all" || item.mediaType === typeFilter)
      .filter((item) => statusFilter === "all" || item.status === statusFilter)
      .filter((item) => !needle || `${item.title} ${item.subtitle} ${item.inventoryName} ${item.statusLabel}`.toLowerCase().includes(needle));
  }, [items, query, statusFilter, typeFilter]);
  const selected = items.find((item) => item.id === selectedId) ?? filtered[0] ?? null;
  const canManageDeviceMedia = currentUser?.role === "admin" || currentUser?.role === "operator" || currentUser?.role === "institutional";

  return <section className="content-cms">
    <div className="cms-summary" aria-label="Content status summary">
      <SummaryMetric label="Total resources" value={items.length} icon={<Layers3 />} />
      <SummaryMetric label="Active" value={countStatus(items, "active")} tone="good" icon={<ImageIcon />} />
      <SummaryMetric label="In review" value={countStatus(items, "review")} tone="warn" icon={<FileImage />} />
      <SummaryMetric label="Scheduled" value={countStatus(items, "scheduled")} icon={<Film />} />
    </div>
    <div className="panel cms-library-panel">
      <PanelHeading eyebrow="Account resources" title="Content library" />
      <div className="cms-toolbar">
        <label className="cms-search"><Search aria-hidden="true" /><input aria-label="Search resources" placeholder="Search campaigns, devices, files..." value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label>Type<select aria-label="Filter by resource type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as LibraryFilter)}><option value="all">All types</option><option value="image">Images</option><option value="video">Videos</option><option value="template">Templates</option></select></label>
        <label>Status<select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="review">In review</option><option value="scheduled">Scheduled</option><option value="inactive">Inactive</option></select></label>
      </div>
      <div className="cms-browser">
        <div className="cms-resource-grid">
          {filtered.length ? filtered.map((item) => <button className={`cms-resource-card${selected?.id === item.id ? " selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
            <ResourcePreview item={item} />
            <span className="cms-resource-copy"><strong>{item.title}</strong><small>{item.inventoryName}</small><span className={`status cms-status ${item.status}`}>{item.statusLabel}</span></span>
          </button>) : <div className="empty-state cms-empty"><strong>No matching resources</strong><span>Adjust the search or filters to see more of your content.</span></div>}
        </div>
        <aside className="cms-detail" aria-label="Selected resource details">
          {selected ? <>
            <ResourcePreview item={selected} large />
            <div className="cms-detail-heading"><span className={`status cms-status ${selected.status}`}>{selected.statusLabel}</span><h3>{selected.title}</h3><p>{selected.subtitle}</p></div>
            <dl><Detail label="Device" value={selected.inventoryName} /><Detail label="Resource type" value={capitalize(selected.mediaType)} /><Detail label="Added" value={new Date(selected.createdAt).toLocaleDateString()} />{selected.booking ? <><Detail label="Campaign dates" value={`${selected.booking.start} to ${selected.booking.end}`} /><Detail label="Delivery" value={`${selected.booking.pop.toLocaleString()} verified plays`} /></> : null}</dl>
            <div className="cms-detail-actions">
              {selected.publicUrl ? <a className="secondary-button" href={selected.publicUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Open</a> : null}
              {selected.booking && (currentUser?.role === "advertiser" || currentUser?.role === "admin") ? <button className="secondary-button" onClick={() => onOpenCreative(selected.booking!)} type="button">Edit creative</button> : null}
              {selected.inventoryId && currentUser?.role !== "advertiser" ? <button className="secondary-button" onClick={() => onOpenInventory(selected.inventoryId)} type="button">Manage device</button> : null}
              {selected.kind === "media" && canManageDeviceMedia ? <AsyncButton className="danger-button" onClick={async () => { const deleted = await onDeleteMedia(selected.id); if (deleted) setSelectedId(null); return deleted; }} successMessage="Resource deleted." errorMessage="Could not delete this resource."><Trash2 aria-hidden="true" />Delete</AsyncButton> : null}
            </div>
          </> : <div className="empty-state"><strong>No resources yet</strong><span>Upload device media or submit campaign creative to begin building this library.</span></div>}
        </aside>
      </div>
    </div>
  </section>;
}

function SummaryMetric({ label, value, icon, tone = "" }: { label: string; value: number; icon: ReactNode; tone?: string }) {
  return <div className={`cms-summary-metric ${tone}`}><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function ResourcePreview({ item, large = false }: { item: LibraryItem; large?: boolean }) {
  if (item.publicUrl && item.mimeType?.startsWith("video/")) return <video className={large ? "large" : ""} muted playsInline preload="metadata" src={item.publicUrl} />;
  if (item.publicUrl && item.mediaType === "image") return <img className={large ? "large" : ""} src={item.publicUrl} alt="" loading="lazy" />;
  return <span className={`cms-placeholder ${large ? "large" : ""}`}>{item.mediaType === "video" ? <Film /> : <FileImage />}<small>{item.mediaType === "template" ? "Template creative" : capitalize(item.mediaType)}</small></span>;
}

function countStatus(items: LibraryItem[], status: ResourceStatus) {
  return items.filter((item) => item.status === status).length;
}

export function buildLibraryItems(inventory: InventoryItem[], bookings: Booking[], creatives: Creative[], mediaResources: MediaResource[]): LibraryItem[] {
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));
  const mediaItems = mediaResources.map((resource): LibraryItem => {
    const device = inventoryById.get(resource.inventoryId);
    const approved = device?.approvalStatus === "approved";
    return { id: resource.id, kind: "media", mediaType: resource.mediaType === "video" ? "video" : "image", title: resource.title, subtitle: resource.originalName, publicUrl: resource.publicUrl, mimeType: resource.mimeType, createdAt: resource.createdAt, inventoryId: resource.inventoryId, inventoryName: device?.name ?? resource.inventoryId, booking: null, status: approved ? "active" : "inactive", statusLabel: approved ? "Published" : capitalize(device?.approvalStatus ?? "Draft") };
  });
  const creativeItems = creatives.flatMap((creative): LibraryItem[] => {
    const booking = bookingById.get(creative.bookingId);
    if (!booking) return [];
    const device = inventoryById.get(booking.inventoryId);
    const status = creativeStatus(booking, creative);
    return [{ id: creative.id, kind: "creative", mediaType: creative.source === "template" ? "template" : creative.mimeType?.startsWith("video/") || creative.fileType === "mp4" ? "video" : "image", title: booking.campaign, subtitle: creative.originalName ?? `${capitalize(creative.template)} template`, publicUrl: creative.publicUrl, mimeType: creative.mimeType, createdAt: creative.createdAt, inventoryId: booking.inventoryId, inventoryName: device?.name ?? booking.inventoryId, booking, status: status.key, statusLabel: status.label }];
  });
  return [...creativeItems, ...mediaItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function creativeStatus(booking: Booking, creative: Creative): { key: ResourceStatus; label: string } {
  const today = new Date().toISOString().slice(0, 10);
  if (booking.status === "rejected" || booking.status === "completed" || booking.end < today || creative.status === "needs changes") return { key: "inactive", label: creative.status === "needs changes" ? "Needs changes" : capitalize(booking.status) };
  if (creative.status === "pending review" || booking.status === "pending approval" || booking.status === "creative review") return { key: "review", label: creative.status === "pending review" ? "In review" : capitalize(booking.status) };
  if (booking.start > today || booking.status === "scheduled") return { key: "scheduled", label: "Scheduled" };
  return { key: "active", label: booking.status === "live" ? "Live" : "Approved" };
}
