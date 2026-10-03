import "./public-inventory-profile.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InventoryAdvertiserResource, MediaResource, formats } from "../data";
import { getActiveDeviceAlertForDevice, getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "../lib/db";
import { isDigitalInventory } from "../lib/inventory-delivery";
import { money } from "../utils";
import DeviceScreen, { ScaledDevicePreview } from "./device-screen";
import LocalDateTime from "./local-date-time";
import DeviceApiGuide from "./device-api-guide";
import type { DeviceMediaSlide } from "./device-media-carousel";
import { deriveScreenCity, deviceTemplates, resolveDeviceTemplate } from "./device-templates";
import { getServerI18n } from "../i18n/server";
import { translate } from "../i18n/messages";
import type { Locale } from "../i18n/config";

export async function PublicInventoryProfile({ inventoryId, alias = "inventory" }: { inventoryId: string; alias?: "inventory" | "device" }) {
  const { formatDate, formatNumber, locale, t } = await getServerI18n();
  const inventory = await getPublishedInventory(inventoryId);
  if (!inventory || !isDigitalInventory(inventory)) notFound();

  const [deviceResources, advertiserResources, activeAlert] = await Promise.all([
    listMediaResources(inventoryId),
    listInventoryAdvertiserResources(inventoryId),
    getActiveDeviceAlertForDevice(inventoryId),
  ]);
  const approvedDeviceResources = deviceResources.filter((resource) => resource.approvalStatus === "approved");
  const totalResources = approvedDeviceResources.length + advertiserResources.length;
  const spec = formats[inventory.format];
  const template = resolveDeviceTemplate(undefined, inventory.displayTemplate);
  const templateLabel = deviceTemplates.find((entry) => entry.id === template)?.label ?? "Full screen";
  const city = deriveScreenCity(inventory.address);
  const deviceSlides: DeviceMediaSlide[] = approvedDeviceResources
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
      mediaType: resource.mimeType === "text/html" ? "html" : resource.mimeType?.startsWith("video/") ? "video" : "image",
      publicUrl: resource.publicUrl ?? "",
      createdAt: resource.createdAt,
    }));
  const previewSlides = [...deviceSlides, ...advertiserSlides].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <main className="public-device-page">
      <header className="public-device-hero">
        <div>
          <span className="eyebrow">{t(alias === "device" ? "Device media URL" : "Inventory media URL")}</span>
          <h1>{inventory.name}</h1>
          <p>{inventory.address}</p>
        </div>
        <div className="public-device-actions">
          <Link href="/">{t("Portal")}</Link>
          <Link href={`/devices/${inventory.id}`}>{t("Device URL")}</Link>
          <Link href={`/inventory/${inventory.id}`}>{t("Inventory URL")}</Link>
          <a href={`/api/public/devices/${inventory.id}/media`}>{t("Device API")}</a>
        </div>
      </header>

      <section className="public-device-summary">
        <PublicMetric locale={locale} label="Format" value={t(spec.label)} />
        <PublicMetric locale={locale} label="Daily rate" value={money(inventory.price, locale)} />
        <PublicMetric locale={locale} label="Impressions" value={formatNumber(inventory.impressions)} />
        <PublicMetric locale={locale} label="Audience" value={t(inventory.audience)} />
      </section>
      <DeviceApiGuide deviceId={inventory.id} deviceName={inventory.name} mediaCount={previewSlides.length} />
      {inventory.tags?.length ? <section className="public-device-section public-device-tags"><div className="public-section-heading"><span className="eyebrow">{t("Device tags")}</span></div><div className="device-tag-list">{inventory.tags.map((tag) => <span key={tag}>{t(tag)}</span>)}</div></section> : null}

      <section className="public-device-section">
        <div className="public-section-heading">
          <div><span className="eyebrow">{t("Live device display")}</span><h2>{t("{template} template preview", { template: t(templateLabel) })}</h2></div>
          <Link href={`/devices/${inventory.id}`}>{t("Open full device view")}</Link>
        </div>
        <ScaledDevicePreview className="public-device-preview">
          <DeviceScreen inventoryName={inventory.name} city={city} imageInterval={inventory.imageInterval} slides={previewSlides} template={template} displayLanguage={inventory.displayLanguage ?? "en"} activeAlert={activeAlert} preview />
        </ScaledDevicePreview>
      </section>

      <section className="public-device-section">
        <div className="public-section-heading">
          <span className="eyebrow">{t("Public media resources")}</span>
          <h2>{t(totalResources === 1 ? "{count} media file" : "{count} media files", { count: totalResources })}</h2>
        </div>
        {totalResources ? (
          <div className="public-media-grid">
            {approvedDeviceResources.map((resource) => <DeviceResourceCard key={resource.id} resource={resource} locale={locale} formatDate={formatDate} />)}
            {advertiserResources.map((resource) => <AdvertiserResourceCard key={resource.id} resource={resource} locale={locale} />)}
          </div>
        ) : (
          <div className="public-empty">
            <strong>{t("No media uploaded yet.")}</strong>
            <span>{t("Operator device resources and advertiser-uploaded creative files for this inventory will appear here.")}</span>
          </div>
        )}
      </section>
    </main>
  );
}


function DeviceResourceCard({ resource, locale, formatDate }: { resource: MediaResource; locale: Locale; formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string }) {
  const t = (message: string, variables?: Record<string, string | number>) => translate(locale, message, variables);
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
        <span className="eyebrow">{t("Device resource")}</span>
        <h3>{resource.title}</h3>
        <p>{resource.originalName}</p>
        <small>{t(resource.mediaType)} - <LocalDateTime value={resource.createdAt} options={{ dateStyle: "medium", timeStyle: "short" }} template="uploaded {date}" /></small>
        <a href={resource.publicUrl} target="_blank" rel="noreferrer">{t("Open media file")}</a>
      </div>
    </article>
  );
}

function AdvertiserResourceCard({ resource, locale }: { resource: InventoryAdvertiserResource; locale: Locale }) {
  const t = (message: string, variables?: Record<string, string | number>) => translate(locale, message, variables);
  return (
    <article className="public-media-card">
      <div className="public-media-preview">
        {resource.mimeType?.startsWith("video/") ? (
          <video controls src={resource.publicUrl ?? undefined} />
        ) : resource.mimeType === "text/html" ? (
          <iframe src={resource.publicUrl ?? undefined} title={resource.campaign} sandbox="" referrerPolicy="no-referrer" />
        ) : (
          <img alt={resource.originalName ?? resource.campaign} src={resource.publicUrl ?? ""} />
        )}
      </div>
      <div className="public-media-body">
        <span className="eyebrow">{t("Advertiser creative - {name}", { name: resource.advertiser })}</span>
        <h3>{resource.campaign}</h3>
        <p>{resource.originalName ?? t("Uploaded creative")} - {resource.width}x{resource.height} - {resource.fileType.toUpperCase()}</p>
        <small>{resource.start} {t("to")} {resource.end} - {t(resource.bookingStatus)}</small>
        {resource.publicUrl ? <a href={resource.publicUrl} target="_blank" rel="noreferrer">{t("Open media file")}</a> : null}
      </div>
    </article>
  );
}

function PublicMetric({ label, value, locale }: { label: string; value: string | number; locale: Locale }) {
  return <div className="public-metric"><span>{translate(locale, label)}</span><strong>{value}</strong></div>;
}
