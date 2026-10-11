import { NextResponse } from "next/server";
import { canManageInstitutionAlerts, getCurrentUser } from "../auth";
import { alertReadyEnabled } from "./relay";

/** The institution an Alert Ready request acts for. Super Admin names it; an institution account is its own. */
export async function institutionScope(requested: string | null) {
  if (!alertReadyEnabled()) return { error: NextResponse.json({ error: "Alert Ready relay is switched off." }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!user || !canManageInstitutionAlerts(user)) return { error: NextResponse.json({ error: "Institution account or Super Admin access required" }, { status: 403 }) };
  const institutionId = user.role === "institutional" ? user.id : requested;
  if (!institutionId) return { error: NextResponse.json({ error: "Choose an institution." }, { status: 400 }) };
  return { institutionId, actorId: user.id };
}
