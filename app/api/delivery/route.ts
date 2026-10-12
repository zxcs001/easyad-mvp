import { NextResponse } from "next/server";
import { getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { listBookings, listBookingsCreatedBy, listBookingsForInstitution } from "../../lib/db";
import { bookingDeliveries } from "../../lib/delivery-report-db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const institutionId = getInstitutionScope(user);
  if (user.role === "operator" && !institutionId) return NextResponse.json({ delivery: [], asOf: new Date().toISOString() });
  try {
    const bookings = user.role === "advertiser" ? await listBookingsCreatedBy(user.id)
      : institutionId ? await listBookingsForInstitution(institutionId) : await listBookings();
    const visible = bookings.filter(b => user.role !== "operator" || !Array.isArray(user.screenScope) || user.screenScope.includes(b.inventoryId));
    const asOf = new Date();
    // Authorized historical bookings still need their screen's audience metadata
    // after it is unpublished. Only summaries leave this layer, never inventory.
    return NextResponse.json({ delivery: await bookingDeliveries(visible, undefined, asOf), asOf: asOf.toISOString() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Delivery evidence is unavailable. Retry to refresh it." }, { status: 503 });
  }
}
