import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import type { DbUser } from "../app/lib/db";
import { closeDb, createBookingRecord, createCreative, createPopLog, createUser, getDb, resetDatabaseForTests } from "../app/lib/db";
import { createPairingCode, fetchPlayerManifest, ingestPlayback, redeemPairingCode } from "../app/lib/players";
import { bookingDeliveries } from "../app/lib/delivery-report-db";
import { createPlayerFixtures } from "./helpers/player-fixtures";

const auth = vi.hoisted(() => ({ user: null as DbUser | null }));
vi.mock("../app/lib/auth", async importOriginal => ({ ...await importOriginal<object>(), getCurrentUser: async () => auth.user }));
const available = Boolean(process.env.TEST_DATABASE_URL);
let fixture: Awaited<ReturnType<typeof createPlayerFixtures>>;
let otherAdvertiser: DbUser;
let booking: Awaited<ReturnType<typeof createBookingRecord>>;
let asOf: Date;
beforeAll(async () => {
  if (!available) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await resetDatabaseForTests();
  fixture = await createPlayerFixtures("DELIVERY-DB");
  otherAdvertiser = await createUser("Other buyer", "delivery-other@example.test", "hash", "advertiser");
  const today = new Date().toISOString().slice(0, 10);
  booking = await createBookingRecord({ id: "BK-DELIVERY", advertiser: "Pilot", inventoryId: fixture.screen.id, campaign: "Delivery", start: today, end: today, adSlots: 1, creativeStatus: "approved", status: "live", spend: 100, paid: false, pop: 100 }, fixture.advertiser.id);
  await createBookingRecord({ ...booking, id: "BK-OTHER", inventoryId: fixture.otherScreenId }, otherAdvertiser.id);
  await createCreative({ id: "CRV-DELIVERY", bookingId: booking.id, source: "upload", template: "retail", format: "digital", width: 1920, height: 1080, fileType: "png", fileSize: 1, safeZone: 0, distortion: 0, originalName: "private-art.png", mimeType: "image/png", publicUrl: "/private-test-art.png", status: "approved" });
});
afterAll(async () => { if (available) await closeDb(); });

test.skipIf(!available)("authenticated legacy plays join their booked placement, deduplicate and exclude future/demo/manual counts", async () => {
  const paired = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "delivery");
  const manifest = await fetchPlayerManifest(paired.token);
  const slide = manifest.slides.find(s => s.legacyBookingId === booking.id)!;
  expect(slide).toMatchObject({ id: "CRV-DELIVERY", placementId: `PLC-LEGACY-${booking.id}` });
  const start = Date.parse(manifest.generatedAt) + 1;
  const body = { eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: manifest.revision, slideId: slide.id, assetVersion: slide.assetVersion, startedAt: new Date(start).toISOString(), occurredAt: new Date(start + 6000).toISOString(), durationMs: 6000, outcome: "completed" };
  await ingestPlayback(paired.token, body);
  await ingestPlayback(paired.token, body);
  await ingestPlayback(paired.token, { ...body, eventId: randomUUID(), sequence: 2, outcome: "interrupted" });
  await ingestPlayback(paired.token, { ...body, eventId: randomUUID(), sequence: 3, outcome: "failed" });
  await createPopLog({ bookingId: booking.id, inventoryId: fixture.screen.id, plays: 50, impressions: 999, status: "verified", source: "operator-declaration", playedAt: new Date(start - 60000).toISOString() });
  await getDb().query("INSERT INTO pop_logs(id,booking_id,inventory_id,plays,impressions,status,source,played_at) VALUES ('POP-TB-0099',$1,$2,1000,99999,'verified','player-log',$3)", [booking.id, fixture.screen.id, new Date(start - 60000).toISOString()]);
  await createPopLog({ bookingId: booking.id, inventoryId: fixture.screen.id, plays: 80, impressions: 999, status: "verified", source: "operator-declaration", playedAt: "2100-01-01T00:00:00.000Z" });
  const [before] = await bookingDeliveries([booking], undefined, new Date(start));
  expect(before.player.completed).toBe(0);
  asOf = new Date(start + 30000);
  const [report] = await bookingDeliveries([booking], undefined, asOf);
  expect(report).toMatchObject({ source: "authenticated_player", player: { completed: 1, interrupted: 1, failed: 1 }, operator: { completed: 50 }, demo: { completed: 1000 }, estimatedViews: null });
  expect(report.creatives).toEqual([{ creativeId: "CRV-DELIVERY", completed: 1, interrupted: 1, failed: 1, late: 0 }]);
});

test.skipIf(!available)("historical manifests associate legacy evidence even without a placement; replacing art preserves its identity", async () => {
  await getDb().query("DELETE FROM placement_issues WHERE placement_id=$1", [`PLC-LEGACY-${booking.id}`]);
  // Preserve existing placement-linked history for the first test, then test
  // the older no-placement path with another booking on the same screen.
  const older = await createBookingRecord({ ...booking, id: "BK-NO-PLACEMENT" }, fixture.advertiser.id);
  await getDb().query("DELETE FROM placements WHERE id=$1", [`PLC-LEGACY-${older.id}`]);
  const creative = { bookingId: older.id, source: "upload" as const, template: "retail" as const, format: "digital" as const, width: 1920, height: 1080, fileType: "png" as const, fileSize: 1, safeZone: 0, distortion: 0, originalName: "old.png", mimeType: "image/png", publicUrl: "/old-art.png", status: "approved" as const };
  await createCreative({ ...creative, id: "CRV-OLD-ART" });
  const token = (await getDb().query("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [fixture.screen.id])).rows[0];
  await getDb().query("UPDATE players SET revoked_at=NOW() WHERE id=$1", [token.id]);
  const paired = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "old-manifest");
  const manifest = await fetchPlayerManifest(paired.token);
  const slide = manifest.slides.find(s => s.legacyBookingId === older.id)!;
  expect(slide.placementId).toBeUndefined();
  const start = Date.parse(manifest.generatedAt) + 1;
  await ingestPlayback(paired.token, { eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: manifest.revision, slideId: slide.id, assetVersion: slide.assetVersion, startedAt: new Date(start).toISOString(), occurredAt: new Date(start + 6000).toISOString(), durationMs: 6000, outcome: "completed" });
  await createCreative({ ...creative, id: "CRV-NEW-ART", publicUrl: "/new-art.png" });
  await fetchPlayerManifest(paired.token);
  const [report] = await bookingDeliveries([older], undefined, new Date(start + 30000));
  expect(report.player.completed).toBe(1);
  expect(report.creatives[0].creativeId).toBe("CRV-OLD-ART");
});

test.skipIf(!available)("delivery API keeps advertiser, institution and delegated screen boundaries", async () => {
  const { GET } = await import("../app/api/delivery/route");
  auth.user = null;
  expect((await GET()).status).toBe(401);
  auth.user = fixture.advertiser;
  let response = await GET();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  let json = await response.json();
  expect(json.delivery.map((r: { bookingId: string }) => r.bookingId).sort()).toEqual(["BK-DELIVERY", "BK-NO-PLACEMENT"]);
  expect(JSON.stringify(json)).not.toMatch(/private-test-art|credential|assetVersion|other-art/);
  auth.user = fixture.otherInstitution;
  json = await (await GET()).json();
  expect(json.delivery.map((r: { bookingId: string }) => r.bookingId)).toEqual(["BK-OTHER"]);
  auth.user = { ...fixture.operator, screenScope: [] };
  expect((await (await GET()).json()).delivery).toEqual([]);
  auth.user = { ...fixture.operator, screenScope: [fixture.screen.id] };
  expect((await (await GET()).json()).delivery).toHaveLength(2);
  auth.user = { ...fixture.operator, institutionId: null };
  expect((await (await GET()).json()).delivery).toEqual([]);
  auth.user = fixture.admin;
  expect((await (await GET()).json()).delivery).toHaveLength(3);
});

test.skipIf(!available)("campaign reports use local dayparts and DST, preserving unknown invalid schedules", async () => {
  const originalFlag = process.env.FEATURE_CAMPAIGN_MODEL_V2;
  process.env.FEATURE_CAMPAIGN_MODEL_V2 = "true";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-09T12:00:00Z"));
  try {
    const placement = (await getDb().query("SELECT id FROM placements WHERE campaign_id=$1 AND delivery_mode='digital'", [fixture.campaignId])).rows[0];
    const schedule = { model: "daypart-slot-v1", startDate: "2026-03-08", endDate: "2026-03-08", timezone: "America/Toronto", operatingHours: "00:00-24:00", dayparts: ["overnight"], slotSeconds: 6, slots: 1, loopSeconds: 30 };
    await getDb().query("UPDATE placements SET status='confirmed',schedule_snapshot=$2::jsonb WHERE id=$1", [placement.id, JSON.stringify(schedule)]);
    auth.user = fixture.advertiser;
    const { GET } = await import("../app/api/campaigns/[id]/report/route");
    const context = { params: Promise.resolve({ id: fixture.campaignId }) };
    const request = new (await import("next/server")).NextRequest("http://localhost/api/report");
    const report = await (await GET(request, context)).json();
    expect(report.asOf).toBe("2026-03-09T12:00:00.000Z");
    expect(report.reconciliation).toEqual([expect.objectContaining({ placementId: placement.id, plannedPlays: 720, nominalScheduledPlays: 720, playerReportedPlays: 0, unreported: 720 })]);
    await getDb().query("UPDATE placements SET schedule_snapshot=$2::jsonb WHERE id=$1", [placement.id, JSON.stringify({ ...schedule, loopSeconds: 0 })]);
    const invalid = await (await GET(request, context)).json();
    expect(invalid.reconciliation[0]).toMatchObject({ plannedPlays: null, nominalScheduledPlays: null, unreported: null });
  } finally {
    vi.useRealTimers();
    if (originalFlag === undefined) delete process.env.FEATURE_CAMPAIGN_MODEL_V2; else process.env.FEATURE_CAMPAIGN_MODEL_V2 = originalFlag;
  }
});
