import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { getDb, getOrganizationMembership } from "../../../../../lib/db";
import { hasCapability } from "../../../../../lib/capabilities";
import { organizationIdsForUser } from "../../../../../lib/campaigns";
import { isFeatureEnabled } from "../../../../../lib/feature-flags";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("agency_workspace")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({})); const reviewType = String(body.reviewType); const decision = String(body.decision); const reason = String(body.reason ?? "").trim();
  if (!["client", "operator"].includes(reviewType) || !["approved", "changes_requested", "rejected"].includes(decision)) return NextResponse.json({ error: "Choose a valid review and decision" }, { status: 422 });
  if (decision !== "approved" && !reason) return NextResponse.json({ error: "A reason is required for changes or rejection" }, { status: 422 });
  const versionId = (await context.params).id; const orgs = await organizationIdsForUser(user);
  const found = await getDb().query<{ organization_id: string; client_id: string | null; asset_id: string; version: number }>(`SELECT creative_assets.organization_id,campaigns.client_id,creative_versions.asset_id,creative_versions.version
    FROM creative_versions JOIN creative_assets ON creative_assets.id=creative_versions.asset_id
    LEFT JOIN campaigns ON campaigns.id=creative_assets.campaign_id
    WHERE creative_versions.id=$1 AND creative_assets.organization_id=ANY($2::text[])`, [versionId, orgs]);
  const version = found.rows[0]; if (!version) return NextResponse.json({ error: "Creative version not found" }, { status: 404 });
  const membership = await getOrganizationMembership(user.id, version.organization_id);
  if (reviewType === "operator" && (!["admin","operator","institutional"].includes(user.role) || !hasCapability("creative.operator_approve", { membershipRole: membership?.membership_role, legacyRole: user.role }))) return NextResponse.json({ error: "Operator review authority is required" }, { status: 403 });
  let authorizationId: string | null = null;
  if (reviewType === "client") {
    const capability = hasCapability("creative.client_approve", { membershipRole: membership?.membership_role, legacyRole: user.role });
    if (version.client_id && user.role !== "admin" && user.role !== "advertiser") {
      const auth = await getDb().query<{ id: string }>("SELECT id FROM client_authorizations WHERE client_id=$1 AND user_id=$2 AND capability='creative.client_approve' AND status='active'", [version.client_id, user.id]); authorizationId = auth.rows[0]?.id ?? null;
      if (!authorizationId) return NextResponse.json({ error: "Explicit client-review authorization is required" }, { status: 403 });
    } else if (!capability) return NextResponse.json({ error: "Client review authority is required" }, { status: 403 });
  }
  const client = await getDb().connect(); const now = new Date().toISOString();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM creative_assets WHERE id=$1 FOR UPDATE",[version.asset_id]);
    const latest = await client.query<{ version: number }>("SELECT version FROM creative_versions WHERE asset_id=$1 ORDER BY version DESC LIMIT 1 FOR SHARE", [version.asset_id]);
    if (Number(latest.rows[0]?.version) !== version.version) { await client.query("ROLLBACK"); return NextResponse.json({ error: "A newer creative version exists; review that version instead" }, { status: 409 }); }
    const duplicate = await client.query("SELECT id FROM creative_reviews WHERE creative_version_id=$1 AND review_type=$2", [versionId, reviewType]);
    if (duplicate.rows[0]) { await client.query("ROLLBACK"); return NextResponse.json({ error: "This review has already been recorded and is immutable" }, { status: 409 }); }
    const reviewId = id("REV");
    await client.query("INSERT INTO creative_reviews (id,creative_version_id,review_type,decision,reason,actor_id,authorization_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [reviewId, versionId, reviewType, decision, reason || null, user.id, authorizationId, now]);
    const reviews = await client.query<{ review_type: string; decision: string }>("SELECT review_type,decision FROM creative_reviews WHERE creative_version_id=$1", [versionId]);
    const fullyApproved = ["client", "operator"].every((kind) => reviews.rows.some((row) => row.review_type === kind && row.decision === "approved"));
    const status = fullyApproved ? "approved" : decision === "approved" ? "partially_approved" : decision;
    await client.query("UPDATE creative_versions SET status=$1 WHERE id=$2", [status, versionId]);
    if (fullyApproved) {
      const placements = await client.query<{ id: string; delivery_mode: string; start_date: string; end_date: string; specification_snapshot: { substrate?: string; finishing?: string } | null }>(`SELECT placements.id,placements.delivery_mode,placements.start_date,placements.end_date,placements.specification_snapshot
        FROM placements JOIN creative_assets ON creative_assets.campaign_id=placements.campaign_id JOIN creative_versions reviewed ON reviewed.id=$2 WHERE creative_assets.id=$1 AND placements.status<>'cancelled' AND (NOT(reviewed.preflight ? 'placementIds') OR reviewed.preflight->'placementIds' ? placements.id)`, [version.asset_id,versionId]);
      for (const placement of placements.rows) {
        await client.query("INSERT INTO creative_assignments (placement_id,creative_version_id,assigned_by,created_at) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [placement.id, versionId, user.id, now]);
        if (placement.delivery_mode === "static") {
          const jobId = id("PRD"); const orderId = id("IWO");
          await client.query(`INSERT INTO production_jobs (id,placement_id,creative_version_id,substrate,finishing,target_completion,status,retention_until,created_at,updated_at)
            VALUES ($1,$2,$3,$4,$5,$6,'ready',$7,$8,$8) ON CONFLICT(placement_id) DO UPDATE SET creative_version_id=EXCLUDED.creative_version_id,version=production_jobs.version+1,updated_at=EXCLUDED.updated_at WHERE production_jobs.status IN ('not_ready','ready','reprint_required')`, [jobId, placement.id, versionId, placement.specification_snapshot?.substrate ?? null, placement.specification_snapshot?.finishing ?? null, placement.start_date, retention(now), now]);
          await client.query(`INSERT INTO installation_work_orders (id,placement_id,work_type,status,planned_at,retention_until,created_at,updated_at)
            SELECT $1,$2,'install','not_ready',$3,$4,$5,$5 WHERE NOT EXISTS (SELECT 1 FROM installation_work_orders WHERE placement_id=$2 AND work_type='install')`, [orderId, placement.id, placement.start_date, retention(now), now]);
          await client.query(`INSERT INTO installation_work_orders (id,placement_id,work_type,status,planned_at,retention_until,created_at,updated_at)
            SELECT $1,$2,'removal','scheduled',$3,$4,$5,$5 WHERE NOT EXISTS (SELECT 1 FROM installation_work_orders WHERE placement_id=$2 AND work_type='removal')`, [id("IWO"), placement.id, placement.end_date, retention(now), now]);
        }
      }
    }
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,next_state,metadata,created_at) VALUES ($1,$2,$3,'creative_version',$4,$5,$6,$7::jsonb,$8)", [id("EVT"), version.organization_id, user.id, versionId, `${reviewType}_reviewed`, status, JSON.stringify({ reviewId, decision, reason: reason || undefined }), now]);
    await client.query("COMMIT"); return NextResponse.json({ reviewId, versionId, status });
  } catch { await client.query("ROLLBACK").catch(() => undefined); return NextResponse.json({ error: "Review could not be recorded" }, { status: 500 }); } finally { client.release(); }
}
function id(prefix: string) { return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`; }
function retention(value: string) { const date = new Date(value); date.setUTCFullYear(date.getUTCFullYear() + 7); return date.toISOString(); }
