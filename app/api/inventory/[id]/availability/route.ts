import { NextRequest, NextResponse } from "next/server";
import { getPublishedInventory, listInventoryCommitments } from "../../../../lib/db";
import { isDigitalInventory } from "../../../../lib/inventory-delivery";
import { isRateLimited } from "../../../../lib/rate-limit";
import { addDays, SCHEDULE_TIME_ZONE, type ScreenAvailability } from "../../../../lib/booking-schedule";

type RouteContext = {
  params: Promise<{ id: string }>;
};


// The booking calendar for one marketplace screen. It returns loop time that
// is already confirmed, with dates and time-of-day slots only: no advertiser,
// campaign or price. Pending requests hold no time, so they are not listed.
export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (isRateLimited(request, "availability", id, 120, 60 * 1000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  }
  const item = await getPublishedInventory(id);
  if (!item || item.advertisingOptIn === false) {
    return NextResponse.json({ error: "This screen is not open to bookings." }, { status: 404 });
  }
  const digital = isDigitalInventory(item);
  const today = new Date().toISOString().slice(0, 10);
  const commitments = digital ? await listInventoryCommitments(item.id, addDays(today, -1)) : [];
  const body: ScreenAvailability = {
    inventoryId: item.id,
    deliveryMode: digital ? "digital" : "static",
    timeZone: SCHEDULE_TIME_ZONE,
    slotSeconds: item.imageInterval,
    loopSeconds: item.maxLoopSeconds,
    capacitySeconds: Math.max(0, item.maxLoopSeconds - Number(item.reservedSeconds ?? 0)),
    availableFrom: item.availableFrom,
    availableTo: item.availableTo,
    commitments,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
