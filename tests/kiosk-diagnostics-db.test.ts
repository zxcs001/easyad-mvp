import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test } from "vitest";
import { closeDb, getDb, resetDatabaseForTests } from "../app/lib/db";
import { acknowledgeRecovery, createPairingCode, heartbeatPlayer, playerStatus, queuePlayerRecovery, redeemPairingCode, revokePlayer } from "../app/lib/players";
import { bulkPlayerRecovery, fleetSnapshot } from "../app/lib/fleet";
import { createPlayerFixtures } from "./helpers/player-fixtures";
import { browserReport } from "./helpers/kiosk-diagnostics-fixtures";
const available = Boolean(process.env.TEST_DATABASE_URL);
const originalPlayerFlag = process.env.FEATURE_PLAYER_CONTROL;
let fixture: Awaited<ReturnType<typeof createPlayerFixtures>>, paired: Awaited<ReturnType<typeof redeemPairingCode>>, foreign: typeof paired;
beforeAll(async () => {
  if (!available) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await resetDatabaseForTests(); fixture = await createPlayerFixtures("KIOSK-DB");
  paired = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "kiosk");
  foreign = await redeemPairingCode((await createPairingCode(fixture.otherInstitution, fixture.otherScreenId)).code, "other-kiosk");
});
afterAll(async () => { if (available) await closeDb(); if (originalPlayerFlag === undefined) delete process.env.FEATURE_PLAYER_CONTROL; else process.env.FEATURE_PLAYER_CONTROL = originalPlayerFlag; });
const request = (kind = "refresh_content") => ({ kind, requestKey: randomUUID(), playerId: paired.playerId });
test.skipIf(!available)("heartbeat persists bounded diagnostics, server contact time and clears resolved errors", async () => {
  await heartbeatPlayer(paired.token, { error: "media_unavailable", diagnostics: browserReport({ clientTime: new Date(Date.now() + 180000).toISOString() }) });
  const health = (await playerStatus(fixture.institution, fixture.screen.id)).player!.health!;
  expect(health.error).toBe("media_unavailable"); expect(health.clockSkewMs).toBeGreaterThan(170000);
  expect(health.diagnostics?.kiosk).toBe(true); expect(health.diagnosticsAt).toBeTruthy();
  await heartbeatPlayer(paired.token, {});
  expect((await playerStatus(fixture.institution, fixture.screen.id)).player!.health!.error).toBeNull();
  await expect(heartbeatPlayer(paired.token, { diagnostics: browserReport({ storedReports: 50001 }) })).rejects.toMatchObject({ status: 422 });
});
test.skipIf(!available)("recovery requires the owner and the currently paired player; uncertain retries are idempotent", async () => {
  for (const user of [fixture.otherInstitution, fixture.operator, fixture.advertiser]) await expect(queuePlayerRecovery(user, fixture.screen.id, request())).rejects.toMatchObject({ status: 403 });
  await expect(queuePlayerRecovery(fixture.institution, fixture.staticId, request())).rejects.toMatchObject({ status: 422 });
  await expect(queuePlayerRecovery(fixture.institution, fixture.screen.id, { ...request(), playerId: foreign.playerId })).rejects.toMatchObject({ status: 409 });
  await getDb().query("UPDATE inventory SET institution_id=$2 WHERE id=$1", [fixture.otherScreenId, fixture.institution.id]);
  await expect(queuePlayerRecovery(fixture.institution, fixture.otherScreenId, { ...request(), playerId: foreign.playerId })).rejects.toMatchObject({ status: 409 });
  await getDb().query("UPDATE inventory SET institution_id=$2 WHERE id=$1", [fixture.otherScreenId, fixture.otherInstitution.id]);
  const input = request(), first = await queuePlayerRecovery(fixture.institution, fixture.screen.id, input);
  expect((await queuePlayerRecovery(fixture.institution, fixture.screen.id, input)).command.id).toBe(first.command.id);
  await expect(queuePlayerRecovery(fixture.institution, fixture.screen.id, { ...input, kind: "reload_player" })).rejects.toMatchObject({ status: 409 });
  await expect(queuePlayerRecovery(fixture.institution, fixture.screen.id, request())).rejects.toMatchObject({ status: 409 });
  expect((await heartbeatPlayer(paired.token, {})).recoveryCommand?.id).toBe(first.command.id);
  await expect(acknowledgeRecovery(foreign.token, { commandId: first.command.id, status: "received" })).rejects.toMatchObject({ status: 404 });
  await expect(acknowledgeRecovery(paired.token, { commandId: first.command.id, status: "succeeded", result: "content_refreshed" })).rejects.toMatchObject({ status: 409 });
  await acknowledgeRecovery(paired.token, { commandId: first.command.id, status: "received" });
  expect((await heartbeatPlayer(paired.token, {})).recoveryCommand).toBeNull();
  await expect(acknowledgeRecovery(paired.token, { commandId: first.command.id, status: "succeeded", result: "player_reloaded" })).rejects.toMatchObject({ status: 422 });
  const done = { commandId: first.command.id, status: "succeeded", result: "content_refreshed" };
  await acknowledgeRecovery(paired.token, done); expect(await acknowledgeRecovery(paired.token, done)).toEqual({ accepted: true });
  expect((await playerStatus(fixture.institution, fixture.screen.id)).player!.health!.commands[0]).toMatchObject({ status: "succeeded", result: "content_refreshed", finishedAt: expect.any(String) });
});
test.skipIf(!available)("expired offline commands are not delivered or revived", async () => {
  const { command } = await queuePlayerRecovery(fixture.institution, fixture.screen.id, request("reload_player"));
  await getDb().query("UPDATE player_recovery_commands SET expires_at=NOW()-INTERVAL '1 second' WHERE id=$1", [command.id]);
  expect((await heartbeatPlayer(paired.token, {})).recoveryCommand).toBeNull();
  await expect(acknowledgeRecovery(paired.token, { commandId: command.id, status: "received" })).rejects.toMatchObject({ status: 409 });
  expect((await playerStatus(fixture.institution, fixture.screen.id)).player!.health!.commands[0].status).toBe("expired");
});
test.skipIf(!available)("bulk recovery reports partial results and fleet diagnostics stay within operator scope", async () => {
  process.env.FEATURE_PLAYER_CONTROL = "true";
  const result = await bulkPlayerRecovery(fixture.institution, { ...request("rebuild_cache"), targets: [{ id: fixture.screen.id, playerId: paired.playerId }, { id: fixture.otherScreenId, playerId: foreign.playerId }] });
  expect(result.results.map(item => [item.id, item.ok])).toEqual([[fixture.screen.id, true], [fixture.otherScreenId, false]]);
  expect(result.results[1]).toMatchObject({ status: 403 });
  await expect(bulkPlayerRecovery(fixture.institution, { ...request(), targets: [{ id: fixture.screen.id }, { id: fixture.screen.id }] })).rejects.toMatchObject({ status: 422 });
  const fleet = await fleetSnapshot({ ...fixture.operator, screenScope: [fixture.screen.id] });
  expect(fleet.owner).toBe(false); expect(fleet.players.map(player => player.inventoryId)).toEqual([fixture.screen.id]);
  expect(JSON.stringify(fleet.players)).not.toContain("credential_hash"); expect(JSON.stringify(fleet.players)).not.toContain(paired.token);
  const command = (await heartbeatPlayer(paired.token, {})).recoveryCommand!;
  await acknowledgeRecovery(paired.token, { commandId: command.id, status: "received" });
  await acknowledgeRecovery(paired.token, { commandId: command.id, status: "failed", result: "recovery_failed" });
  const audit = await getDb().query("SELECT action,result FROM fleet_audit WHERE resource_id=$1", [command.id]);
  expect(audit.rows).toEqual([{ action: "player_rebuild_cache", result: "queued" }]);
});
test.skipIf(!available)("recovery rate limits and revocation prevent restart storms and commands reaching replacements", async () => {
  await getDb().query("UPDATE player_recovery_commands SET requested_at=NOW()-INTERVAL '11 minutes' WHERE player_id=$1", [paired.playerId]);
  for (let i = 0; i < 5; i++) {
    const { command } = await queuePlayerRecovery(fixture.institution, fixture.screen.id, request());
    await acknowledgeRecovery(paired.token, { commandId: command.id, status: "received" });
    await acknowledgeRecovery(paired.token, { commandId: command.id, status: "succeeded", result: "content_refreshed" });
  }
  await expect(queuePlayerRecovery(fixture.institution, fixture.screen.id, request())).rejects.toMatchObject({ status: 429 });
  await getDb().query("UPDATE player_recovery_commands SET requested_at=NOW()-INTERVAL '11 minutes' WHERE player_id=$1", [paired.playerId]);
  await queuePlayerRecovery(fixture.institution, fixture.screen.id, request());
  await revokePlayer(fixture.institution, fixture.screen.id, paired.playerId);
  await expect(heartbeatPlayer(paired.token, {})).rejects.toMatchObject({ status: 401 });
  const replacement = await redeemPairingCode((await createPairingCode(fixture.institution, fixture.screen.id)).code, "replacement");
  expect((await heartbeatPlayer(replacement.token, {})).recoveryCommand).toBeNull();
  await expect(queuePlayerRecovery(fixture.institution, fixture.screen.id, request())).rejects.toMatchObject({ status: 409 });
});
