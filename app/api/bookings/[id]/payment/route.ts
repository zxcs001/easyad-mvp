import { NextRequest, NextResponse } from "next/server";
import { Transaction } from "../../../../data";
import { canManageInventory, canManageInventoryRecord, getCurrentUser } from "../../../../lib/auth";
import { getBooking, getInventory, getTransactionByBooking, updateBookingRecord, upsertTransaction } from "../../../../lib/db";
import { processCharge, processRefund } from "../../../../lib/payments";
import { splitRevenue } from "../../../../utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Settle or refund an invoice through the (mock) payment gateway and persist
// the resulting transaction plus the booking's paid flag.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const booking = await getBooking(id);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  const inventory = await getInventory(booking.inventoryId);
  if (!inventory || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "This campaign belongs to another institution" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action === "refund" ? "refund" : "pay";
  const split = splitRevenue(booking.spend);
  const existing = await getTransactionByBooking(id);
  const now = new Date().toISOString();

  if (action === "refund") {
    const refund = processRefund({ gatewayRef: existing?.gatewayRef ?? null });
    const transaction: Transaction = {
      id: existing?.id ?? `TX-${id.replace(/^BK-/, "")}`,
      bookingId: id,
      advertiser: booking.advertiser,
      amount: split.gross,
      platformFee: split.platformFee,
      operatorPayout: split.operatorPayout,
      status: "refunded",
      method: "refund",
      gatewayRef: refund.gatewayRef,
      createdAt: existing?.createdAt ?? now,
      paidAt: null,
    };
    const saved = await upsertTransaction(transaction);
    const updated = await updateBookingRecord(id, { paid: false });
    return NextResponse.json({ transaction: saved, booking: updated });
  }

  const charge = processCharge({ amount: booking.spend, method: typeof body.method === "string" ? body.method : "card" });
  if (!charge.ok) {
    const transaction: Transaction = {
      id: existing?.id ?? `TX-${id.replace(/^BK-/, "")}`,
      bookingId: id,
      advertiser: booking.advertiser,
      amount: split.gross,
      platformFee: split.platformFee,
      operatorPayout: split.operatorPayout,
      status: "failed",
      method: charge.method,
      gatewayRef: null,
      createdAt: existing?.createdAt ?? now,
      paidAt: null,
    };
    await upsertTransaction(transaction);
    return NextResponse.json({ error: charge.declineReason ?? "Payment failed" }, { status: 402 });
  }

  const transaction: Transaction = {
    id: existing?.id ?? `TX-${id.replace(/^BK-/, "")}`,
    bookingId: id,
    advertiser: booking.advertiser,
    amount: split.gross,
    platformFee: split.platformFee,
    operatorPayout: split.operatorPayout,
    status: "paid",
    method: charge.method,
    gatewayRef: charge.gatewayRef,
    createdAt: existing?.createdAt ?? now,
    paidAt: charge.processedAt,
  };
  const saved = await upsertTransaction(transaction);
  const updated = await updateBookingRecord(id, { paid: true });
  return NextResponse.json({ transaction: saved, booking: updated });
}
