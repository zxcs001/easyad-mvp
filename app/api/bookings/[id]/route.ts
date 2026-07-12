import { NextRequest, NextResponse } from "next/server";
import { canManageInventory, canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { createApprovalEvent, getBooking, getInventory, updateBookingRecord, updatePendingCreativeStatuses } from "../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const current = await getBooking(id);
  if (!current) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  const inventory = await getInventory(current.inventoryId);
  if (!inventory || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "This campaign belongs to another institution" }, { status: 403 });
  const status = body.status === "approved" || body.status === "rejected" ? body.status : null;
  if (!status || !["pending approval", "creative review"].includes(current.status)) {
    return NextResponse.json({ error: "Only pending campaigns can be approved or rejected" }, { status: 400 });
  }
  const booking = await updateBookingRecord(id, {
    status,
    creativeStatus: status === "approved" ? "approved" : current.creativeStatus,
  });
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  await updatePendingCreativeStatuses(id, status === "approved" ? "approved" : "needs changes");
  const action = booking.status === "approved" ? "approved" : booking.status === "rejected" ? "rejected" : null;
  const approval = action && current.status !== booking.status
    ? await createApprovalEvent({ bookingId: id, actorId: user.id, action, previousStatus: current.status, nextStatus: booking.status })
    : null;
  return NextResponse.json({ booking, approval });
}
