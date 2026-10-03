import {playerTiming} from "./players";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { canManageInventoryRecord,canPublishInventoryRecord } from "./auth";
import { getDb,getInventory,initializeDatabase,type DbUser } from "./db";
export class FleetError extends Error { constructor(public status:number,message:string){super(message);} }
export const fleetEnabled=()=>process.env.FEATURE_FLEET_OPERATIONS==="true";
export async function fleetAudit(actor:DbUser,targetId:string,action:string,revision:number|null=null,result="success",priority="ordinary",client:PoolClient|ReturnType<typeof getDb>=getDb(),scope:string[]=[targetId],resourceId:string=targetId) {
 await client.query("INSERT INTO fleet_audit(id,actor_id,institution_id,target_id,action,revision,result,priority,target_scope,resource_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",[`AUD-${randomUUID()}`,actor.id,actor.role==="institutional"?actor.id:actor.institutionId,targetId,action,revision,result,priority,JSON.stringify(scope),resourceId]);
}
export async function fleetSnapshot(user:DbUser){
 await initializeDatabase();
 if(!["admin","institutional","operator"].includes(user.role))throw new FleetError(403,"Fleet access is required");
 const screens=await getDb().query("SELECT * FROM inventory WHERE delivery_mode='digital' AND ($1='admin' OR institution_id=$2) ORDER BY building,department,name LIMIT 500",[user.role,user.role==="institutional"?user.id:user.institutionId]);
 const allowed=screens.rows.filter(s=>user.role!=="operator"||!Array.isArray(user.screenScope)||user.screenScope.includes(s.id));
 const ids=allowed.map(s=>s.id);
 const media=await getDb().query("SELECT id,inventory_id,title,approval_status,starts_at,ends_at,revision FROM media_resources WHERE inventory_id=ANY($1::text[]) ORDER BY created_at DESC LIMIT 500",[ids]);
 const announcements=await getDb().query("SELECT a.id,a.name,a.media_id FROM fleet_announcements a JOIN media_resources m ON m.id=a.media_id WHERE m.inventory_id=ANY($1::text[]) ORDER BY a.created_at DESC LIMIT 100",[ids]);
 const audit=await getDb().query("SELECT actor_id,target_id,action,revision,result,priority,created_at FROM fleet_audit WHERE target_id=ANY($1::text[]) OR ($2='institutional' AND institution_id=$3) ORDER BY created_at DESC LIMIT 100",[ids,user.role,user.id]);
 const alertDelivery=await getDb().query(`SELECT a.id alert_id,a.status,a.expires_at,i.id inventory_id,p.id player_id,p.last_seen_at,s.received_at,s.applied_at,s.rendered_at,s.restored_at FROM device_alerts a JOIN inventory i ON a.target_device_ids ? i.id LEFT JOIN players p ON p.inventory_id=i.id AND p.revoked_at IS NULL LEFT JOIN player_alert_state s ON s.alert_id=a.id AND s.player_id=p.id WHERE i.id=ANY($1::text[]) ORDER BY a.created_at DESC LIMIT 300`,[ids]);
 const operators=user.role==="institutional"?(await getDb().query("SELECT id,name FROM users WHERE institution_id=$1 AND role='operator' AND status='active' ORDER BY name",[user.id])).rows:[];
 return {operators,staleMs:playerTiming().staleMs,alertDelivery:alertDelivery.rows,screens:allowed,media:media.rows,announcements:announcements.rows,audit:audit.rows,owner:user.role!=="operator"};
}
export async function saveAnnouncement(user:DbUser,input:Record<string,unknown>){
 const media=await getDb().query("SELECT inventory_id FROM media_resources WHERE id=$1",[input.mediaId]);
 const screen=media.rows[0]?await getInventory(media.rows[0].inventory_id):null;
 if(!screen||!canManageInventoryRecord(user,screen))throw new FleetError(403,"Media is outside your screen scope");
 const name=String(input.name??"").trim().slice(0,100);if(!name)throw new FleetError(422,"Announcement name is required");
 const id=`ANN-${randomUUID()}`;
 await getDb().query("INSERT INTO fleet_announcements(id,institution_id,name,media_id,created_by) VALUES($1,$2,$3,$4,$5)",[id,screen.institutionId??user.id,name,input.mediaId,user.id]);
 await fleetAudit(user,screen.id,"announcement_saved",null);
 return {id};
}
export async function bulkFleet(user:DbUser,input:Record<string,unknown>){
 if(!["settings","publish","unpublish","schedule"].includes(String(input.action)))throw new FleetError(422,"Unknown fleet action");
 if(!Array.isArray(input.targets)||input.targets.length<1||input.targets.length>100)throw new FleetError(422,"Choose 1 to 100 explicit screen targets");
 const results=[];const seen=new Set<string>();
 for(const target of input.targets){const id=String(target?.id??"");if(seen.has(id))continue;seen.add(id);const client=await getDb().connect();
 try{await client.query("BEGIN");
 const screen=await getInventory(id,client);
 if(!screen||!canManageInventoryRecord(user,screen))throw new FleetError(403,"Screen is outside your scope");
 const locked=(await client.query("SELECT * FROM inventory WHERE id=$1 FOR UPDATE",[id])).rows[0];
 if(locked.fleet_version!==Number(target.version))throw new FleetError(409,"Screen changed; refresh before retrying");
 if(input.action==="settings"){
 if(!canPublishInventoryRecord(user,screen))throw new FleetError(403,"Only the screen owner can change fleet policy");
 const visibility=input.visibility??locked.content_visibility;const opt=input.advertisingOptIn??locked.advertising_opt_in;
 const reserved=Number(input.reservedSeconds??locked.reserved_seconds);const categories=input.restrictedCategories??locked.restricted_categories;
 if(!["private","public"].includes(String(visibility))||typeof opt!=="boolean"||!Number.isInteger(reserved)||reserved<0||reserved>locked.max_loop_seconds||!Array.isArray(categories)||categories.length>30||categories.some(x=>typeof x!=="string"||x.length>50))throw new FleetError(422,"Invalid fleet policy");
 if(visibility==="private"&&opt)throw new FleetError(422,"Private screens must be excluded from marketplace advertising");
 const changingPolicy=visibility!==locked.content_visibility||opt!==locked.advertising_opt_in||reserved!==locked.reserved_seconds||JSON.stringify(categories)!==JSON.stringify(locked.restricted_categories);
 if(changingPolicy){const commitments=await client.query("SELECT id FROM placements WHERE inventory_id=$1 AND status IN ('confirmed','ready_for_fulfillment','live') UNION ALL SELECT id FROM bookings WHERE inventory_id=$1 AND status IN ('approved','scheduled','live')",[id]);if(commitments.rowCount)throw new FleetError(409,"Existing commitments must finish before changing advertising or privacy policy");}
 if(visibility!==locked.content_visibility){
 const content=await client.query("SELECT id FROM media_resources WHERE inventory_id=$1 LIMIT 1",[id]);
 if(content.rowCount)throw new FleetError(409,"Use an empty screen to change visibility; existing media cannot be reclassified");
 }
 await client.query("UPDATE inventory SET building=$2,department=$3,content_visibility=$4,advertising_opt_in=$5,reserved_seconds=$6,restricted_categories=$7::jsonb WHERE id=$1",[id,String(input.building??locked.building).trim().slice(0,100),String(input.department??locked.department).trim().slice(0,100),visibility,opt,reserved,JSON.stringify(categories.map(c=>c.trim().toLowerCase()))]);
 }else if(input.action==="publish"||input.action==="unpublish"){
 if(!canPublishInventoryRecord(user,screen))throw new FleetError(403,"Owner publishing authority is required");
 await client.query("UPDATE inventory SET approval_status=$2 WHERE id=$1",[id,input.action==="publish"?"approved":"pending approval"]);
 }else if(input.action==="schedule"){
 const start=typeof input.startsAt==="string"?Date.parse(input.startsAt):NaN;const end=typeof input.endsAt==="string"?Date.parse(input.endsAt):NaN;
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new FleetError(422,"Choose a valid content start and end time");
 const source=(await client.query("SELECT * FROM media_resources WHERE id=$1",[input.mediaId])).rows[0];
 const sourceScreen=source?await getInventory(source.inventory_id,client):null;
 if(!sourceScreen||!canManageInventoryRecord(user,sourceScreen)||sourceScreen.institutionId!==screen.institutionId)throw new FleetError(403,"Announcement is outside your institution scope");
 if(sourceScreen.contentVisibility==="private"&&locked.content_visibility!=="private")throw new FleetError(403,"Private content cannot be copied to a public screen");
 const resourceId=`MED-${randomUUID()}`;
 await client.query("INSERT INTO media_resources(id,inventory_id,owner_id,title,original_name,mime_type,media_type,approval_status,size_bytes,storage_path,public_url,created_at,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",[resourceId,id,user.id,source.title,source.original_name,source.mime_type,source.media_type,canPublishInventoryRecord(user,screen)?"approved":"pending review",source.size_bytes,source.storage_path,`/media/${resourceId}`,new Date().toISOString(),new Date(start).toISOString(),new Date(end).toISOString()]);
 }else throw new FleetError(422,"Unknown fleet action");
 await client.query("UPDATE inventory SET fleet_version=fleet_version+1 WHERE id=$1",[id]);
 await fleetAudit(user,id,String(input.action),locked.fleet_version+1,"success","ordinary",client);
 await client.query("COMMIT");results.push({id,ok:true,version:locked.fleet_version+1});
 }catch(error){await client.query("ROLLBACK");const status=error instanceof FleetError?error.status:500;results.push({id,ok:false,status,error:error instanceof FleetError?error.message:"Fleet action failed"});await fleetAudit(user,id,String(input.action),null,`rejected_${status}`,"ordinary",client).catch(()=>undefined);}finally{client.release();}}
 return {selectionScope:`${seen.size} explicitly selected screens`,results,succeeded:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length};
}
export async function scopeOperator(user:DbUser,operatorId:string,screenIds:unknown){
 if(user.role!=="institutional"||!Array.isArray(screenIds)||screenIds.some(x=>typeof x!=="string")||screenIds.length>500)throw new FleetError(403,"An owner and explicit screen scope are required");
 const client=await getDb().connect();try{await client.query("BEGIN");
 const operator=(await client.query("SELECT id FROM users WHERE id=$1 AND institution_id=$2 AND role='operator' FOR UPDATE",[operatorId,user.id])).rows[0];if(!operator)throw new FleetError(404,"Operator is outside your institution");
 const screens=await client.query("SELECT id FROM inventory WHERE id=ANY($1::text[]) AND institution_id=$2",[screenIds,user.id]);if(screens.rowCount!==new Set(screenIds).size)throw new FleetError(403,"Scope contains screens outside your institution");
 await client.query("UPDATE users SET screen_scope=$2::jsonb WHERE id=$1",[operatorId,JSON.stringify([...new Set(screenIds)])]);
 await client.query("DELETE FROM sessions WHERE user_id=$1",[operatorId]);
 await fleetAudit(user,operatorId,"scope_changed_sessions_revoked",null,"success","permission",client,screenIds as string[]);await client.query("COMMIT");return {updated:true,sessionsRevoked:true};
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

export async function revokeOperator(user:DbUser,operatorId:string){
 if(user.role!=="institutional")throw new FleetError(403,"Owner access is required");
 const client=await getDb().connect();try{await client.query("BEGIN");
 const changed=await client.query("UPDATE users SET status='banned',screen_scope='[]'::jsonb WHERE id=$1 AND institution_id=$2 AND role='operator' RETURNING id",[operatorId,user.id]);if(!changed.rowCount)throw new FleetError(404,"Operator not found");
 await client.query("DELETE FROM sessions WHERE user_id=$1",[operatorId]);await fleetAudit(user,operatorId,"operator_revoked",null,"success","permission",client);await client.query("COMMIT");return {ok:true};
 }catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
}
