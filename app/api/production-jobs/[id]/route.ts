import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { organizationIdsForUser } from "../../../lib/campaigns";
import { isFeatureEnabled } from "../../../lib/feature-flags";
import { productionTransitions } from "../../../lib/fulfillment-policy";

type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("static_fulfillment")) return NextResponse.json({error:"Not available"},{status:404});
  const user=await getCurrentUser();
  if(!user||!["admin","operator","institutional"].includes(user.role)) return NextResponse.json({error:"Forbidden"},{status:403});
  const body=await request.json().catch(()=>({})); const next=String(body.status??"");
  const orgs=await organizationIdsForUser(user); const id=(await context.params).id; const client=await getDb().connect();
  try {
    await client.query("BEGIN");
    const result=await client.query(`SELECT j.*,p.status placement_status,v.status creative_status,c.organization_id
      FROM production_jobs j JOIN placements p ON p.id=j.placement_id JOIN campaigns c ON c.id=p.campaign_id
      JOIN inventory i ON i.id=p.inventory_id LEFT JOIN creative_versions v ON v.id=j.creative_version_id
      WHERE j.id=$1 AND (c.organization_id=ANY($2::text[]) OR i.owner_organization_id=ANY($2::text[])) FOR UPDATE OF j,p`,[id,orgs]);
    const job=result.rows[0];
    if(!job) { await client.query("ROLLBACK"); return NextResponse.json({error:"Production job not found"},{status:404}); }
    if(job.version!==Number(body.expectedVersion)) { await client.query("ROLLBACK"); return NextResponse.json({error:"Production job changed; refresh before retrying"},{status:409}); }
    if(!productionTransitions[job.status]?.includes(next)||job.creative_status!=="approved"||!["confirmed","ready_for_fulfillment"].includes(job.placement_status)) {
      await client.query("ROLLBACK"); return NextResponse.json({error:"Production requires approved artwork, confirmed terms, and the next valid stage"},{status:422});
    }
    const now=new Date().toISOString();
    await client.query("UPDATE production_jobs SET status=$1,version=version+1,updated_at=$2 WHERE id=$3",[next,now,id]);
    if(next==="delivered") await client.query("UPDATE installation_work_orders SET status='ready',version=version+1,updated_at=$1 WHERE placement_id=$2 AND work_type='install' AND status='not_ready'",[now,job.placement_id]);
    if(next==="reprint_required") await client.query("UPDATE installation_work_orders SET status='not_ready',version=version+1,updated_at=$1 WHERE placement_id=$2 AND work_type='install' AND status NOT IN ('installed','cancelled')",[now,job.placement_id]);
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,previous_state,next_state,created_at) VALUES ($1,$2,$3,'production_job',$4,'status_changed',$5,$6,$7)",[`EVT-${randomUUID()}`,job.organization_id,user.id,id,job.status,next,now]);
    await client.query("COMMIT"); return NextResponse.json({id,status:next,version:job.version+1});
  } catch { await client.query("ROLLBACK").catch(()=>undefined); return NextResponse.json({error:"Production update failed; refresh server state"},{status:500}); }
  finally { client.release(); }
}
