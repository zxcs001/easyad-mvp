import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Booking } from "../../data";
import { canBuyAds, getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { createBookingRecord, getInventory, listBookings, listBookingsCreatedBy, listBookingsForInstitution } from "../../lib/db";
import { estimateSpend, exceedsLoopCapacity } from "../../utils";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const institutionId = getInstitutionScope(user);
  if (user.role === "operator" && !institutionId) return NextResponse.json({ error: "Operator must belong to an institution" }, { status: 403 });
  const bookings = user.role === "advertiser" ? await listBookingsCreatedBy(user.id) : institutionId ? await listBookingsForInstitution(institutionId) : await listBookings();
  return NextResponse.json({ bookings });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canBuyAds(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const inventoryId = String(body.inventoryId ?? "");
  const item = await getInventory(inventoryId);
  if (!item) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });

  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  if (!start || !end) return NextResponse.json({ error: "Start and end dates are required" }, { status: 400 });
  const adSlots = cleanAdSlots(body.adSlots);

  if (exceedsLoopCapacity(item, await listBookings(), start, end, adSlots)) {
    return NextResponse.json({ error: "Device loop capacity is full for those dates" }, { status: 409 });
  }

  const booking: Booking = {
    id: `BK-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    advertiser: user.role === "advertiser" ? user.name : String(body.advertiser ?? user.name ?? "Advertiser"),
    inventoryId,
    campaign: String(body.campaign ?? "Launch Campaign"),
    start,
    end,
    adSlots,
    creativeStatus: "pending review",
    status: "pending approval",
    spend: estimateSpend(item, start, end, adSlots),
    paid: false,
    pop: 0,
  };

  return NextResponse.json({ booking: await createBookingRecord(booking, user.id) }, { status: 201 });
}

function cleanAdSlots(value: unknown) {
  const parsed = Number(value);
  return Math.min(100, Math.max(1, Math.round(Number.isFinite(parsed) ? parsed : 1)));
}
