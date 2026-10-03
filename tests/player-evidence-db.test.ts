import { afterAll, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { createPlayerFixtures } from "./helpers/player-fixtures";
import { closeDb, createBookingRecord, updateBookingRecord, getDb, resetDatabaseForTests } from "../app/lib/db";
import { createCampaignPlan, transitionCampaign } from "../app/lib/campaigns";
import { createPairingCode, fetchPlayerManifest, ingestPlayback, playerStatus, redeemPairingCode, revokePlayer } from "../app/lib/players";
const available = Boolean(process.env.TEST_DATABASE_URL);
let fixture: Awaited<ReturnType<typeof createPlayerFixtures>>;
beforeAll(async () => { if (!available)
    return; process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.FEATURE_CAMPAIGN_MODEL_V2 = "true"; await resetDatabaseForTests(); fixture = await createPlayerFixtures("P2-DB"); });
afterAll(async () => { if (available)
    await closeDb(); });
test.skipIf(!available)("concurrent confirmations reserve capacity once; inquiries reserve nothing", async () => {
    await getDb().query("UPDATE inventory SET max_loop_seconds=6 WHERE id=$1", [fixture.screen.id]);
    const input = { name: "Capacity", objective: "Pilot", geography: "Thunder Bay", startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), creativePath: "later" as const, inventoryIds: [fixture.screen.id] };
    const ids = await Promise.all([createCampaignPlan(fixture.advertiser, input), createCampaignPlan(fixture.advertiser, { ...input, name: "Second" })]);
    for (const id of ids)
        await transitionCampaign(fixture.admin, id, { action: "operator_confirm", expectedVersion: 1 });
    const results = await Promise.allSettled(ids.map(id => transitionCampaign(fixture.advertiser, id, { action: "accept_offline", expectedVersion: 2 })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason.status).toBe(409);
    const rows = await getDb().query("SELECT schedule_snapshot FROM placements WHERE inventory_id=$1 AND status='confirmed'", [fixture.screen.id]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].schedule_snapshot).toMatchObject({ slotSeconds: 6, loopSeconds: 6, timezone: "UTC" });
    await createBookingRecord({id:"BK-P2",advertiser:"Pilot",inventoryId:fixture.screen.id,campaign:"Legacy inquiry",start:input.startDate,end:input.endDate,adSlots:1,creativeStatus:"pending review",status:"creative review",spend:100,paid:false,pop:0},fixture.advertiser.id);
    await expect(updateBookingRecord("BK-P2",{status:"approved"})).rejects.toMatchObject({status:409});
});
test.skipIf(!available)("exact approvals compile; player events, issues, duplicates and revocation remain scoped", async () => {
    const placement = (await getDb().query("SELECT * FROM placements WHERE inventory_id=$1 AND status='confirmed'", [fixture.screen.id])).rows[0];
    const now = new Date().toISOString();
    await getDb().query("INSERT INTO creative_assets(id,organization_id,campaign_id,name,created_by,created_at) VALUES('P2-ASSET',$1,$2,'Pilot',$3,$4)", [`ORG-${fixture.advertiser.id}`, placement.campaign_id, fixture.advertiser.id, now]);
    await getDb().query("INSERT INTO creative_versions(id,asset_id,version,original_name,mime_type,size_bytes,storage_path,checksum,status,created_by,created_at) VALUES('P2-VERSION','P2-ASSET',1,'pilot.png','image/png',1,'unused','abc','approved',$1,$2)", [fixture.advertiser.id, now]);
    await getDb().query("INSERT INTO creative_assignments VALUES($1,'P2-VERSION',$2,$3)", [placement.id, fixture.advertiser.id, now]);
    const paired = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "p2");
    expect((await fetchPlayerManifest(paired.token)).slides).toHaveLength(0);
    for (const type of ["client", "operator"])
        await getDb().query("INSERT INTO creative_reviews(id,creative_version_id,review_type,decision,actor_id,created_at) VALUES($1,'P2-VERSION',$2,'approved',$3,$4)", [randomUUID(), type, fixture.admin.id, now]);
    const manifest = await fetchPlayerManifest(paired.token);
    expect(manifest.slides).toHaveLength(1);
    expect(manifest.slides[0]).toMatchObject({ placementId: placement.id, creativeVersionId: "P2-VERSION" });
    const start = Date.parse(manifest.generatedAt) + 1;
    const body = { eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: manifest.revision, slideId: placement.id, assetVersion: "abc", startedAt: new Date(start).toISOString(), occurredAt: new Date(start + 6000).toISOString(), durationMs: 6000, outcome: "completed" };
    const first = await ingestPlayback(paired.token, body);
    expect(await ingestPlayback(paired.token, body)).toEqual(first);
    expect((await playerStatus(fixture.institution, fixture.screen.id)).player?.lastPlaybackAt).toBe(body.occurredAt);
    await expect(ingestPlayback(paired.token, { ...body, outcome: "failed" })).rejects.toMatchObject({ status: 409 });
    await expect(ingestPlayback(paired.token, { ...body, eventId: randomUUID() })).rejects.toMatchObject({ status: 409 });
    const other = await redeemPairingCode((await createPairingCode(fixture.otherInstitution, fixture.otherScreenId)).code, "otherp2");
    await expect(ingestPlayback(other.token, body)).rejects.toMatchObject({ status: 422 });
    const failed = { ...body, eventId: randomUUID(), sequence: 2, outcome: "failed" };
    await getDb().query("ALTER TABLE placement_issues ADD CONSTRAINT p2_fault CHECK(issue_type<>'unverifiable') NOT VALID");
    await expect(ingestPlayback(paired.token, failed)).rejects.toThrow();
    expect((await getDb().query("SELECT id FROM digital_delivery_events WHERE idempotency_key=$1", [`${paired.playerId}:${failed.eventId}`])).rowCount).toBe(0);
    await getDb().query("ALTER TABLE placement_issues DROP CONSTRAINT p2_fault");
    await ingestPlayback(paired.token, failed);
    await ingestPlayback(paired.token, failed);
    expect((await getDb().query("SELECT * FROM placement_issues WHERE placement_id=$1", [placement.id])).rowCount).toBe(1);
    await revokePlayer(fixture.institution, fixture.screen.id, paired.playerId);
    await expect(ingestPlayback(paired.token, body)).rejects.toMatchObject({ status: 401 });
});
