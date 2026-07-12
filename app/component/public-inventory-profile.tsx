import "./public-inventory-profile.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryAdvertiserResource, MediaResource, formats } from "../data";
import { getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "../lib/db";
import { money, number } from "../utils";
import DeviceScreen from "./device-screen";
import type { DeviceMediaSlide } from "./device-media-carousel";
import { deviceTemplates, resolveDeviceTemplate } from "./device-templates";

export async function PublicInventoryProfile({ inventoryId, alias = "inventory" }: { inventoryId: string; alias?: "inventory" | "device" }) {
  const inventory = await getPublishedInventory(inventoryId);
  if (!inventory) notFound();

  const deviceResources = await listMediaResources(inventoryId);
  const advertiserResources = await listInventoryAdvertiserResources(inventoryId);
  const totalResources = deviceResources.length + advertiserResources.length;
  const spec = formats[inventory.format];
  const template = resolveDeviceTemplate(undefined, inventory.displayTemplate);
  const templateLabel = deviceTemplates.find((entry) => entry.id === template)?.label ?? "Full screen";
  const city = deriveCity(inventory.address);
  const deviceSlides: DeviceMediaSlide[] = deviceResources
    .filter((resource) => resource.mediaType === "image" || resource.mediaType === "video")
    .map((resource) => ({
      id: resource.id,
      title: resource.title,
      subtitle: `${resource.mediaType} - ${resource.originalName}`,
      mediaType: resource.mediaType === "video" ? "video" : "image",
      publicUrl: resource.publicUrl,
      createdAt: resource.createdAt,
    }));
  const advertiserSlides: DeviceMediaSlide[] = advertiserResources
    .filter((resource) => Boolean(resource.publicUrl))
    .map((resource) => ({
      id: resource.id,
      title: resource.campaign,
      subtitle: `Advertiser creative - ${resource.advertiser} - ${resource.originalName ?? "uploaded media"}`,
      mediaType: resource.mimeType?.startsWith("video/") ? "video" : "image",
      publicUrl: resource.publicUrl ?? "",
      createdAt: resource.createdAt,
    }));
  const previewSlides = [...deviceSlides, ...advertiserSlides].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main className="public-device-page">
      <header className="public-device-hero">
        <div>
          <span className="eyebrow">{alias === "device" ? "Device media URL" : "Inventory media URL"}</span>
          <h1>{inventory.name}</h1>
          <p>{inventory.address}</p>
        </div>
        <div className="public-device-actions">
          <Link href="/">Portal</Link>
          <Link href={`/devices/${inventory.id}`}>Device URL</Link>
          <Link href={`/inventory/${inventory.id}`}>Inventory URL</Link>
          <a href={`/api/public/devices/${inventory.id}/media`}>Device API</a>
        </div>
      </header>

      <section className="public-device-summary">
        <PublicMetric label="Format" value={spec.label} />
        <PublicMetric label="Daily rate" value={money(inventory.price)} />
        <PublicMetric label="Impressions" value={number(inventory.impressions)} />
        <PublicMetric label="Audience" value={inventory.audience} />
      </section>
      {inventory.tags?.length ? <section className="public-device-section public-device-tags"><div className="public-section-heading"><span className="eyebrow">Device tags</span></div><div className="device-tag-list">{inventory.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section> : null}

      <section className="public-device-section">
        <div className="public-section-heading">
          <div><span className="eyebrow">Live device display</span><h2>{templateLabel} template preview</h2></div>
          <Link href={`/devices/${inventory.id}`}>Open full device view</Link>
        </div>
        <div className="public-device-preview">
          <DeviceScreen inventoryName={inventory.name} city={city} imageInterval={inventory.imageInterval} slides={previewSlides} template={template} preview />
        </div>
      </section>

      <section className="public-device-section">
        <div className="public-section-heading">
          <span className="eyebrow">Public media resources</span>
          <h2>{totalResources} media file{totalResources === 1 ? "" : "s"}</h2>
        </div>
        {totalResources ? (
          <div className="public-media-grid">
            {deviceResources.map((resource) => <DeviceResourceCard key={resource.id} resource={resource} />)}
            {advertiserResources.map((resource) => <AdvertiserResourceCard key={resource.id} resource={resource} />)}
          </div>
        ) : (
          <div className="public-empty">
            <strong>No media uploaded yet.</strong>
            <span>Operator device resources and advertiser-uploaded creative files for this inventory will appear here.</span>
          </div>
        )}
      </section>
    </main>
  );
}

function deriveCity(address: string) {
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(-1)[0] : "Thunder Bay, ON";
}

function DeviceResourceCard({ resource }: { resource: MediaResource }) {
  return (
    <article className="public-media-card">
      <div className="public-media-preview">
        {resource.mediaType === "video" ? (
          <video controls src={resource.publicUrl} />
        ) : (
          <img alt={resource.title} src={resource.publicUrl} />
        )}
      </div>
      <div className="public-media-body">
        <span className="eyebrow">Device resource</span>
        <h3>{resource.title}</h3>
        <p>{resource.originalName}</p>
        <small>{resource.mediaType} - uploaded {new Date(resource.createdAt).toLocaleString()}</small>
        <a href={resource.publicUrl} target="_blank" rel="noreferrer">Open media file</a>
      </div>
    </article>
  );
}

function AdvertiserResourceCard({ resource }: { resource: InventoryAdvertiserResource }) {
  return (
    <article className="public-media-card">
      <div className="public-media-preview">
        {resource.mimeType?.startsWith("video/") ? (
          <video controls src={resource.publicUrl ?? undefined} />
        ) : (
          <img alt={resource.originalName ?? resource.campaign} src={resource.publicUrl ?? ""} />
        )}
      </div>
      <div className="public-media-body">
        <span className="eyebrow">Advertiser creative - {resource.advertiser}</span>
        <h3>{resource.campaign}</h3>
        <p>{resource.originalName ?? "Uploaded creative"} - {resource.width}x{resource.height} - {resource.fileType.toUpperCase()}</p>
        <small>{resource.start} to {resource.end} - {resource.bookingStatus}</small>
        {resource.publicUrl ? <a href={resource.publicUrl} target="_blank" rel="noreferrer">Open media file</a> : null}
      </div>
    </article>
  );
}

function PublicMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="public-metric"><span>{label}</span><strong>{value}</strong></div>;
}
