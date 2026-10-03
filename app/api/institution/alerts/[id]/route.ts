import {fleetEnabled,fleetAudit} from "../../../../lib/fleet";
import { NextRequest, NextResponse } from "next/server";
import { canManageInstitutionAlerts, getCurrentUser } from "../../../../lib/auth";
import { endDeviceAlert, getDeviceAlert } from "../../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInstitutionAlerts(user)) return NextResponse.json({ error: "Institution account or Super Admin access required" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if (body.action !== "end") return NextResponse.json({ error: "Choose a valid alert action" }, { status: 400 });

  const { id } = await context.params;
  const alert = await getDeviceAlert(id);
  if (!alert) return NextResponse.json({ error: "Emergency override not found" }, { status: 404 });
  if (user.role === "institutional" && alert.institutionId !== user.id) {
    return NextResponse.json({ error: "This override belongs to another institution" }, { status: 403 });
  }
  if (alert.status === "ended") return NextResponse.json({ alert });

  const ended = await endDeviceAlert(id,user.id);
  return NextResponse.json({ alert: ended ?? alert });
}
