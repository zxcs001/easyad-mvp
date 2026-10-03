import { afterAll, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const auth=vi.hoisted(()=>({user:null as any}));
vi.mock("../app/lib/auth",()=>({getCurrentUser:async()=>auth.user}));
const postgresUrl=process.env.TEST_DATABASE_URL;
test.skipIf(!postgresUrl)("P3 mixed pilot: exact approvals, independent delay, ordered production, private proof and concurrent completion",async()=>{
 process.env.DATABASE_URL=postgresUrl;process.env.FEATURE_CAMPAIGN_MODEL_V2="true";process.env.FEATURE_STATIC_FULFILLMENT="true";process.env.FEATURE_AGENCY_WORKSPACE="true";
 const db=await import("../app/lib/db");const c=await import("../app/lib/campaigns");await db.resetDatabaseForTests();
 const admin=await db.createUser("Pilot operator","p3-admin@example.test","hash","admin");const advertiser=await db.createUser("Pilot client","p3-client@example.test","hash","advertiser");const other=await db.createUser("Other organization","p3-other@example.test","hash","advertiser");
 const base={operator:"Pilot",x:10,y:20,address:"Thunder Bay",price:100,impressions:1000,traffic:900,income:70000,audience:"Adults",competitor:"Low" as const,occupancy:0,imageInterval:6,maxLoopSeconds:120,availableFrom:"2026-09-01",availableTo:"2027-09-01"};
 for(const id of ["P3-S","P3-D1","P3-D2"])await db.createInventory({...base,id,name:id,format:id==="P3-S"?"static":"digital",deliveryMode:id==="P3-S"?"static":"digital",productType:id==="P3-S"?"poster":"digital_screen"},admin.id);
 await db.createInventorySpecification("P3-S",{trimWidthMm:100,trimHeightMm:100,visibleWidthMm:90,visibleHeightMm:90,bleedMm:5,safeAreaMm:5,scaleRatio:"1:1",minimumDpi:150,colourSpace:"CMYK",acceptedFileTypes:["png"],maximumFileBytes:100000,substrate:"paper",finishing:"none",templateUrl:"",notes:"Pilot"},admin.id);
 const cid=await c.createCampaignPlan(advertiser,{name:"P3 mixed",objective:"Pilot",geography:"Thunder Bay",startDate:"2026-10-01",endDate:"2026-10-07",creativePath:"later",inventoryIds:["P3-S","P3-D1","P3-D2"]});
 await c.transitionCampaign(admin,cid,{action:"operator_confirm",expectedVersion:1});
 await expect(c.mutateCampaignPlan(advertiser,cid,{action:"update_draft",expectedVersion:2,name:"changed",objective:"changed"})).rejects.toThrow();
 await c.transitionCampaign(advertiser,cid,{action:"accept_offline",expectedVersion:2});
 let detail=(await c.getCampaignDetail(advertiser,cid))!;expect(detail.quotes[0].lines.every((l:any)=>!l.is_estimate)).toBe(true);expect(detail.readiness.every(r=>!r.creative_ready)).toBe(true);expect(await c.getCampaignDetail(other,cid)).toBeNull();
 const now=new Date().toISOString();const org=detail.campaign.organization_id;
 await db.getDb().query("INSERT INTO creative_assets (id,organization_id,campaign_id,name,created_by,created_at) VALUES ('P3-A',$1,$2,'art',$3,$4)",[org,cid,advertiser.id,now]);
 await db.getDb().query("INSERT INTO creative_versions (id,asset_id,version,original_name,mime_type,size_bytes,storage_path,checksum,status,created_by,created_at) VALUES ('P3-V','P3-A',1,'art.png','image/png',1,'private-pilot','checksum','submitted',$1,$2)",[advertiser.id,now]);
 const {POST:review}=await import("../app/api/creative/versions/[id]/reviews/route");
 const req=(body:object,key?:string)=>new NextRequest("http://localhost/api/pilot",{method:"POST",headers:{"content-type":"application/json",...(key?{"idempotency-key":key}:{})},body:JSON.stringify(body)});
 auth.user=advertiser;expect((await review(req({reviewType:"operator",decision:"approved"}),{params:Promise.resolve({id:"P3-V"})})).status).toBe(403);
 expect((await review(req({reviewType:"client",decision:"approved"}),{params:Promise.resolve({id:"P3-V"})})).status).toBe(200);
 auth.user=admin;expect((await review(req({reviewType:"operator",decision:"approved"}),{params:Promise.resolve({id:"P3-V"})})).status).toBe(200);
 const job=(await db.getDb().query("SELECT * FROM production_jobs")).rows[0];const order=(await db.getDb().query("SELECT * FROM installation_work_orders WHERE work_type='install'")).rows[0];
 const {PATCH:production}=await import("../app/api/production-jobs/[id]/route");const {PATCH:work}=await import("../app/api/work-orders/[id]/route");const {POST:complete}=await import("../app/api/work-orders/[id]/complete/route");
 const ctx={params:Promise.resolve({id:order.id})};const jctx={params:Promise.resolve({id:job.id})};
 expect((await production(req({status:"delivered",expectedVersion:1}),jctx)).status).toBe(422);
 let version=1;for(const status of ["in_production","printed","shipped","delivered"])expect((await production(req({status,expectedVersion:version++}),jctx)).status).toBe(200);
 expect((await production(req({status:"reprint_required",expectedVersion:1}),jctx)).status).toBe(409);
 expect((await work(req({action:"weather_delay",reason:"Unsafe wind",expectedVersion:2}),ctx)).status).toBe(200);
 detail=(await c.getCampaignDetail(advertiser,cid))!;expect(detail.readiness.find(r=>r.id===order.placement_id)?.installation_status).toBe("blocked");expect(detail.readiness.filter(r=>r.id!==order.placement_id).every(r=>r.creative_ready)).toBe(true);
 await db.getDb().query("INSERT INTO work_order_evidence (id,work_order_id,original_name,mime_type,size_bytes,storage_path,checksum,uploaded_by,created_at) VALUES ('P3-PHOTO',$1,'photo.png','image/png',1,'private-pilot','checksum',$2,$3)",[order.id,admin.id,now]);
 expect((await complete(req({expectedVersion:3,evidenceIds:["P3-PHOTO"]},"blocked"),ctx)).status).toBe(422);
 expect((await work(req({action:"reschedule",reason:"Wind cleared",plannedAt:"2026-10-02",expectedVersion:3}),ctx)).status).toBe(200);
 const body={expectedVersion:4,evidenceIds:["P3-PHOTO"],clientShareable:false};
 const responses=await Promise.all([complete(req(body,"same"),ctx),complete(req(body,"same"),ctx)]);expect(responses.map(r=>r.status)).toEqual([200,200]);expect(await responses[0].json()).toEqual(await responses[1].json());
 expect(Number((await db.getDb().query("SELECT COUNT(*) n FROM proof_records")).rows[0].n)).toBe(1);
 expect((await complete(req({...body,expectedVersion:5},"new-key"),ctx)).status).toBe(422);
 expect((await work(req({action:"remove",reason:"wrong work type",expectedVersion:5}),ctx)).status).toBe(422);
 const {GET:photo}=await import("../app/api/work-order-evidence/[id]/route");auth.user=advertiser;expect((await photo(req({}),{params:Promise.resolve({id:"P3-PHOTO"})})).status).toBe(404);
 const {GET:report}=await import("../app/api/campaigns/[id]/report/route");const reportResponse=await report(req({}),{params:Promise.resolve({id:cid})});expect((await reportResponse.json()).proofOfPosting).toHaveLength(0);
 auth.user=other;expect((await report(req({}),{params:Promise.resolve({id:cid})})).status).toBe(404);
 // A replacement starts without approval and never inherits exact-version reviews.
 await db.getDb().query("INSERT INTO creative_versions (id,asset_id,version,original_name,mime_type,size_bytes,storage_path,checksum,status,created_by,created_at) VALUES ('P3-V2','P3-A',2,'new.png','image/png',1,'private-pilot','new','submitted',$1,$2)",[advertiser.id,now]);
 expect((await db.getDb().query("SELECT * FROM creative_reviews WHERE creative_version_id='P3-V2'")).rows).toHaveLength(0);
 auth.user=admin;expect((await review(req({reviewType:"operator",decision:"approved"}),{params:Promise.resolve({id:"P3-V"})})).status).toBe(409);
 // Independent design and supplied-artwork drafts retain due dates and fresh quotes.
 for(const creativePath of ["upload","agency_design"] as const){const repeat=await c.createCampaignPlan(advertiser,{name:creativePath,objective:"Repeat",geography:"Thunder Bay",startDate:"2026-11-01",endDate:"2026-11-07",creativePath,inventoryIds:["P3-D1"]});const fresh=(await c.getCampaignDetail(advertiser,repeat))!;expect(fresh.quotes[0].status).toBe("draft");expect(fresh.placements[0].creative_due_at).toBe("2026-11-01");expect(fresh.readiness[0].creative_ready).toBe(false);if(creativePath==="agency_design"){expect(fresh.quotes[0].lines.some((l:any)=>l.category==="design")).toBe(true);expect((await db.getDb().query("SELECT status FROM design_requests WHERE campaign_id=$1",[repeat])).rows[0].status).toBe("draft");}}
 // Placement-specific approval cannot assign a new version to the other faces.
 const digital=detail.placements.find(p=>p.inventory_id==="P3-D1")!;
 await db.getDb().query("UPDATE creative_versions SET preflight=$1::jsonb WHERE id='P3-V2'",[JSON.stringify({placementIds:[digital.id]})]);
 auth.user=advertiser;expect((await review(req({reviewType:"client",decision:"approved"}),{params:Promise.resolve({id:"P3-V2"})})).status).toBe(200);
 auth.user=admin;expect((await review(req({reviewType:"operator",decision:"approved"}),{params:Promise.resolve({id:"P3-V2"})})).status).toBe(200);
 expect((await db.getDb().query("SELECT placement_id FROM creative_assignments WHERE creative_version_id='P3-V2'")).rows).toEqual([{placement_id:digital.id}]);
 await db.closeDb();
});
afterAll(async()=>{const db=await import("../app/lib/db");await db.closeDb();});
