import { NextRequest, NextResponse } from "next/server";
import { canSubmitCreative, getCurrentUser } from "../../../../lib/auth";
import { getBooking, getBookingOwnerId, updateBookingRecord } from "../../../../lib/db";
import { ScheduleError } from "../../../../lib/digital-schedule";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to cancel your campaign." }, { status: 401 });
  const { id } = await context.params;
  const current = await getBooking(id);
  if (!current) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!canSubmitCreative(user, await getBookingOwnerId(id))) {
    return NextResponse.json({ error: "You can only cancel campaigns you own." }, { status: 403 });
  }
  if (current.status === "cancelled") return NextResponse.json({ booking: current });
  if (current.paid || !["pending approval", "creative review"].includes(current.status)) {
    return NextResponse.json({ error: "Only unpaid pending campaigns can be cancelled." }, { status: 409 });
  }
  try {
    const booking = await updateBookingRecord(id, { status: "cancelled" });
    if (!booking) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    return NextResponse.json({ booking });
  } catch (error) {
    return NextResponse.json({ error: error instanceof ScheduleError ? error.message : "Could not cancel this campaign. Your campaign is still here; please retry." }, { status: error instanceof ScheduleError ? 409 : 500 });
  }
}
