import { NextResponse } from "next/server";
import { canManageInventory, getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { listBookingsForInstitution, ensureBookingTransactions, listTransactions, listTransactionsForInstitution } from "../../lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  await ensureBookingTransactions();
  const institutionId = getInstitutionScope(user);
  const bookings=institutionId?await listBookingsForInstitution(institutionId):[];
  const allowed=new Set(bookings.filter(b=>!Array.isArray(user.screenScope)||user.screenScope.includes(b.inventoryId)).map(b=>b.id));
  return NextResponse.json({ transactions: (institutionId ? await listTransactionsForInstitution(institutionId) : await listTransactions()).filter(t=>user.role!=="operator"||!!institutionId&&(!Array.isArray(user.screenScope)||allowed.has(t.bookingId))) });
}
