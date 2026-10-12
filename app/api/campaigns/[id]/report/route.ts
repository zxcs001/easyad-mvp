import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { getCampaignDetail } from "../../../../lib/campaigns";
import { getDb } from "../../../../lib/db";
import { isFeatureEnabled } from "../../../../lib/feature-flags";
import { scheduledAllocation } from "../../../../lib/delivery-report";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  if (!isFeatureEnabled("campaign_model_v2")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await context.params).id;
  const detail = await getCampaignDetail(user, id);
  if (!detail) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const asOf = new Date();
  const proof = await getDb().query(`SELECT proof_records.id,proof_records.placement_id,proof_records.proof_type,proof_records.evidence,proof_records.certified_at
    FROM proof_records JOIN placements ON placements.id=proof_records.placement_id WHERE placements.campaign_id=$1 AND proof_records.client_shareable=TRUE`, [id]);
  const delivery = await getDb().query(`SELECT placement_id,creative_version_id,event_type,provenance,late,COUNT(*) count,MIN(occurred_at) first_event,MAX(occurred_at) last_event
    FROM digital_delivery_events JOIN placements ON placements.id=digital_delivery_events.placement_id
    WHERE placements.campaign_id=$1 AND occurred_at<=$2 GROUP BY placement_id,creative_version_id,event_type,provenance,late`, [id, asOf.toISOString()]);
  const issues = await getDb().query("SELECT placement_id,issue_type,status,detail,created_at,resolved_at FROM placement_issues WHERE placement_id=ANY($1::text[])", [detail.placements.map(p => p.id)]);
  const audience = await getDb().query(`SELECT placements.id placement_id,inventory.impressions value,'operator_reported' label,
    COALESCE(inventory.measurement_source,'Operator inventory record') source,inventory.measurement_updated_at freshness
    FROM placements JOIN inventory ON inventory.id=placements.inventory_id WHERE placements.campaign_id=$1`, [id]);
  const reconciliation = detail.placements.filter(p => p.delivery_mode === "digital").map(p => {
    const schedule = ["confirmed", "ready_for_fulfillment", "live", "completed"].includes(p.status)
      ? scheduledAllocation(p.schedule_snapshot, asOf.valueOf()) : null;
    const reported = (type: string) => delivery.rows.filter(r => r.placement_id === p.id && r.provenance === "authenticated_player" && r.event_type === type).reduce((sum, r) => sum + Number(r.count), 0);
    const completed = reported("delivered");
    return {
      placementId: p.id, plannedPlays: schedule?.plannedPlays ?? null,
      nominalScheduledPlays: schedule?.scheduledPlaysToDate ?? null, playerReportedPlays: completed,
      interruptedPlays: reported("partial"), failedReports: reported("unverifiable"),
      unreported: schedule === null ? null : Math.max(0, schedule.scheduledPlaysToDate - completed),
      classification: "Plays without a completed report are unknown delivery, not proven missed. Nominal allocation accounts for dates, dayparts and timezone, but not creative readiness, overrides or downtime.",
    };
  });
  return NextResponse.json({
    campaign: detail.campaign, readiness: detail.readiness, placements: detail.placements, estimates: detail.quotes,
    proofOfPosting: proof.rows, proofOfPlay: delivery.rows, reconciliation, issues: issues.rows, audience: audience.rows,
    asOf: asOf.toISOString(), note: "Proof of posting and proof of play are distinct evidence and are not combined into one delivery percentage.",
  }, { headers: { "Cache-Control": "private, no-store" } });
}
