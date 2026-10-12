import { expect, test } from "vitest";
import { bookingDelivery, isDemoDeclaration, scheduledAllocation } from "../app/lib/delivery-report";
import { deliveryAllocation as allocation, deliveryBooking as booking, deliveryScreen as screen } from "./helpers/delivery-fixtures";

test("nominal counts stop at asOf and include only reserved dayparts", () => {
  expect(scheduledAllocation(allocation, Date.parse("2026-09-30"))).toMatchObject({ plannedPlays: 28800, scheduledPlaysToDate: 0 });
  expect(scheduledAllocation(allocation, Date.parse("2026-10-01T12:00Z"))).toMatchObject({ plannedPlays: 28800, scheduledPlaysToDate: 1440 });
  const morning = { ...allocation, model: "daypart-slot-v1", startDate: "2026-10-01", endDate: "2026-10-01", timezone: "America/Toronto", dayparts: ["morning"] };
  expect(scheduledAllocation(morning, Date.parse("2026-10-01T09:00Z"))).toMatchObject({ plannedPlays: 480, scheduledPlaysToDate: 0 });
  expect(scheduledAllocation(morning, Date.parse("2026-10-01T12:00Z"))).toMatchObject({ plannedPlays: 480, scheduledPlaysToDate: 240 });
});

test("overnight uses each local date and accounts for both DST transitions", () => {
  const overnight = (date: string) => ({ ...allocation, model: "daypart-slot-v1", timezone: "America/Toronto", startDate: date, endDate: date, dayparts: ["overnight"] });
  expect(scheduledAllocation(overnight("2026-03-08"), Date.parse("2026-03-10"))).toMatchObject({ totalSeconds: 21600, plannedPlays: 720, scheduledPlaysToDate: 720 });
  expect(scheduledAllocation(overnight("2026-11-01"), Date.parse("2026-11-03"))).toMatchObject({ totalSeconds: 28800, plannedPlays: 960 });
  expect(scheduledAllocation(overnight("2026-10-01"), Date.parse("2026-10-01T10:00Z"))).toMatchObject({ plannedPlays: 840, scheduledPlaysToDate: 720 });
});

test("invalid or missing snapshots are unknown rather than zero", () => {
  for (const value of [null, {}, { ...allocation, loopSeconds: 0 }, { ...allocation, startDate: "2026-02-30" }, { ...allocation, timezone: "Invalid" }, { ...allocation, dayparts: ["bogus"] }]) expect(scheduledAllocation(value)).toBeNull();
  expect(bookingDelivery(booking, screen, null, [], [])).toMatchObject({ plannedPlays: null, scheduledPlaysToDate: null, estimatedViews: null, estimatedCpm: null, source: "unavailable" });
});

test("player outcomes and creatives stay separate from declarations and demo; late overlaps outcomes", () => {
  const row = { booking_id: booking.id, creative_id: "art-1", event_type: "delivered", count: "288", late: true };
  const report = bookingDelivery(booking, screen, allocation, [row, { ...row, creative_id: "art-2", event_type: "partial", count: 2 }, { ...row, event_type: "unverifiable", count: 1, late: false }, { ...row, booking_id: "other", count: 1000 }], [
    { booking_id: booking.id, provenance: "operator_declaration", status: "verified", plays: 1000 },
    { booking_id: booking.id, provenance: "demo", status: "verified", plays: 5000 },
  ], Date.parse("2026-10-11"));
  expect(report).toMatchObject({ source: "authenticated_player", player: { completed: 288, interrupted: 2, failed: 1, late: 290 }, operator: { completed: 1000, missed: 0 }, demo: { completed: 5000, missed: 0 } });
  expect(report.estimatedViews).toBeCloseTo(280);
  expect(report.estimatedCpm).toBeCloseTo(1071.42857);
  expect(report.creatives).toHaveLength(2);
});

test("demo-only records and missing audience source cannot create delivery estimates", () => {
  const demo = [{ booking_id: booking.id, provenance: "demo" as const, status: "verified", plays: 28000 }];
  expect(bookingDelivery({ ...booking, pop: 100 }, screen, allocation, [], demo)).toMatchObject({ source: "unavailable", estimatedViews: null });
  const declaration = [{ ...demo[0], provenance: "operator_declaration" as const, plays: 100 }];
  expect(bookingDelivery(booking, screen, allocation, [], declaration).source).toBe("operator_declaration");
  expect(bookingDelivery(booking, screen, allocation, [], declaration).estimatedViews).toBeCloseTo(97.22222);
  expect(bookingDelivery(booking, { ...screen, measurementSource: "" }, allocation, [], declaration).estimatedViews).toBeNull();
  expect(bookingDelivery(booking, { ...screen, deliveryMode: "static" }, allocation, [], declaration)).toMatchObject({ digital: false, source: "unavailable", plannedPlays: null, estimatedViews: null });
});

test("CPM uses the unrounded estimate so a small positive audience is not a zero denominator", () => {
  const report = bookingDelivery(booking, { ...screen, impressions: 1000 }, allocation, [], [{ booking_id: booking.id, provenance: "operator_declaration", status: "verified", plays: 10 }]);
  expect(report.estimatedViews).toBeCloseTo(0.69444);
  expect(report.estimatedCpm).toBeCloseTo(432000);
});

test("contiguous reserved slots represent one playback interval per loop", () => {
  expect(scheduledAllocation({ ...allocation, slots: 2 }, Date.parse("2026-10-11"))?.plannedPlays).toBe(28800);
  expect(isDemoDeclaration("POP-TB-0032", "player-log")).toBe(true);
  expect(isDemoDeclaration("POP-DEMO-1", "player-log")).toBe(true);
  expect(isDemoDeclaration("POP-real", "player-log")).toBe(false);
});
