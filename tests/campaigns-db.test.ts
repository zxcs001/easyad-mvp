import * as assert from "node:assert/strict";
import { afterAll, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";

const postgresUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!postgresUrl)("mixed campaigns are scoped, idempotent, snapshotted, and enforce static exclusivity", async () => {
  process.env.DATABASE_URL = postgresUrl; vi.resetModules();
  const db = await import("../app/lib/db"); const campaigns = await import("../app/lib/campaigns");
  await db.resetDatabaseForTests();
  const advertiser = await db.createUser("Planner", "planner@example.test", "hash", "advertiser");
  const outsider = await db.createUser("Other planner", "other@example.test", "hash", "advertiser");
  const admin = await db.createUser("Admin", "admin@example.test", "hash", "admin");
  const base = { operator:"Test operator",x:10,y:20,address:"Thunder Bay",price:100,impressions:1000,traffic:900,income:70000,audience:"Adults",competitor:"Low" as const,occupancy:0,imageInterval:6,maxLoopSeconds:120,availableFrom:"2026-09-01",availableTo:"2027-09-01" };
  const digital: InventoryItem = { ...base,id:"INV-DIGITAL",name:"Digital screen",format:"digital",deliveryMode:"digital",productType:"digital_screen" };
  const staticFace: InventoryItem = { ...base,id:"INV-STATIC",name:"Static face",format:"static",deliveryMode:"static",productType:"poster",productionLeadDays:7,installationLeadDays:3 };
  await db.createInventory(digital, admin.id); await db.createInventory(staticFace, admin.id);
  await db.createInventorySpecification(staticFace.id,{ trimWidthMm:3050,trimHeightMm:1550,visibleWidthMm:3000,visibleHeightMm:1500,bleedMm:25,safeAreaMm:50,scaleRatio:"1:10",minimumDpi:150,colourSpace:"CMYK",acceptedFileTypes:["pdf","png","jpg"],maximumFileBytes:20_000_000,substrate:"vinyl",finishing:"hemmed",templateUrl:"/template.pdf",notes:"Face-specific" },admin.id);
  const input = { name:"Mixed plan",objective:"Awareness",geography:"Thunder Bay",startDate:"2026-10-01",endDate:"2026-10-07",creativePath:"later" as const,inventoryIds:[digital.id,staticFace.id],idempotencyKey:"same-submit" };
  const first = await campaigns.createCampaignPlan(advertiser,input); const duplicate = await campaigns.createCampaignPlan(advertiser,input);
  assert.equal(duplicate,first);
  const detail = await campaigns.getCampaignDetail(advertiser,first); assert.equal(detail?.placements.length,2); assert.deepEqual(new Set(detail?.placements.map((row:{delivery_mode:string})=>row.delivery_mode)),new Set(["digital","static"]));
  assert.ok(detail?.placements.find((row:{delivery_mode:string})=>row.delivery_mode==="static")?.specification_snapshot);
  assert.equal(await campaigns.getCampaignDetail(outsider,first),null);
  await campaigns.transitionCampaign(admin,first,{action:"operator_confirm",expectedVersion:1});
  await campaigns.transitionCampaign(advertiser,first,{action:"accept_offline",expectedVersion:2,note:"Accepted by email"});
  const accepted = await campaigns.getCampaignDetail(advertiser,first); assert.equal(accepted?.campaign.status,"confirmed"); assert.equal(accepted?.quotes[0].status,"accepted_offline");
  process.env.FEATURE_CAMPAIGN_MODEL_V2="true";process.env.PLAYER_INGEST_TOKEN="test-player-token";const {POST:ingest}=await import("../app/api/delivery-events/route");const digitalPlacement=accepted?.placements.find((row:{delivery_mode:string})=>row.delivery_mode==="digital");assert.ok(digitalPlacement);
  const eventRequest=()=>new Request("http://localhost/api/delivery-events",{method:"POST",headers:{authorization:"Bearer test-player-token","idempotency-key":"miss-1","content-type":"application/json"},body:JSON.stringify({placementId:digitalPlacement.id,eventType:"missed",detail:"Player offline"})});
  assert.equal((await ingest()).status,410);assert.equal((await ingest()).status,410);
  assert.equal(Number((await db.getDb().query("SELECT COUNT(*) count FROM digital_delivery_events")).rows[0].count),0);assert.equal(Number((await db.getDb().query("SELECT COUNT(*) count FROM placement_issues WHERE issue_type='missed'")).rows[0].count),0);
  const competing = await campaigns.createCampaignPlan(advertiser,{...input,name:"Competing",inventoryIds:[staticFace.id],idempotencyKey:"competing"});
  await campaigns.transitionCampaign(admin,competing,{action:"operator_confirm",expectedVersion:1});
  await assert.rejects(()=>campaigns.transitionCampaign(advertiser,competing,{action:"accept_offline",expectedVersion:2}),/already committed/);
  await db.closeDb();
});

afterAll(async()=>{ try { const db=await import("../app/lib/db"); await db.closeDb(); } catch {} });
