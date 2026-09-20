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

// In-app links keep a real href and switch the view client-side on a plain
// left click only. A modified click (Cmd, Ctrl, Shift, Alt) or a middle click
// is left to the browser, so "open in new tab" still works.
export function isPlainLeftClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented;
}

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
  const allowedTypes = draft.format === "digital" ? ["png", "jpg", "gif", "mp4"] : ["png", "jpg", "pdf"];
  return [
    { label: "Aspect ratio", ok: ratioDelta < 0.025, message: `Expected ${formatRatio(spec.ratio)}, received ${formatRatio(ratio)}.` },
    { label: "Safe zone", ok: draft.safeZone >= spec.safeZone, message: `Requires at least ${spec.safeZone}% margin for this format.` },
    { label: "Distortion", ok: draft.distortion <= 3, message: "Artwork scaling must stay under 3% distortion." },
    { label: "File size", ok: draft.fileSize <= spec.maxSize, message: `Maximum accepted file size is ${spec.maxSize} MB.` },
    { label: "File type", ok: allowedTypes.includes(draft.fileType), message: `Allowed: ${allowedTypes.map((type) => type.toUpperCase()).join(", ")}.` },
  ];
}

export function money(value: number, locale: "en" | "fr" = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }).format(value);
}

export function number(value: number, locale: "en" | "fr" = "en") {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
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
  return ["approved", "scheduled", "live"].includes(status);
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

export function expectedPlays(start: string, end: string) {
  return daysBetween(start, end) * PLAYS_PER_DAY;
}

// A screen's impressions figure belongs to the screen, for one day. An
// advertiser on a digital screen earns only its share of the loop: a 10-second
// spot in a 60-second loop is one sixth of the screen. Counting the whole
// screen against one advertiser is the mistake a media buyer spots first.
// A static face has no loop, so its advertiser earns the whole face.
export function loopShare(item: Pick<InventoryItem, "deliveryMode" | "imageInterval" | "maxLoopSeconds">, adSlots = 1) {
  if (item.deliveryMode === "static") return 1;
  const spotSeconds = item.imageInterval || 10;
  const loopSeconds = item.maxLoopSeconds || 0;
  if (!loopSeconds) return 1;
  return Math.min(1, (Math.max(1, adSlots) * spotSeconds) / loopSeconds);
}

export function expectedImpressions(item: InventoryItem, start: string, end: string, adSlots = 1) {
  return Math.round(item.impressions * daysBetween(start, end) * loopShare(item, adSlots));
}

// Delivered impressions scale the booked figure by operator-declared completion.
// They are not measured views or authenticated player evidence.
export function deliveredImpressions(item: InventoryItem, booking: { start: string; end: string; pop: number; adSlots?: number }) {
  return Math.round(expectedImpressions(item, booking.start, booking.end, booking.adSlots ?? 1) * (booking.pop / 100));
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

// The local calendar date as YYYY-MM-DD. It used toISOString, which is the UTC
// date: after 8 pm in Toronto "today" was already tomorrow, so a booking that
// ends today read as over and tomorrow's booking played early.
export function toDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
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
