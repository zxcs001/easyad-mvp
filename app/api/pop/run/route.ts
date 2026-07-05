import { NextResponse } from "next/server";
import { Booking } from "../../../data";
import { canManageInventory, canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { createPopLog, getBooking, getInventory, listBookings } from "../../../lib/db";
import { expectedImpressions, expectedPlays } from "../../../utils";

const DELIVERABLE_STATUSES = ["approved", "scheduled", "live"];
const PLAYS_PER_TICK = 24;

// Simulates a delivery tick: records a verified proof-of-play batch for every
// deliverable campaign so reporting advances against real, persisted logs.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const visibleBookings: Booking[] = [];
  for (const booking of await listBookings()) {
    if (!DELIVERABLE_STATUSES.includes(booking.status)) continue;
    const inventory = await getInventory(booking.inventoryId);
    if (inventory && canManageInventoryRecord(user, inventory)) visibleBookings.push(booking);
  }
  const now = new Date().toISOString();
  for (const booking of visibleBookings) {
    const item = await getInventory(booking.inventoryId);
    if (!item) continue;
    const impressionsPerPlay = expectedImpressions(item, booking.start, booking.end) / Math.max(1, expectedPlays(booking.start, booking.end));
    await createPopLog({
      bookingId: booking.id,
      inventoryId: booking.inventoryId,
      plays: PLAYS_PER_TICK,
      impressions: Math.round(PLAYS_PER_TICK * impressionsPerPlay),
      status: "verified",
      source: "delivery-tick",
      playedAt: now,
    });
  }

  const bookings = await Promise.all(visibleBookings.map(async (booking) => await getBooking(booking.id) ?? booking));
  return NextResponse.json({ bookings, logged: visibleBookings.length });
}
