import { NextRequest, NextResponse } from "next/server";
import { canManageInstitutionAlerts, getCurrentUser } from "../../../lib/auth";
import { emergencySnapshot } from "../../../lib/emergency-updates";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageInstitutionAlerts(user)) return NextResponse.json({ error: "Institution account or Super Admin access required" }, { status: 403 });
  const mode = request.nextUrl.searchParams.get("mode") ?? "all";
  if (mode !== "all" && mode !== "search") return NextResponse.json({ error: "Choose all screens or an area search." }, { status: 400 });
  try {
    const snapshot = await emergencySnapshot(user, { mode, query: request.nextUrl.searchParams.get("query") ?? "", institutionId: request.nextUrl.searchParams.get("institutionId") ?? "" });
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to find screens and delivery status. Choose an institution and a valid search, then retry." }, { status: 400 });
  }
}
