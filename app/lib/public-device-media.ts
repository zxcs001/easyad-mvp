import type { InventoryAdvertiserResource, InventoryItem, MediaResource } from "../data";
import type { PoolClient } from "pg";
import { getInventory, getPublishedInventory, listInventoryAdvertiserResources, listMediaResources } from "./db";
import { isDigitalInventory } from "./inventory-delivery";
import { addDays, isScheduledNow, type DaypartId } from "./booking-schedule";

export type PublicDeviceMediaItem = {
  id: string;
  position: number;
  deviceId: string;
  source: "device" | "advertiser";
  mediaType: "image" | "video" | "html";
  mimeType: string;
  title: string;
  originalName: string;
  publicUrl: string;
  createdAt: string;
  advertiser: string | null;
  campaign: string | null;
  startsOn: string | null;
  endsOn: string | null;
  /** Time-of-day slots in Toronto time. Absent means all day. */
  dayparts?: DaypartId[];
};

export type ActiveDeviceMedia = {
  inventory: InventoryItem;
  items: PublicDeviceMediaItem[];
};

const activeBookingStatuses = new Set(["approved", "scheduled", "live"]);
const supportedMimeTypes = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm", "text/html"]);

export async function getActiveDeviceMedia(deviceId: string, asOf = currentDate(), client?: PoolClient, through = asOf, authenticated = false) {
  const inventory = authenticated ? await getInventory(deviceId, client) : await getPublishedInventory(deviceId, client);
  if (!inventory || inventory.approvalStatus!=="approved" || !isDigitalInventory(inventory)) return null;
  const [deviceResources, advertiserResources] = await Promise.all([
    listMediaResources(deviceId, client),
    listInventoryAdvertiserResources(deviceId, asOf, client, through),
  ]);
  const result=buildActiveDeviceMedia(inventory, deviceResources, advertiserResources, asOf, through);
  if(!authenticated)result.items=result.items.filter(i=>i.source!=="device"||(!i.startsOn||Date.parse(i.startsOn)<=Date.now())&&(!i.endsOn||Date.parse(i.endsOn)>Date.now()));
  // The public page and API show what plays now, so a time-of-day booking shows only inside its slots.
  // The paired player receives every booking and applies the same rule itself, offline as well.
  if(!authenticated)result.items=result.items.filter(i=>!i.dayparts?.length||isScheduledNow({startDate:i.startsOn??"",endDate:i.endsOn??"",dayparts:i.dayparts},Date.now()));
  return result;
}

export function buildActiveDeviceMedia(
  inventory: InventoryItem,
  deviceResources: MediaResource[],
  advertiserResources: InventoryAdvertiserResource[],
  asOf = currentDate(),
  through = asOf,
): ActiveDeviceMedia {
  const deviceItems = deviceResources
    .filter((resource) => resource.approvalStatus === "approved" && (resource.mediaType === "image" || resource.mediaType === "video") && supportedMimeTypes.has(resource.mimeType) && Boolean(resource.publicUrl) && (!resource.startsAt || Date.parse(resource.startsAt)<=Date.parse(through)+86400000) && (!resource.endsAt || Date.parse(resource.endsAt)>Date.parse(asOf)))
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
      startsOn: resource.startsAt??null,
      endsOn: resource.endsAt??null,
    }));

  const advertiserItems = advertiserResources
    .filter((resource) => resource.status === "approved"
      && activeBookingStatuses.has(resource.bookingStatus)
      && resource.start <= through
      && (resource.end >= asOf || Boolean(resource.dayparts?.length && resource.end >= addDays(asOf, -1)))
      && Boolean(resource.publicUrl)
      && Boolean(resource.mimeType && supportedMimeTypes.has(resource.mimeType)))
    .map((resource) => ({
      id: resource.id,
      deviceId: inventory.id,
      source: "advertiser" as const,
      mediaType: resource.mimeType === "text/html" ? "html" as const : resource.mimeType?.startsWith("video/") ? "video" as const : "image" as const,
      mimeType: resource.mimeType!,
      title: resource.campaign,
      originalName: resource.originalName ?? "uploaded-creative",
      publicUrl: resource.publicUrl!,
      createdAt: resource.createdAt,
      advertiser: resource.advertiser,
      campaign: resource.campaign,
      startsOn: resource.start,
      endsOn: resource.end,
      ...(resource.dayparts?.length ? { dayparts: resource.dayparts } : {}),
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
