import { NextResponse } from "next/server";
import { canManageInventory, getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { ensureBookingTransactions, listTransactions, listTransactionsForInstitution } from "../../lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  await ensureBookingTransactions();
  const institutionId = getInstitutionScope(user);
  return NextResponse.json({ transactions: institutionId ? await listTransactionsForInstitution(institutionId) : await listTransactions() });
}
