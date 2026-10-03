import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { organizationIdsForUser } from "../../../lib/campaigns";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { workOrderTransition } from "../../../lib/fulfillment-policy";
type Context = { params: Promise<{ id: string }> };
const exceptionActions = new Set(["weather_delay", "access_blocked", "damaged_material", "partial_completion", "reprint_required", "reschedule"]);

export async function PATCH(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("static_fulfillment")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user || !["admin", "operator", "institutional"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const action = String(body.action ?? ""); const reason = String(body.reason ?? "").trim();
  if (!["schedule", "start", "weather_delay", "access_blocked", "damaged_material", "partial_completion", "reprint_required", "reschedule", "remove"].includes(action)) return NextResponse.json({ error: "Invalid work-order action" }, { status: 422 });
  if (exceptionActions.has(action) && !reason) return NextResponse.json({ error: "A reason is required for this exception" }, { status: 422 });
  const id = (await context.params).id; const orgs = await organizationIdsForUser(user); const client = await getDb().connect(); const now = new Date().toISOString();
  try {
    await client.query("BEGIN");
    const result = await client.query<{ placement_id: string; version: number; status: string; work_type: string; organization_id: string }>(`SELECT installation_work_orders.placement_id,installation_work_orders.version,installation_work_orders.status,installation_work_orders.work_type,campaigns.organization_id
      FROM installation_work_orders JOIN placements ON placements.id=installation_work_orders.placement_id JOIN campaigns ON campaigns.id=placements.campaign_id JOIN inventory ON inventory.id=placements.inventory_id
      WHERE installation_work_orders.id=$1 AND (campaigns.organization_id=ANY($2::text[]) OR inventory.owner_organization_id=ANY($2::text[])) FOR UPDATE OF installation_work_orders`, [id, orgs]);
    const order = result.rows[0]; if (!order) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Work order not found" }, { status: 404 }); }
    if (order.version !== Number(body.expectedVersion)) { await client.query("ROLLBACK"); return NextResponse.json({ error: "Work order changed; refresh before retrying" }, { status: 409 }); }
    const next = workOrderTransition(order.status, order.work_type, action);
    if (!next || (["schedule","reschedule"].includes(action) && !Number.isFinite(Date.parse(body.plannedAt)))) { await client.query("ROLLBACK"); return NextResponse.json({error:"Invalid transition or missing schedule date"},{status:422}); }
    if (action === "remove") { const live=await client.query("SELECT id FROM placements WHERE id=$1 AND status='live' FOR UPDATE",[order.placement_id]); if(!live.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({error:"Only an installed placement can be removed"},{status:422}); } }
    if (body.assignedUserId) { const member=await client.query("SELECT user_id FROM organization_memberships WHERE user_id=$1 AND organization_id=ANY($2::text[])",[body.assignedUserId,orgs]); if(!member.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({error:"Assignee must belong to your organization"},{status:422}); } }
    await client.query("UPDATE installation_work_orders SET assigned_user_id=COALESCE($1,assigned_user_id),access_notes=COALESCE($2,access_notes) WHERE id=$3",[body.assignedUserId||null,body.accessNotes??null,id]);
    await client.query(`UPDATE installation_work_orders SET status=$1,planned_at=COALESCE($2,planned_at),issue_code=$3,result=COALESCE($4,result),completed_at=CASE WHEN $1='removed' THEN $5 ELSE completed_at END,version=version+1,updated_at=$5 WHERE id=$6`, [next, body.plannedAt ?? null, exceptionActions.has(action) ? action : null, reason || null, now, id]);
    if (exceptionActions.has(action)) await client.query("INSERT INTO placement_issues (id,placement_id,issue_type,status,detail,created_at) VALUES ($1,$2,$3,'open',$4,$5)", [uid("ISS"), order.placement_id, action, reason, now]);
    if (action === "reprint_required") await client.query("UPDATE production_jobs SET status='reprint_required',version=version+1,updated_at=$1 WHERE placement_id=$2", [now, order.placement_id]);
    if (action === "remove") await client.query("UPDATE placements SET status='completed',version=version+1,updated_at=$1 WHERE id=$2", [now, order.placement_id]);
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,previous_state,next_state,metadata,created_at) VALUES ($1,$2,$3,'work_order',$4,$5,$6,$7,$8::jsonb,$9)", [uid("EVT"), order.organization_id, user.id, id, action, order.status, next, JSON.stringify({ reason: reason || undefined, plannedAt: body.plannedAt }), now]);
    await client.query("COMMIT"); return NextResponse.json({ id, status: next, version: order.version + 1 });
  } catch { await client.query("ROLLBACK").catch(() => undefined); return NextResponse.json({ error: "Work order could not be updated" }, { status: 500 }); } finally { client.release(); }
}
function uid(prefix: string) { return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
