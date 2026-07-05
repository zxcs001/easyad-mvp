import { NextRequest, NextResponse } from "next/server";
import { canManageInventory, canManageInventoryRecord, canReadBooking, getCurrentUser } from "../../../../lib/auth";
import { createPopLog, getBooking, getBookingOwnerId, getInventory, listPopLogs } from "../../../../lib/db";
import { expectedImpressions, expectedPlays } from "../../../../utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const booking = await getBooking(id);
  const inventory = booking ? await getInventory(booking.inventoryId) : null;
  if (!booking || !canReadBooking(user, await getBookingOwnerId(id), inventory)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ logs: await listPopLogs(id) });
}

// Player / device check-in: records a verified proof-of-play batch and
// recomputes the booking's delivery completion.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const booking = await getBooking(id);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  const item = await getInventory(booking.inventoryId);
  if (!item) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (!canManageInventoryRecord(user, item)) return NextResponse.json({ error: "This campaign belongs to another institution" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const plays = clampPlays(body.plays);
  const status = body.status === "missed" ? "missed" : "verified";
  const impressionsPerPlay = expectedImpressions(item, booking.start, booking.end) / Math.max(1, expectedPlays(booking.start, booking.end));
  const impressions = status === "verified" ? Math.round(plays * impressionsPerPlay) : 0;

  const log = await createPopLog({
    bookingId: id,
    inventoryId: booking.inventoryId,
    plays,
    impressions,
    status,
    source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : "player-checkin",
    playedAt: new Date().toISOString(),
  });

  return NextResponse.json({ log, booking: await getBooking(id) }, { status: 201 });
}

function clampPlays(value: unknown) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(1000, parsed));
}
