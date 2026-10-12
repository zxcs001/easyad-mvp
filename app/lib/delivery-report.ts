import type { Booking, InventoryItem } from "../data";
import type { Allocation } from "./digital-schedule";
import { addDays, DAYPARTS, localClock, parseDayparts } from "./booking-schedule";

export type PlaybackCounts = { completed: number; interrupted: number; failed: number; late: number };
export type DeliverySource = "authenticated_player" | "operator_declaration" | "unavailable";
export type BookingDelivery = {
  bookingId: string;
  inventoryId: string;
  digital: boolean;
  plannedPlays: number | null;
  scheduledPlaysToDate: number | null;
  player: PlaybackCounts;
  operator: { completed: number; missed: number };
  demo: { completed: number; missed: number };
  source: DeliverySource;
  estimatedViews: number | null;
  estimatedCpm: number | null;
  creatives: (PlaybackCounts & { creativeId: string })[];
};

export type DeliveryEventGroup = {
  booking_id: string;
  creative_id: string;
  event_type: string;
  late: boolean;
  count: number | string;
};
export type DeclarationGroup = { booking_id: string; provenance: "demo" | "operator_declaration"; status: string; plays: number | string };

// Older demo fixtures used "player-log" in pop_logs. That label never grants
// authenticated-player provenance. Retain their identity without rewriting history.
export function isDemoDeclaration(id: string, source: string) {
  return id.startsWith("POP-DEMO-") || id.startsWith("POP-TB-") || source === "demo-delivery-tick" || source === "demo-seed";
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function readAllocation(value: unknown): Allocation | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Allocation;
  const parts = parseDayparts(a.dayparts);
  if (!["fixed-slot-v1", "daypart-slot-v1"].includes(a.model) || !validDate(a.startDate) || !validDate(a.endDate) || a.endDate < a.startDate
    || !Number.isInteger(a.slots) || a.slots < 1 || !Number.isFinite(a.slotSeconds) || a.slotSeconds < 2
    || !Number.isFinite(a.loopSeconds) || a.loopSeconds < a.slotSeconds * a.slots || !parts
    || a.operatingHours !== "00:00-24:00"
    || (a.model === "fixed-slot-v1" ? a.timezone !== "UTC" || parts.length !== 0 : a.timezone !== "America/Toronto" || parts.length === 0)) return null;
  // Keep date iteration bounded even for malformed historical snapshots.
  if (Date.parse(a.endDate) - Date.parse(a.startDate) > 3660 * 86400000) return null;
  return { ...a, dayparts: parts };
}

function localBoundary(date: string, minute: number, timezone: string): number {
  if (minute === 1440) return localBoundary(addDays(date, 1), 0, timezone);
  const target = Date.parse(`${date}T00:00:00Z`) + minute * 60000;
  if (timezone === "UTC") return target;
  let epoch = target;
  // The supported windows end at midnight or 06:00 and later, away from
  // Toronto's ambiguous/nonexistent 01:00/02:00 DST boundary times.
  for (let i = 0; i < 3; i++) {
    const clock = localClock(epoch, timezone);
    epoch += target - (Date.parse(`${clock.date}T00:00:00Z`) + clock.minute * 60000);
  }
  return epoch;
}

/** Nominal allocation, not a claim about readiness, overrides or panel visibility.
 * One completed report covers a reserved interval, including contiguous slots.
 * Match the player's local-date semantics for overnight's two parts of each day.
 */
export function scheduledAllocation(value: unknown, asOf = Date.now()) {
  const a = readAllocation(value);
  if (!a || !Number.isFinite(asOf)) return null;
  const ranges = !a.dayparts.length ? [[0, 1440]] : DAYPARTS.filter(p => a.dayparts.includes(p.id)).flatMap(p =>
    p.endMinute > p.startMinute ? [[p.startMinute, p.endMinute]] : [[0, p.endMinute], [p.startMinute, 1440]]);
  let totalSeconds = 0, elapsedSeconds = 0;
  for (let date = a.startDate; date <= a.endDate; date = addDays(date, 1)) {
    for (const [startMinute, endMinute] of ranges) {
      const start = localBoundary(date, startMinute, a.timezone), end = localBoundary(date, endMinute, a.timezone);
      totalSeconds += (end - start) / 1000;
      elapsedSeconds += Math.max(0, Math.min(asOf, end) - start) / 1000;
    }
  }
  return { allocation: a, totalSeconds, plannedPlays: Math.floor(totalSeconds / a.loopSeconds), scheduledPlaysToDate: Math.floor(elapsedSeconds / a.loopSeconds) };
}

const emptyCounts = (): PlaybackCounts => ({ completed: 0, interrupted: 0, failed: 0, late: 0 });
const count = (value: number | string) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);

export function bookingDelivery(booking: Booking, screen: InventoryItem | undefined, snapshot: unknown,
  events: DeliveryEventGroup[], declarations: DeclarationGroup[], asOf = Date.now()): BookingDelivery {
  const digital = screen?.deliveryMode === "digital" || (screen?.deliveryMode === undefined && screen?.format === "digital");
  const schedule = digital ? scheduledAllocation(snapshot, asOf) : null;
  const player = emptyCounts(), operator = { completed: 0, missed: 0 }, demo = { completed: 0, missed: 0 };
  const creatives = new Map<string, PlaybackCounts>();
  for (const row of events.filter(e => e.booking_id === booking.id)) {
    const counts = creatives.get(row.creative_id) ?? emptyCounts();
    const key = row.event_type === "delivered" ? "completed" : row.event_type === "partial" ? "interrupted" : "failed";
    counts[key] += count(row.count);
    if (row.late) counts.late += count(row.count);
    creatives.set(row.creative_id, counts);
    player[key] += count(row.count);
    if (row.late) player.late += count(row.count);
  }
  for (const row of declarations.filter(d => d.booking_id === booking.id)) {
    const target = row.provenance === "demo" ? demo : operator;
    target[row.status === "verified" ? "completed" : "missed"] += count(row.plays);
  }
  const hasPlayer = player.completed + player.interrupted + player.failed > 0;
  const hasOperator = operator.completed + operator.missed > 0;
  const source: DeliverySource = digital && hasPlayer ? "authenticated_player" : digital && hasOperator ? "operator_declaration" : "unavailable";
  // Never sum declarations with player evidence: both may describe the same plays.
  // Missing snapshots/evidence/audience sources remain unavailable. booking.pop
  // and demo counts cannot establish actual playback or measured audience views.
  const completed = source === "authenticated_player" ? player.completed : operator.completed;
  const hasAudience = screen && Number.isFinite(screen.impressions) && screen.impressions >= 0 && Boolean(screen.measurementSource?.trim());
  const a = schedule?.allocation;
  const estimatedViews = source !== "unavailable" && schedule && schedule.plannedPlays > 0 && hasAudience && a
    ? screen.impressions * (schedule.totalSeconds / 86400) * (a.slotSeconds * a.slots / a.loopSeconds)
      * Math.min(1, completed / schedule.plannedPlays) : null;
  return {
    bookingId: booking.id, inventoryId: booking.inventoryId, digital,
    plannedPlays: schedule?.plannedPlays ?? null, scheduledPlaysToDate: schedule?.scheduledPlaysToDate ?? null,
    player, operator, demo, source, estimatedViews,
    estimatedCpm: estimatedViews !== null && estimatedViews > 0 ? booking.spend / estimatedViews * 1000 : null,
    creatives: [...creatives].map(([creativeId, counts]) => ({ creativeId, ...counts })),
  };
}
