import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../lib/auth";
import { getDb } from "../../lib/db";
import { organizationIdsForUser } from "../../lib/campaigns";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subjectType = request.nextUrl.searchParams.get("subjectType") ?? "";
  const subjectId = request.nextUrl.searchParams.get("subjectId") ?? "";
  if (user.role === "advertiser" && subjectType && subjectType !== "campaign") {
    return NextResponse.json({ error: "Campaign activity only" }, { status: 403 });
  }

  const orgs = await organizationIdsForUser(user);
  const requestedPage = Number(request.nextUrl.searchParams.get("page") ?? 1);
  const requestedSize = Number(request.nextUrl.searchParams.get("pageSize") ?? 20);
  const page = Number.isSafeInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
  const pageSize = Number.isSafeInteger(requestedSize) ? Math.min(user.role === "advertiser" ? 20 : 100, Math.max(1, requestedSize)) : 20;
  const offset = (page - 1) * pageSize;

  if (user.role === "advertiser") {
    const result = await getDb().query(
      `SELECT e.id, e.actor_id, e.subject_type, e.subject_id, e.action, e.previous_state, e.next_state, e.created_at
       FROM activity_events e JOIN campaigns c ON c.id=e.subject_id AND c.organization_id=e.organization_id
       WHERE e.subject_type='campaign' AND e.organization_id=ANY($1::text[])
         AND c.created_by=$2 AND ($3::text='' OR e.subject_id=$3)
       ORDER BY e.created_at DESC, e.id DESC LIMIT $4 OFFSET $5`,
      [orgs, user.id, subjectId, pageSize, offset],
    );
    return NextResponse.json({ events: result.rows, page, pageSize });
  }

  const result = await getDb().query(
    `SELECT * FROM activity_events
     WHERE organization_id=ANY($1::text[]) AND ($2::text='' OR subject_type=$2)
       AND ($3::text='' OR subject_id=$3)
     ORDER BY created_at DESC, id DESC LIMIT $4 OFFSET $5`,
    [orgs, subjectType, subjectId, pageSize, offset],
  );
  return NextResponse.json({ events: result.rows, page, pageSize });
}
