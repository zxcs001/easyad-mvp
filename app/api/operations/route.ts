import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../lib/auth";
import { getDb } from "../../lib/db";
import { organizationIdsForUser } from "../../lib/campaigns";
import { isFeatureEnabled } from "../../lib/feature-flags";

export async function GET(request: NextRequest) {
  if (!isFeatureEnabled("static_fulfillment")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user || !["admin", "operator", "institutional"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const orgs = await organizationIdsForUser(user); const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1)); const pageSize = Math.min(50, Math.max(1, Number(request.nextUrl.searchParams.get("pageSize") ?? 20)));
  const jobs = await getDb().query(`SELECT production_jobs.*,inventory.name inventory_name,campaigns.name campaign_name,placements.specification_snapshot,
    creative_versions.status creative_status FROM production_jobs JOIN placements ON placements.id=production_jobs.placement_id JOIN campaigns ON campaigns.id=placements.campaign_id JOIN inventory ON inventory.id=placements.inventory_id LEFT JOIN creative_versions ON creative_versions.id=production_jobs.creative_version_id
    WHERE (campaigns.organization_id=ANY($1::text[]) OR inventory.owner_organization_id=ANY($1::text[])) ORDER BY production_jobs.target_completion NULLS LAST LIMIT $2 OFFSET $3`, [orgs, pageSize, (page - 1) * pageSize]);
  const workOrders = await getDb().query(`SELECT installation_work_orders.id,installation_work_orders.placement_id,installation_work_orders.work_type,installation_work_orders.status,installation_work_orders.planned_at,installation_work_orders.removal_at,installation_work_orders.access_notes,installation_work_orders.assigned_user_id,installation_work_orders.completed_at,installation_work_orders.issue_code,installation_work_orders.result,installation_work_orders.version,inventory.name inventory_name,campaigns.name campaign_name
    FROM installation_work_orders JOIN placements ON placements.id=installation_work_orders.placement_id JOIN campaigns ON campaigns.id=placements.campaign_id JOIN inventory ON inventory.id=placements.inventory_id
    WHERE (campaigns.organization_id=ANY($1::text[]) OR inventory.owner_organization_id=ANY($1::text[])) ORDER BY installation_work_orders.planned_at NULLS LAST LIMIT $2 OFFSET $3`, [orgs, pageSize, (page - 1) * pageSize]);
  return NextResponse.json({ jobs: jobs.rows, workOrders: workOrders.rows, page, pageSize });
}
