import { afterAll, beforeAll, expect, test } from "vitest";
import { createPlayerFixtures } from "./helpers/player-fixtures";
import { closeDb, createDeviceAlert, createMediaResource, getDb, resetDatabaseForTests, updateInventoryRecord } from "../app/lib/db";
import { acknowledgePlayer, createPairingCode, fetchPlayerManifest, hashPlayerSecret, heartbeatPlayer, playerStatus, redeemPairingCode, revokePlayer } from "../app/lib/players";

const available = Boolean(process.env.TEST_DATABASE_URL);
const originalPoolSize = process.env.DATABASE_POOL_SIZE;
let fixture: Awaited<ReturnType<typeof createPlayerFixtures>>;
beforeAll(async () => {
  if (!available) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.DATABASE_POOL_SIZE = "1";
  await resetDatabaseForTests();
  fixture = await createPlayerFixtures("PLAYER-DB");
});
afterAll(async () => {
  if (available) await closeDb();
  if (originalPoolSize === undefined) delete process.env.DATABASE_POOL_SIZE; else process.env.DATABASE_POOL_SIZE = originalPoolSize;
});

test.skipIf(!available)("only owners pair digital screens; codes expire, rotate, redeem once, and rate-limit across instances", async () => {
  await expect(createPairingCode(fixture.otherInstitution, fixture.screen.id)).rejects.toMatchObject({ status: 403 });
  await expect(createPairingCode(fixture.operator, fixture.screen.id)).rejects.toMatchObject({ status: 403 });
  await expect(createPairingCode(fixture.advertiser, fixture.screen.id)).rejects.toMatchObject({ status: 403 });
  await expect(createPairingCode(fixture.institution, fixture.staticId)).rejects.toMatchObject({ status: 422 });
  const first = await createPairingCode(fixture.institution, fixture.screen.id);
  const second = await createPairingCode(fixture.institution, fixture.screen.id);
  await expect(redeemPairingCode(first.code, "rotation")).rejects.toMatchObject({ status: 422 });
  await getDb().query("UPDATE player_pairing_codes SET expires_at=NOW()-INTERVAL '1 second' WHERE inventory_id=$1", [fixture.screen.id]);
  await expect(redeemPairingCode(second.code, "expiry")).rejects.toMatchObject({ status: 422 });
  for (let i = 0; i < 10; i++) await expect(redeemPairingCode("000000000000", "limited")).rejects.toMatchObject({ status: 422 });
  await expect(redeemPairingCode("000000000000", "limited")).rejects.toMatchObject({ status: 429 });
  const code = await createPairingCode(fixture.admin, fixture.screen.id);
  const results = await Promise.allSettled([redeemPairingCode(code.code, "race1"), redeemPairingCode(code.code, "race2")]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const paired = (results.find((result) => result.status === "fulfilled") as PromiseFulfilledResult<{ token: string; playerId: string }>).value;
  const stored = (await getDb().query("SELECT credential_hash FROM players WHERE id=$1", [paired.playerId])).rows[0];
  expect(stored.credential_hash).toBe(hashPlayerSecret(paired.token));
  expect(stored.credential_hash).not.toBe(paired.token);
  await expect(createPairingCode(fixture.institution, fixture.screen.id)).rejects.toMatchObject({ status: 409 });
  await revokePlayer(fixture.institution, fixture.screen.id, paired.playerId);
});

test.skipIf(!available)("manifest revisions, tenant isolation, ordered acknowledgments, revocation and re-pairing are server-authoritative", async () => {
  const code = await createPairingCode(fixture.institution, fixture.screen.id);
  const paired = await redeemPairingCode(code.code, "main");
  const original = await fetchPlayerManifest(paired.token);
  expect(original.inventoryId).toBe(fixture.screen.id);
  expect(original.published).toBe(true);
  expect((await fetchPlayerManifest(paired.token)).revision).toBe(original.revision);
  await expect(fetchPlayerManifest("invalid")).rejects.toMatchObject({ status: 401 });
  await expect(playerStatus(fixture.otherInstitution, fixture.screen.id)).rejects.toMatchObject({ status: 403 });
  await expect(acknowledgePlayer(paired.token, { revision: 99, stage: "received" })).rejects.toMatchObject({ status: 409 });
  await expect(acknowledgePlayer(paired.token, { revision: original.revision, stage: "applied" })).rejects.toMatchObject({ status: 409 });
  for (const stage of ["received", "validated", "applied"]) await acknowledgePlayer(paired.token, { revision: original.revision, stage });
  expect((await acknowledgePlayer(paired.token, { revision: original.revision, stage: "applied" })).deduplicated).toBe(true);
  await heartbeatPlayer(paired.token, { error: "media_unavailable" });
  expect((await playerStatus(fixture.institution, fixture.screen.id)).player).toMatchObject({ connection: "online", appliedRevision: original.revision, lastPlaybackAt: null, lastError: "media_unavailable" });
  await getDb().query("UPDATE players SET last_seen_at=NOW()-INTERVAL '2 minutes' WHERE id=$1", [paired.playerId]);
  expect((await playerStatus(fixture.institution, fixture.screen.id)).player?.connection).toBe("stale");
  await updateInventoryRecord(fixture.screen.id, { approvalStatus: "pending approval" });
  const stopped = await fetchPlayerManifest(paired.token);
  expect(stopped.revision).toBeGreaterThan(original.revision);
  expect(stopped.published).toBe(false); expect(stopped.slides).toEqual([]);
  await expect(acknowledgePlayer(paired.token, { revision: original.revision, stage: "received" })).rejects.toMatchObject({ status: 409 });
  await expect(revokePlayer(fixture.otherInstitution, fixture.screen.id, paired.playerId)).rejects.toMatchObject({ status: 403 });
  await revokePlayer(fixture.institution, fixture.screen.id, paired.playerId);
  await expect(fetchPlayerManifest(paired.token)).rejects.toMatchObject({ status: 401 });
  await expect(heartbeatPlayer(paired.token, {})).rejects.toMatchObject({ status: 401 });
  const nextCode = await createPairingCode(fixture.institution, fixture.screen.id);
  const next = await redeemPairingCode(nextCode.code, "replacement");
  await expect(revokePlayer(fixture.institution, fixture.screen.id, paired.playerId)).rejects.toMatchObject({ status: 409 });
  expect((await fetchPlayerManifest(next.token)).playerId).not.toBe(paired.playerId);
  await revokePlayer(fixture.institution, fixture.screen.id, next.playerId);
});

test.skipIf(!available)("shared approval eligibility, deletion, alert cancellation and bounded leases change manifests without exposing foreign content", async () => {
  await updateInventoryRecord(fixture.screen.id, { approvalStatus: "approved" });
  const paired = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "content");
  await createMediaResource({ id: "MED-PLAYER-APPROVED", inventoryId: fixture.screen.id, ownerId: fixture.institution.id, title: "Approved", originalName: "approved.png", mimeType: "image/png", mediaType: "image", approvalStatus: "approved", sizeBytes: 1, storagePath: "/unused", publicUrl: "/media/MED-PLAYER-APPROVED", createdAt: new Date().toISOString() });
  await createMediaResource({ id: "MED-PLAYER-PENDING", inventoryId: fixture.screen.id, ownerId: fixture.institution.id, title: "Pending", originalName: "pending.png", mimeType: "image/png", mediaType: "image", approvalStatus: "pending review", sizeBytes: 1, storagePath: "/unused", publicUrl: "/media/MED-PLAYER-PENDING", createdAt: new Date().toISOString() });
  const content = await fetchPlayerManifest(paired.token);
  expect(content.slides.map((slide) => slide.id)).toEqual(["MED-PLAYER-APPROVED"]);
  expect(Date.parse(content.validUntil) - Date.parse(content.generatedAt)).toBe(86_400_000);
  await createDeviceAlert({ institutionId: fixture.institution.id, alertType: "public-safety", title: "Pilot alert", message: "Test only", area: "Lobby", targetDeviceIds: [fixture.screen.id], issuedBy: "Pilot", createdBy: fixture.institution.id, expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const alert = await fetchPlayerManifest(paired.token);
  expect(alert.activeAlert?.title).toBe("Pilot alert"); expect(alert.slides).toHaveLength(1); // Cached ordinary content resumes after offline alert expiry.
  await getDb().query("UPDATE device_alerts SET status='ended' WHERE id=$1", [alert.activeAlert!.id]);
  const resumed = await fetchPlayerManifest(paired.token);
  expect(resumed.activeAlert).toBeNull(); expect(resumed.slides).toHaveLength(1);
  await getDb().query("DELETE FROM media_resources WHERE id='MED-PLAYER-APPROVED'");
  expect((await fetchPlayerManifest(paired.token)).slides).toEqual([]);
  await getDb().query("UPDATE inventory SET institution_id=$2 WHERE id=$1", [fixture.screen.id, fixture.otherInstitution.id]);
  await expect(fetchPlayerManifest(paired.token)).rejects.toMatchObject({ status: 401 });
});
