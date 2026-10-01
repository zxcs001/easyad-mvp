import { isValidAvailabilityDate } from "./inventory-availability";
import { reserveCampaign, quoteDigitalAllocations, ScheduleError } from "./digital-schedule";
import { createHash, randomUUID } from "node:crypto";
import type { DbUser } from "./db";
import { getDb, getOrganizationMembership, initializeDatabase } from "./db";
import { hasCapability } from "./capabilities";

export type CampaignSummary = {
  id: string; organizationId: string; name: string; objective: string; geography: string;
  startDate: string; endDate: string; status: string; version: number; updatedAt: string;
  placementCount: number; staticCount: number; digitalCount: number; blockerCount: number; estimatedTotal: number;
};

export async function organizationIdsForUser(user: DbUser) {
  await initializeDatabase();
  if (user.role === "admin") {
    const result = await getDb().query<{ id: string }>("SELECT id FROM organizations WHERE status='active' ORDER BY id");
    return result.rows.map((row) => row.id);
  }
  const result = await getDb().query<{ organization_id: string }>("SELECT organization_id FROM organization_memberships WHERE user_id=$1", [user.id]);
  return result.rows.map((row) => row.organization_id);
}

export async function listCampaignSummaries(user: DbUser, options: { query?: string; status?: string; sort?: "updated"|"name"|"start"; direction?: "asc"|"desc"; page?: number; pageSize?: number } = {}) {
  const organizationIds = await organizationIdsForUser(user);
  if (!organizationIds.length) return { campaigns: [], total: 0, page: 1, pageSize: 20 };
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const page = Math.max(1, options.page ?? 1);
  const query = options.query?.trim() ?? "";
  const params: unknown[] = [organizationIds, `%${query}%`, options.status?.trim() ?? "", user.role === "advertiser" ? user.id : ""];
  const where = "campaigns.organization_id = ANY($1::text[]) AND ($2 = '%%' OR campaigns.name ILIKE $2 OR campaigns.geography ILIKE $2) AND ($3='' OR campaigns.status=$3) AND ($4::text='' OR campaigns.created_by=$4)";
  const sortColumn = options.sort === "name" ? "campaigns.name" : options.sort === "start" ? "campaigns.start_date" : "campaigns.updated_at";
  const direction = options.direction === "asc" ? "ASC" : "DESC";
  const totalResult = await getDb().query<{ count: string }>(`SELECT COUNT(*) count FROM campaigns WHERE ${where}`, params);
  const result = await getDb().query<{
    id:string; organization_id:string; name:string; objective:string; geography:string; start_date:string; end_date:string;
    status:string; version:number; updated_at:string; placement_count:string; static_count:string; digital_count:string; blocker_count:string; estimated_total:string;
  }>(`SELECT campaigns.*,
    COUNT(placements.id) placement_count,
    COUNT(placements.id) FILTER (WHERE placements.delivery_mode='static') static_count,
    COUNT(placements.id) FILTER (WHERE placements.delivery_mode='digital') digital_count,
    COUNT(placements.id) FILTER (WHERE placements.status NOT IN ('cancelled','completed') AND (
      placements.status='requested' OR NOT EXISTS(SELECT 1 FROM creative_assignments a JOIN creative_versions v ON v.id=a.creative_version_id WHERE a.placement_id=placements.id AND v.status='approved' AND (placements.delivery_mode='static' OR v.mime_type IN ('image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm')))
      OR (placements.delivery_mode='static' AND placements.status<>'live'))) blocker_count,
    COALESCE((SELECT SUM(l.amount) FROM quote_line_items l JOIN quotes q ON q.id=l.quote_id WHERE q.campaign_id=campaigns.id AND q.version=(SELECT MAX(version) FROM quotes WHERE campaign_id=campaigns.id)),0) estimated_total
    FROM campaigns LEFT JOIN placements ON placements.campaign_id=campaigns.id
    WHERE ${where} GROUP BY campaigns.id ORDER BY ${sortColumn} ${direction},campaigns.id LIMIT $5 OFFSET $6`, [...params, pageSize, (page - 1) * pageSize]);
  return { campaigns: result.rows.map(mapSummary), total: Number(totalResult.rows[0]?.count ?? 0), page, pageSize };
}

export async function getCampaignDetail(user: DbUser, id: string) {
  const orgs = await organizationIdsForUser(user);
  const campaign = await getDb().query("SELECT * FROM campaigns WHERE id=$1 AND organization_id=ANY($2::text[]) AND ($3::text='' OR created_by=$3)", [id, orgs, user.role === "advertiser" ? user.id : ""]);
  if (!campaign.rows[0]) return null;
  const placements = await getDb().query(`SELECT placements.*, inventory.name inventory_name, inventory.address
    FROM placements JOIN inventory ON inventory.id=placements.inventory_id WHERE campaign_id=$1 ORDER BY placements.created_at`, [id]);
  const quotes = await getDb().query(`SELECT quotes.*, COALESCE(SUM(quote_line_items.amount),0) total
    FROM quotes LEFT JOIN quote_line_items ON quote_line_items.quote_id=quotes.id WHERE campaign_id=$1 GROUP BY quotes.id ORDER BY version DESC`, [id]);
  const lines = await getDb().query("SELECT quote_line_items.* FROM quote_line_items JOIN quotes ON quotes.id=quote_line_items.quote_id WHERE quotes.campaign_id=$1 ORDER BY category,id", [id]);
  const readiness = await getDb().query(`SELECT p.id,p.creative_due_at,COALESCE(u.name,creator.name) responsible_person,
    EXISTS(SELECT 1 FROM creative_assignments a JOIN creative_versions v ON v.id=a.creative_version_id WHERE a.placement_id=p.id AND v.status='approved' AND (p.delivery_mode='static' OR v.mime_type IN ('image/png','image/jpeg','image/gif','image/webp','video/mp4','video/webm'))) creative_ready,
    j.status production_status,w.status installation_status,w.planned_at,w.issue_code
    FROM placements p JOIN campaigns c ON c.id=p.campaign_id JOIN users creator ON creator.id=c.created_by
    LEFT JOIN design_requests d ON d.campaign_id=c.id LEFT JOIN users u ON u.id=d.assigned_to
    LEFT JOIN production_jobs j ON j.placement_id=p.id
    LEFT JOIN installation_work_orders w ON w.placement_id=p.id AND w.work_type='install' WHERE p.campaign_id=$1`,[id]);
  const assets = await getDb().query(`SELECT a.id asset_id,v.id version_id,v.version,v.status,v.original_name FROM creative_assets a JOIN LATERAL (SELECT * FROM creative_versions WHERE asset_id=a.id ORDER BY version DESC LIMIT 1) v ON TRUE WHERE a.campaign_id=$1 ORDER BY a.created_at`,[id]);
  const activity = await getDb().query("SELECT id, actor_id, subject_type, subject_id, action, previous_state, next_state, created_at FROM activity_events WHERE subject_type='campaign' AND subject_id=$1 AND organization_id=$2 ORDER BY created_at DESC, id DESC LIMIT 20", [id, campaign.rows[0].organization_id]);
  return { campaign: campaign.rows[0], placements: placements.rows, quotes: quotes.rows.map(q=>({...q,lines:lines.rows.filter(l=>l.quote_id===q.id)})), readiness:readiness.rows, assets:assets.rows, activity: activity.rows };
}

export async function createCampaignPlan(user: DbUser, input: {
  contentCategory?:string; organizationId?: string; name: string; objective: string; geography: string; startDate: string; endDate: string;
  budgetMin?: number | null; budgetMax?: number | null; targetAudience?: string; message?: string; requiredLanguages?: string[];
  creativePath: "upload" | "agency_design" | "later"; inventoryIds: string[]; clientId?: string | null; brandId?: string | null; idempotencyKey?: string | null;
}) {
  const organizationIds = await organizationIdsForUser(user);
  if(input.organizationId&&!organizationIds.includes(input.organizationId))throw new CampaignError(403,"Organization is outside your scope");
  if(!["upload","agency_design","later"].includes(input.creativePath))throw new CampaignError(422,"Choose a creative path");
  const organizationId = input.organizationId && organizationIds.includes(input.organizationId) ? input.organizationId : organizationIds[0];
  if (!organizationId) throw new CampaignError(403, "No authorized organization scope");
  if (!input.name.trim() || !input.objective.trim() || !isValidAvailabilityDate(input.startDate) || !isValidAvailabilityDate(input.endDate) || input.endDate < input.startDate) throw new CampaignError(422, "Complete the campaign name, objective, and valid dates");
  const inventoryIds = [...new Set(input.inventoryIds)].slice(0, 50);
  if (!inventoryIds.length) throw new CampaignError(422, "Select at least one inventory unit");
  await initializeDatabase();
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const requestHash = createHash("sha256").update(JSON.stringify({ ...input, idempotencyKey: undefined })).digest("hex");
    const scope = `campaign_create:${user.id}`;
    if (input.idempotencyKey) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${scope}:${input.idempotencyKey}`]);
      const prior = await client.query<{ request_hash: string; response_body: { campaignId?: string } }>("SELECT request_hash,response_body FROM idempotency_records WHERE scope=$1 AND idempotency_key=$2", [scope, input.idempotencyKey]);
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash) throw new CampaignError(409, "This request key was already used for different campaign data");
        await client.query("COMMIT"); return String(prior.rows[0].response_body.campaignId);
      }
    }
    if (input.clientId) {
      const related = await client.query("SELECT agency_clients.id FROM agency_clients LEFT JOIN brands ON brands.client_id=agency_clients.id WHERE agency_clients.id=$1 AND agency_clients.agency_organization_id=$2 AND ($3::text IS NULL OR brands.id=$3)", [input.clientId, organizationId, input.brandId ?? null]);
      if (!related.rows[0]) throw new CampaignError(422, "The selected client or brand is outside this agency workspace");
    }
    const inventory = await client.query<{
      id:string; name:string; price:number; delivery_mode:string; production_lead_days:number; installation_lead_days:number;
    }>("SELECT id,name,price,delivery_mode,production_lead_days,installation_lead_days FROM inventory WHERE id=ANY($1::text[]) AND approval_status='approved' AND content_visibility='public' AND advertising_opt_in=TRUE FOR SHARE", [inventoryIds]);
    if (inventory.rows.length !== inventoryIds.length) throw new CampaignError(422, "One or more inventory units are unavailable");
    const campaignId = id("CMP"); const now = new Date().toISOString();
    await client.query(`INSERT INTO campaigns (id,organization_id,client_id,brand_id,name,objective,geography,start_date,end_date,budget_min,budget_max,target_audience,message,required_languages,creative_path,status,created_by,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,'planning',$16,$17,$17)`,
      [campaignId,organizationId,input.clientId??null,input.brandId??null,input.name.trim(),input.objective.trim(),input.geography.trim(),input.startDate,input.endDate,input.budgetMin??null,input.budgetMax??null,input.targetAudience?.trim()??null,input.message?.trim()??null,JSON.stringify(input.requiredLanguages?.length?input.requiredLanguages:["en"]),input.creativePath,user.id,now]);
    await client.query("UPDATE campaigns SET content_category=$1 WHERE id=$2",[String(input.contentCategory??"general").trim().toLowerCase().slice(0,50)||"general",campaignId]);
    const quoteId = id("QTE");
    await client.query("INSERT INTO quotes (id,campaign_id,version,status,created_at) VALUES ($1,$2,1,'draft',$3)", [quoteId,campaignId,now]);
    for (const unit of inventory.rows) {
      const placementId = id("PLC");
      const days = Math.max(1, Math.ceil((Date.parse(input.endDate)-Date.parse(input.startDate))/86400000)+1);
      const media = Number(unit.price) * days;
      const production = unit.delivery_mode === "static" ? 450 : 0;
      const installation = unit.delivery_mode === "static" ? 275 : 0;
      const removal = unit.delivery_mode === "static" ? 175 : 0;
      const specs = unit.delivery_mode === "static" ? await client.query("SELECT * FROM inventory_specifications WHERE inventory_id=$1 AND status='active' ORDER BY version DESC LIMIT 1", [unit.id]) : null;
      await client.query(`INSERT INTO placements (id,campaign_id,inventory_id,delivery_mode,start_date,end_date,status,estimated_media_cost,estimated_production_cost,estimated_installation_cost,price_snapshot,specification_snapshot,creative_due_at,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$13)`,
        [placementId,campaignId,unit.id,unit.delivery_mode,input.startDate,input.endDate,media,production,installation,JSON.stringify({dailyRate:Number(unit.price),currency:"CAD",source:"operator_reported",capturedAt:now}),specs?.rows[0]?JSON.stringify(specs.rows[0]):null,input.startDate,now]);
      for (const [category, amount] of [["media",media],["production",production],["installation",installation]] as const) if (amount) await client.query("INSERT INTO quote_line_items (id,quote_id,placement_id,category,description,amount,is_estimate) VALUES ($1,$2,$3,$4,$5,$6,TRUE)", [id("QLI"),quoteId,placementId,category,`${unit.name} — ${category} estimate`,amount]);
      if (removal) await client.query("INSERT INTO quote_line_items (id,quote_id,placement_id,category,description,amount,is_estimate) VALUES ($1,$2,$3,'removal',$4,$5,TRUE)", [id("QLI"),quoteId,placementId,`${unit.name} — removal estimate`,removal]);
    }
    if (input.creativePath === "agency_design") {
      await client.query("INSERT INTO design_requests (id,campaign_id,status,due_at,brief,created_at,updated_at) VALUES ($1,$2,'draft',$3,$4::jsonb,$5,$5)", [id("DSR"),campaignId,input.startDate,JSON.stringify({objective:input.objective,message:input.message,languages:input.requiredLanguages}),now]);
      await client.query("INSERT INTO quote_line_items (id,quote_id,category,description,amount,is_estimate) VALUES ($1,$2,'design','Agency design estimate',800,TRUE)", [id("QLI"),quoteId]);
    }
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,next_state,retention_until,created_at) VALUES ($1,$2,$3,'campaign',$4,'created','planning',$5,$6)", [id("EVT"),organizationId,user.id,campaignId,retentionDate(now,7),now]);
    if (input.creativePath !== "upload") await client.query("INSERT INTO notifications (id,organization_id,user_id,type,title,body,subject_type,subject_id,created_at) VALUES ($1,$2,$3,'due_date','Creative required',$4,'campaign',$5,$6)", [id("NTF"),organizationId,user.id,`Artwork is due by ${input.startDate}; the campaign cannot launch without an approved version.`,campaignId,now]);
    if (input.idempotencyKey) await client.query("INSERT INTO idempotency_records (scope,idempotency_key,request_hash,response_status,response_body,created_at) VALUES ($1,$2,$3,201,$4::jsonb,$5)", [scope,input.idempotencyKey,requestHash,JSON.stringify({campaignId}),now]);
    await client.query("COMMIT");
    return campaignId;
  } catch (error) { await client.query("ROLLBACK").catch(()=>undefined); throw error; } finally { client.release(); }
}

export async function transitionCampaign(user: DbUser, campaignId: string, input: { action: "operator_confirm"|"accept_offline"; expectedVersion: number; note?: string }) {
  const orgs = await organizationIdsForUser(user); const client = await getDb().connect();
  try { await client.query("BEGIN");
    const found = await client.query<{organization_id:string;version:number;status:string}>("SELECT organization_id,version,status FROM campaigns WHERE id=$1 AND organization_id=ANY($2::text[]) AND ($3::text='' OR created_by=$3) FOR UPDATE",[campaignId,orgs,user.role==="advertiser"?user.id:""]);
    const campaign=found.rows[0]; if(!campaign) throw new CampaignError(404,"Campaign not found"); if(campaign.version!==input.expectedVersion) throw new CampaignError(409,"Campaign changed; refresh before retrying");
    const quote=await client.query<{id:string;status:string}>("SELECT id,status FROM quotes WHERE campaign_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE",[campaignId]); const current=quote.rows[0]; if(!current) throw new CampaignError(422,"Quote not found");
    if(!["planning","draft","proposed"].includes(campaign.status))throw new CampaignError(422,"Confirmed campaign terms cannot be changed");
    const now=new Date().toISOString(); let next=campaign.status;
    if(input.action==="operator_confirm"){ if(current.status!=="draft")throw new CampaignError(422,"Quote already confirmed"); if(!["admin","operator","institutional"].includes(user.role))throw new CampaignError(403,"Operator authority is required");await validateCampaignAvailability(client,campaignId);await quoteDigitalAllocations(client,campaignId);await client.query("UPDATE quote_line_items SET is_estimate=FALSE WHERE quote_id=$1",[current.id]);await client.query("UPDATE quotes SET status='operator_confirmed',operator_confirmed_by=$1,operator_confirmed_at=$2 WHERE id=$3",[user.id,now,current.id]); next="proposed"; }
    else { if(!["admin","advertiser"].includes(user.role))throw new CampaignError(403,"Client acceptance authority is required");if(current.status!=="operator_confirmed") throw new CampaignError(422,"Operator confirmation is required first");await reserveCampaign(client,campaignId);await validateCampaignAvailability(client,campaignId);const conflict=await client.query(`SELECT requested.inventory_id FROM placements requested JOIN placements existing ON existing.inventory_id=requested.inventory_id AND existing.id<>requested.id AND existing.delivery_mode='static' AND existing.status IN ('confirmed','ready_for_fulfillment','live') AND existing.start_date<=requested.end_date AND existing.end_date>=requested.start_date WHERE requested.campaign_id=$1 AND requested.status<>'cancelled' LIMIT 1`,[campaignId]);if(conflict.rows[0])throw new CampaignError(409,"A static face is already committed for those dates");await client.query("INSERT INTO commercial_acceptances (id,quote_id,accepted_by,accepted_at,method,note) VALUES ($1,$2,$3,$4,'offline',$5) ON CONFLICT(quote_id) DO NOTHING",[id("ACC"),current.id,user.id,now,input.note??null]); await client.query("UPDATE quotes SET status='accepted_offline' WHERE id=$1",[current.id]); await client.query("UPDATE placements SET status='confirmed',version=version+1,updated_at=$1 WHERE campaign_id=$2 AND status<>'cancelled'",[now,campaignId]); next="confirmed"; }
    await client.query("UPDATE campaigns SET status=$1,version=version+1,updated_at=$2 WHERE id=$3",[next,now,campaignId]); await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,previous_state,next_state,retention_until,created_at) VALUES ($1,$2,$3,'campaign',$4,$5,$6,$7,$8,$9)",[id("EVT"),campaign.organization_id,user.id,campaignId,input.action,campaign.status,next,retentionDate(now,7),now]); await client.query("COMMIT"); return getCampaignDetail(user,campaignId);
  } catch(error){await client.query("ROLLBACK").catch(()=>undefined);if(error instanceof ScheduleError)throw new CampaignError(409,error.message);throw error;} finally{client.release();}
}

export async function mutateCampaignPlan(user: DbUser, campaignId: string, input: { action: "update_draft"|"archive"|"add_placement"|"remove_placement"; expectedVersion: number; name?: string; objective?: string; geography?: string; startDate?: string; endDate?: string; inventoryId?: string; placementId?: string }) {
  const orgs = await organizationIdsForUser(user); const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{ organization_id:string;version:number;status:string }>("SELECT organization_id,version,status FROM campaigns WHERE id=$1 AND organization_id=ANY($2::text[]) AND ($3::text='' OR created_by=$3) FOR UPDATE", [campaignId, orgs, user.role==="advertiser"?user.id:""]);
    const campaign = found.rows[0]; if (!campaign) throw new CampaignError(404, "Campaign not found");
    if (campaign.version !== Number(input.expectedVersion)) throw new CampaignError(409, "Campaign changed; refresh before retrying");
    const membership = await getOrganizationMembership(user.id, campaign.organization_id);
    if (!hasCapability("media_plans.create", { membershipRole: membership?.membership_role, legacyRole: user.role })) throw new CampaignError(403, "Media-plan authority is required");
    if (!['planning','draft'].includes(campaign.status) && input.action !== 'archive') throw new CampaignError(422, "Only a draft media plan can be changed");
    const quote = await client.query<{id:string;status:string}>("SELECT id,status FROM quotes WHERE campaign_id=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE", [campaignId]);
    if (input.action !== "archive" && quote.rows[0]?.status !== "draft") throw new CampaignError(422, "Confirmed commercial terms cannot be edited; create a new quote revision");
    const now = new Date().toISOString(); let action = input.action;
    if (input.action === "update_draft") {
      const start = input.startDate; const end = input.endDate;
      if ((start && end && end < start) || !String(input.name ?? "").trim() || !String(input.objective ?? "").trim()) throw new CampaignError(422, "Campaign name, objective, and valid dates are required");
      await client.query("UPDATE campaigns SET name=$1,objective=$2,geography=$3,start_date=COALESCE($4,start_date),end_date=COALESCE($5,end_date),version=version+1,updated_at=$6 WHERE id=$7", [String(input.name).trim(),String(input.objective).trim(),String(input.geography??"").trim(),start??null,end??null,now,campaignId]);
      if (start && end) await client.query("UPDATE placements SET start_date=$1,end_date=$2,version=version+1,updated_at=$3 WHERE campaign_id=$4 AND status<>'cancelled'", [start,end,now,campaignId]);
      if(start&&end){const days=Math.ceil((Date.parse(end)-Date.parse(start))/86400000)+1;if(!isValidAvailabilityDate(start)||!isValidAvailabilityDate(end)||days<1)throw new CampaignError(422,"Valid dates are required");
        await client.query("UPDATE placements SET estimated_media_cost=(price_snapshot->>'dailyRate')::int*$1,creative_due_at=$2 WHERE campaign_id=$3 AND status<>'cancelled'",[days,start,campaignId]);
        await client.query("UPDATE quote_line_items l SET amount=p.estimated_media_cost FROM placements p WHERE l.placement_id=p.id AND l.quote_id=$1 AND l.category='media'",[quote.rows[0].id]);}

    } else if (input.action === "archive") {
      await client.query("UPDATE campaigns SET status='archived',version=version+1,updated_at=$1 WHERE id=$2", [now,campaignId]);
    } else if (input.action === "remove_placement") {
      const placement = await client.query<{id:string}>("UPDATE placements SET status='cancelled',version=version+1,updated_at=$1 WHERE id=$2 AND campaign_id=$3 AND status='requested' RETURNING id", [now,input.placementId,campaignId]);
      if (!placement.rows[0]) throw new CampaignError(422, "Only a requested placement can be removed");
      await client.query("DELETE FROM quote_line_items WHERE quote_id=$1 AND placement_id=$2", [quote.rows[0].id,input.placementId]);
      await client.query("UPDATE campaigns SET version=version+1,updated_at=$1 WHERE id=$2", [now,campaignId]);
    } else {
      const unit = await client.query<{id:string;name:string;price:number;delivery_mode:string}>("SELECT id,name,price,delivery_mode FROM inventory WHERE id=$1 AND approval_status='approved' FOR SHARE", [input.inventoryId]);
      if (!unit.rows[0]) throw new CampaignError(422, "Inventory unit is unavailable");
      const dates = await client.query<{start_date:string;end_date:string}>("SELECT start_date,end_date FROM campaigns WHERE id=$1", [campaignId]); const range=dates.rows[0]; const placementId=id("PLC"); const days=Math.max(1,Math.ceil((Date.parse(range.end_date)-Date.parse(range.start_date))/86400000)+1); const media=Number(unit.rows[0].price)*days; const production=unit.rows[0].delivery_mode==='static'?450:0; const installation=unit.rows[0].delivery_mode==='static'?275:0;
      const specs=unit.rows[0].delivery_mode==='static'?await client.query("SELECT * FROM inventory_specifications WHERE inventory_id=$1 AND status='active' ORDER BY version DESC LIMIT 1",[unit.rows[0].id]):null;
      await client.query("INSERT INTO placements (id,campaign_id,inventory_id,delivery_mode,start_date,end_date,status,estimated_media_cost,estimated_production_cost,estimated_installation_cost,price_snapshot,specification_snapshot,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10::jsonb,$11::jsonb,$12,$12)",[placementId,campaignId,unit.rows[0].id,unit.rows[0].delivery_mode,range.start_date,range.end_date,media,production,installation,JSON.stringify({dailyRate:Number(unit.rows[0].price),currency:'CAD',capturedAt:now}),specs?.rows[0]?JSON.stringify(specs.rows[0]):null,now]);
      for(const [category,amount] of [["media",media],["production",production],["installation",installation],["removal",unit.rows[0].delivery_mode==='static'?175:0]] as const)if(amount)await client.query("INSERT INTO quote_line_items (id,quote_id,placement_id,category,description,amount,is_estimate) VALUES ($1,$2,$3,$4,$5,$6,TRUE)",[id("QLI"),quote.rows[0].id,placementId,category,`${unit.rows[0].name} — ${category} estimate`,amount]);
      await client.query("UPDATE campaigns SET version=version+1,updated_at=$1 WHERE id=$2",[now,campaignId]);
    }
    await client.query("INSERT INTO activity_events (id,organization_id,actor_id,subject_type,subject_id,action,metadata,created_at) VALUES ($1,$2,$3,'campaign',$4,$5,$6::jsonb,$7)",[id("EVT"),campaign.organization_id,user.id,campaignId,action,JSON.stringify({placementId:input.placementId,inventoryId:input.inventoryId}),now]);
    await client.query("COMMIT"); return getCampaignDetail(user,campaignId);
  } catch(error){await client.query("ROLLBACK").catch(()=>undefined);if(error instanceof ScheduleError)throw new CampaignError(409,error.message);throw error;} finally{client.release();}
}

export class CampaignError extends Error { constructor(public status:number,message:string){super(message);} }
function id(prefix:string){return `${prefix}-${randomUUID().replace(/-/g,"").slice(0,12).toUpperCase()}`;}
function retentionDate(value:string,years:number){const date=new Date(value);date.setUTCFullYear(date.getUTCFullYear()+years);return date.toISOString();}
function mapSummary(row:any):CampaignSummary{return{id:row.id,organizationId:row.organization_id,name:row.name,objective:row.objective,geography:row.geography,startDate:row.start_date,endDate:row.end_date,status:row.status,version:Number(row.version),updatedAt:String(row.updated_at),placementCount:Number(row.placement_count),staticCount:Number(row.static_count),digitalCount:Number(row.digital_count),blockerCount:Number(row.blocker_count),estimatedTotal:Number(row.estimated_total)};}

async function validateCampaignAvailability(client: import("pg").PoolClient,campaignId:string) {
  const invalid=await client.query(`SELECT p.id FROM placements p JOIN inventory i ON i.id=p.inventory_id WHERE p.campaign_id=$1 AND p.status<>'cancelled' AND (i.approval_status<>'approved' OR NOT i.advertising_opt_in OR i.content_visibility='private' OR i.restricted_categories ? (SELECT content_category FROM campaigns WHERE id=$1) OR p.start_date<i.available_from OR p.end_date>i.available_to OR (p.delivery_mode='static' AND p.specification_snapshot IS NULL)) LIMIT 1`,[campaignId]);
  if(invalid.rows[0])throw new CampaignError(422,"Inventory dates or static specifications require a fresh plan");
}
