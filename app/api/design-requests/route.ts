import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../lib/auth";
import { getDb } from "../../lib/db";
import { organizationIdsForUser } from "../../lib/campaigns";
import { isFeatureEnabled } from "../../lib/feature-flags";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const orgs = await organizationIdsForUser(user);
  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1)); const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20))); const status = request.nextUrl.searchParams.get("status") ?? "";
  const result = await getDb().query(`SELECT design_requests.*,campaigns.name campaign_name,campaigns.client_id,
    EXISTS(SELECT 1 FROM creative_assets WHERE campaign_id=campaigns.id) has_artwork
    FROM design_requests JOIN campaigns ON campaigns.id=design_requests.campaign_id
    WHERE campaigns.organization_id=ANY($1::text[]) AND ($2='' OR design_requests.status=$2)
    ORDER BY design_requests.due_at NULLS LAST,design_requests.created_at LIMIT $3 OFFSET $4`, [orgs, status, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ requests: result.rows, page, pageSize });
}
