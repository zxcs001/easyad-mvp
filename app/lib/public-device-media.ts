import type { InventoryAdvertiserResource, InventoryItem, MediaResource } from "../data";
import { getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "./db";

export type PublicDeviceMediaItem = {
  id: string;
  position: number;
  deviceId: string;
  source: "device" | "advertiser";
  mediaType: "image" | "video";
  mimeType: string;
  title: string;
  originalName: string;
  publicUrl: string;
  createdAt: string;
  advertiser: string | null;
  campaign: string | null;
  startsOn: string | null;
  endsOn: string | null;
};

export type ActiveDeviceMedia = {
  inventory: InventoryItem;
  items: PublicDeviceMediaItem[];
};

const activeBookingStatuses = new Set(["approved", "scheduled", "live"]);
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm"]);

export async function getActiveDeviceMedia(deviceId: string, asOf = currentDate()) {
  const inventory = await getPublishedInventory(deviceId);
  if (!inventory) return null;
  const [deviceResources, advertiserResources] = await Promise.all([
    listMediaResources(deviceId),
    listInventoryAdvertiserResources(deviceId, asOf),
  ]);
  return buildActiveDeviceMedia(inventory, deviceResources, advertiserResources, asOf);
}

export function buildActiveDeviceMedia(
  inventory: InventoryItem,
  deviceResources: MediaResource[],
  advertiserResources: InventoryAdvertiserResource[],
  asOf = currentDate(),
): ActiveDeviceMedia {
  const deviceItems = deviceResources
    .filter((resource) => (resource.mediaType === "image" || resource.mediaType === "video") && supportedMimeTypes.has(resource.mimeType) && Boolean(resource.publicUrl))
    .map((resource) => ({
      id: resource.id,
      deviceId: inventory.id,
      source: "device" as const,
      mediaType: resource.mediaType as "image" | "video",
      mimeType: resource.mimeType,
      title: resource.title,
      originalName: resource.originalName,
      publicUrl: resource.publicUrl,
      createdAt: resource.createdAt,
      advertiser: null,
      campaign: null,
      startsOn: null,
      endsOn: null,
    }));

  const advertiserItems = advertiserResources
    .filter((resource) => resource.status === "approved"
      && activeBookingStatuses.has(resource.bookingStatus)
      && resource.start <= asOf
      && resource.end >= asOf
      && Boolean(resource.publicUrl)
      && Boolean(resource.mimeType && supportedMimeTypes.has(resource.mimeType)))
    .map((resource) => ({
      id: resource.id,
      deviceId: inventory.id,
      source: "advertiser" as const,
      mediaType: resource.mimeType?.startsWith("video/") ? "video" as const : "image" as const,
      mimeType: resource.mimeType!,
      title: resource.campaign,
      originalName: resource.originalName ?? "uploaded-creative",
      publicUrl: resource.publicUrl!,
      createdAt: resource.createdAt,
      advertiser: resource.advertiser,
      campaign: resource.campaign,
      startsOn: resource.start,
      endsOn: resource.end,
    }));

  const items = [...deviceItems, ...advertiserItems]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() || left.id.localeCompare(right.id))
    .map((item, index) => ({ ...item, position: index + 1 }));

  return { inventory, items };
}

export function resolveDeviceMediaItem(items: PublicDeviceMediaItem[], selector: string) {
  if (/^[1-9]\d*$/.test(selector)) return items[Number(selector) - 1] ?? null;
  return items.find((item) => item.id === selector) ?? null;
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}
