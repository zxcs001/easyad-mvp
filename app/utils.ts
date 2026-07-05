import { Booking, FormatKey, InventoryItem, Role, View, formats, locations } from "./data";
import type { CreativeDraft, Filters } from "./types";

export const CURRENT_LOCATION_ID = "current";
export const MANUAL_LOCATION_ID = "manual";

export const defaultFilters: Filters = {
  radius: 20,
  format: "all",
  minImpressions: 0,
  minTraffic: 0,
  minIncome: 0,
  audience: "all",
  competitor: "all",
  priceMax: 1000,
  showCompetitors: true,
  selectedTags: [],
};

export const mapBounds = {
  west: -170,
  east: -50,
  north: 75,
  south: 10,
};

export function portalHref(role: Role, view: View) {
  return `/?role=${role}&view=${view}`;
}

export function creativeHref(draft: CreativeDraft, updates: Partial<CreativeDraft>, bookingId: string) {
  const next = { ...draft, ...updates };
  const params = new URLSearchParams({
    role: "advertiser",
    view: "creative",
    bookingId,
    template: next.template,
    creativeFormat: next.format,
    width: String(next.width),
    height: String(next.height),
    fileType: next.fileType,
    fileSize: String(next.fileSize),
    safeZone: String(next.safeZone),
    distortion: String(next.distortion),
  });
  return `/?${params.toString()}`;
}

export function approvalHref(bookingId: string, action: "approve" | "reject") {
  const params = new URLSearchParams({
    role: "operator",
    view: "approvals",
    approvalId: bookingId,
    approvalAction: action,
  });
  return `/?${params.toString()}`;
}

export function discoveryHref(filters: Filters, locationId: string, itemId: string, area?: { x: number; y: number }, mapZoom?: number) {
  const params = new URLSearchParams({
    role: "advertiser",
    view: "discover",
    location: locationId,
    itemId,
    radius: String(filters.radius),
    format: filters.format,
    minImpressions: String(filters.minImpressions),
    minTraffic: String(filters.minTraffic),
    minIncome: String(filters.minIncome),
    audience: filters.audience,
    competitor: filters.competitor,
    priceMax: String(filters.priceMax),
    showCompetitors: String(filters.showCompetitors),
  });
  if (filters.selectedTags.length) params.set("tags", filters.selectedTags.join(","));
  if (area && (locationId === CURRENT_LOCATION_ID || locationId === MANUAL_LOCATION_ID)) {
    params.set("areaX", String(Math.round(area.x * 100) / 100));
    params.set("areaY", String(Math.round(area.y * 100) / 100));
  }
  if (mapZoom) params.set("mapZoom", String(mapZoom));
  return `/?${params.toString()}`;
}

export function validateCreative(draft: CreativeDraft) {
  const spec = formats[draft.format];
  const ratio = draft.width / draft.height;
  const ratioDelta = Math.abs(ratio - spec.ratio) / spec.ratio;
  const allowedTypes = draft.format === "digital" ? ["png", "jpg", "mp4"] : ["png", "jpg", "pdf"];
  return [
    { label: "Aspect ratio", ok: ratioDelta < 0.025, message: `Expected ${formatRatio(spec.ratio)}, received ${formatRatio(ratio)}.` },
    { label: "Safe zone", ok: draft.safeZone >= spec.safeZone, message: `Requires at least ${spec.safeZone}% margin for this format.` },
    { label: "Distortion", ok: draft.distortion <= 3, message: "Artwork scaling must stay under 3% distortion." },
    { label: "File size", ok: draft.fileSize <= spec.maxSize, message: `Maximum accepted file size is ${spec.maxSize} MB.` },
    { label: "File type", ok: allowedTypes.includes(draft.fileType), message: `Allowed: ${allowedTypes.map((type) => type.toUpperCase()).join(", ")}.` },
  ];
}

export function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function number(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function daysBetween(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

export function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function mapDistanceKm(a: { x: number; y: number }, b: { x: number; y: number }) {
  const [aLng, aLat] = pointToLngLat(a);
  const [bLng, bLat] = pointToLngLat(b);
  const latitudeDelta = toRadians(bLat - aLat);
  const longitudeDelta = toRadians(bLng - aLng);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function geoToMapPoint(latitude: number, longitude: number) {
  return {
    x: clamp(((longitude - mapBounds.west) / (mapBounds.east - mapBounds.west)) * 100, 0, 100),
    y: clamp(((mapBounds.north - latitude) / (mapBounds.north - mapBounds.south)) * 100, 0, 100),
  };
}

export function isKnownLocationId(value: string) {
  return value === CURRENT_LOCATION_ID || value === MANUAL_LOCATION_ID || locations.some((location) => location.id === value);
}

export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return new Date(aStart) <= new Date(bEnd) && new Date(bStart) <= new Date(aEnd);
}

export function estimateSpend(item: InventoryItem, start: string, end: string, adSlots = 1) {
  return Math.round(item.price * daysBetween(start, end) * formats[item.format].priceMultiplier * Math.max(1, adSlots));
}

export function reservedLoopSeconds(item: InventoryItem, adSlots: number) {
  return Math.max(1, adSlots) * item.imageInterval;
}

export function isCapacityReservingStatus(status: Booking["status"]) {
  return !["completed", "rejected"].includes(status);
}

export function bookedLoopSeconds(item: InventoryItem, bookings: Booking[], start: string, end: string, excludeId = "") {
  return bookings
    .filter((booking) => booking.id !== excludeId)
    .filter((booking) => booking.inventoryId === item.id)
    .filter((booking) => isCapacityReservingStatus(booking.status))
    .filter((booking) => overlaps(start, end, booking.start, booking.end))
    .reduce((sum, booking) => sum + reservedLoopSeconds(item, booking.adSlots), 0);
}

export function availableLoopSeconds(item: InventoryItem, bookings: Booking[], start: string, end: string, excludeId = "") {
  return Math.max(0, item.maxLoopSeconds - bookedLoopSeconds(item, bookings, start, end, excludeId));
}

export function exceedsLoopCapacity(item: InventoryItem, bookings: Booking[], start: string, end: string, adSlots: number, excludeId = "") {
  return bookedLoopSeconds(item, bookings, start, end, excludeId) + reservedLoopSeconds(item, adSlots) > item.maxLoopSeconds;
}

export function isCreativeSubmissionAllowed(booking: Booking, asOf = toDate(new Date())) {
  return ["pending approval", "approved"].includes(booking.status) && booking.end >= asOf;
}

// --- Revenue sharing (platform vs. screen owner) -------------------------------
export const PLATFORM_FEE_RATE = 0.15;

export function splitRevenue(gross: number) {
  const platformFee = Math.round(gross * PLATFORM_FEE_RATE);
  return { gross, platformFee, operatorPayout: gross - platformFee };
}

// --- Proof-of-play / delivery analytics ---------------------------------------
// Assumed scheduled plays per active day for a standard loop. Real deployments
// would derive this from the screen's loop length and operating hours.
export const PLAYS_PER_DAY = 180;

// Reference flight length used to prorate an inventory unit's headline
// impressions figure down to a single campaign.
const REFERENCE_FLIGHT_DAYS = 14;

export function expectedPlays(start: string, end: string) {
  return daysBetween(start, end) * PLAYS_PER_DAY;
}

export function expectedImpressions(item: InventoryItem, start: string, end: string) {
  return Math.round((item.impressions * daysBetween(start, end)) / REFERENCE_FLIGHT_DAYS);
}

// Delivered impressions are the expected impressions scaled by verified
// proof-of-play completion, so reporting reflects real delivery rather than a
// flat assumption.
export function deliveredImpressions(item: InventoryItem, booking: { start: string; end: string; pop: number }) {
  return Math.round(expectedImpressions(item, booking.start, booking.end) * (booking.pop / 100));
}

export function formatRatio(value: number) {
  if (Math.abs(value - 16 / 9) < 0.05) return "16:9";
  if (Math.abs(value - 4) < 0.05) return "4:1";
  if (Math.abs(value - 3) < 0.05) return "3:1";
  return `${value.toFixed(2)}:1`;
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function truncateFileName(value: string, maxLength = 30) {
  return value.slice(0, maxLength);
}

export function templateHeadline(template: CreativeDraft["template"]) {
  return { retail: "Weekend offer", finance: "Plan with confidence", event: "Live this Friday" }[template];
}

export function templateTitle(template: CreativeDraft["template"]) {
  return { retail: "Save 30% In Store", finance: "Better Banking Nearby", event: "City Nights Festival" }[template];
}

export function toDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function pointToLngLat(point: { x: number; y: number }): [number, number] {
  return [
    mapBounds.west + (mapBounds.east - mapBounds.west) * (point.x / 100),
    mapBounds.north - (mapBounds.north - mapBounds.south) * (point.y / 100),
  ];
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
