import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../lib/auth";
import { getDb } from "../../lib/db";
import { organizationIdsForUser } from "../../lib/campaigns";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const orgs = await organizationIdsForUser(user);
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1)); const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20)));
  const rows = await getDb().query("SELECT * FROM notifications WHERE organization_id=ANY($1::text[]) AND (user_id IS NULL OR user_id=$2) ORDER BY created_at DESC LIMIT $3 OFFSET $4", [orgs, user.id, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ notifications: rows.rows, page, pageSize });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const body = await request.json().catch(() => ({})); const orgs = await organizationIdsForUser(user);
  const result = await getDb().query("UPDATE notifications SET read_at=$1 WHERE id=$2 AND organization_id=ANY($3::text[]) AND (user_id IS NULL OR user_id=$4) RETURNING id,read_at", [new Date().toISOString(), String(body.id ?? ""), orgs, user.id]);
  return result.rows[0] ? NextResponse.json(result.rows[0]) : NextResponse.json({ error: "Notification not found" }, { status: 404 });
}
