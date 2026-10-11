import { NextResponse } from "next/server";
import { getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { listBookings, listBookingsCreatedBy, listBookingsForInstitution } from "../../lib/db";
import { responseSummaries } from "../../lib/responses";

// Response tracking for every booking the signed-in account can see, in the
// same scope as GET /api/bookings.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const institutionId = getInstitutionScope(user);
  if (user.role === "operator" && !institutionId) return NextResponse.json({ responses: [] });
  const bookings = user.role === "advertiser" ? await listBookingsCreatedBy(user.id) : institutionId ? await listBookingsForInstitution(institutionId) : await listBookings();
  const visible = bookings.filter((booking) => user.role !== "operator" || !Array.isArray(user.screenScope) || user.screenScope.includes(booking.inventoryId));
  return NextResponse.json({ responses: await responseSummaries(visible.map((booking) => booking.id)) }, { headers: { "Cache-Control": "no-store" } });
}
