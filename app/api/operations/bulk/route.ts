import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { getDb } from "../../../lib/db";
import { organizationIdsForUser } from "../../../lib/campaigns";
import { isFeatureEnabled } from "../../../lib/feature-flags";

export async function POST(request: NextRequest) {
  if (!isFeatureEnabled("static_fulfillment")) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const user = await getCurrentUser(); if (!user || !["admin","operator","institutional"].includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({})); const ids:string[] = [...new Set<string>(Array.isArray(body.ids) ? body.ids.map((value:unknown)=>String(value)) : [])].slice(0,100); const action=String(body.action??"");
  if (!ids.length || !["assign","schedule","export"].includes(action)) return NextResponse.json({ error: "Choose up to 100 records and a supported bulk action" }, { status: 422 });
  const orgs=await organizationIdsForUser(user); const results:Array<{id:string;ok:boolean;error?:string;record?:unknown}>=[];
  for(const id of ids){
    const scoped=await getDb().query(`SELECT installation_work_orders.id,installation_work_orders.version,installation_work_orders.status,installation_work_orders.planned_at,inventory.name inventory_name
      FROM installation_work_orders JOIN placements ON placements.id=installation_work_orders.placement_id JOIN campaigns ON campaigns.id=placements.campaign_id JOIN inventory ON inventory.id=placements.inventory_id
      WHERE installation_work_orders.id=$1 AND (campaigns.organization_id=ANY($2::text[]) OR inventory.owner_organization_id=ANY($2::text[]))`,[id,orgs]); const row=scoped.rows[0];
    if(!row){results.push({id,ok:false,error:"Not found or outside organization scope"});continue;}
    if(action==="export"){results.push({id,ok:true,record:row});continue;}
    const expected=Number(body.expectedVersions?.[id]); if(expected!==Number(row.version)){results.push({id,ok:false,error:"Record changed; refresh before retrying"});continue;}
    const updated=action==="assign"
      ?await getDb().query("UPDATE installation_work_orders SET assigned_user_id=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 RETURNING version",[body.assignedUserId??null,new Date().toISOString(),id,expected])
      :await getDb().query("UPDATE installation_work_orders SET planned_at=$1,status='scheduled',version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 RETURNING version",[body.plannedAt??null,new Date().toISOString(),id,expected]);
    results.push(updated.rows[0]?{id,ok:true,record:updated.rows[0]}:{id,ok:false,error:"Update conflicted"});
  }
  return NextResponse.json({selectionScope:`${ids.length} explicitly selected work orders`,succeeded:results.filter(result=>result.ok).length,failed:results.filter(result=>!result.ok).length,results});
}
