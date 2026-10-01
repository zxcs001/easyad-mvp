import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { InventoryItem } from "../data";
import type { PlayerManifest, PlayerStatus, PlayerTiming } from "../player-types";
import { canPublishInventoryRecord } from "./auth";
import { getActiveDeviceAlertForDevice, getDb, getInventory, initializeDatabase, type DbUser } from "./db";
import { getActiveDeviceMedia } from "./public-device-media";
import { isDigitalInventory } from "./inventory-delivery";
import { resolveDeviceTemplate } from "../component/device-templates";
import { campaignSlides } from "./digital-schedule";
import { validatePlayback } from "./playback-validation";
export const playerCookie = "easyad_player";
export class PlayerError extends Error {
    constructor(public status: number, message: string) { super(message); }
}
export function playersEnabled() { return process.env.FEATURE_PLAYER_CONTROL === "true"; }
export function playerTiming(): PlayerTiming {
    // Every paired player remains responsive to emergency updates, even if an
    // installation configured a slower ordinary-content interval.
    const pollMs = setting("PLAYER_POLL_MS", 10000, 1000, 10000);
    const heartbeatMs = setting("PLAYER_HEARTBEAT_MS", 30000, 5000, 120000);
    return { pollMs, heartbeatMs, staleMs: Math.max(heartbeatMs * 3, setting("PLAYER_STALE_MS", 90000, 15000, 600000)) };
}
function setting(name: string, fallback: number, min: number, max: number) {
    const value = Number(process.env[name] ?? fallback);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
}
function offlineLeaseSeconds() { return setting("PLAYER_OFFLINE_LEASE_SECONDS", 86400, 60, 86400); }
export function hashPlayerSecret(value: string) { return createHash("sha256").update(value).digest("hex"); }
type PlayerRow = {
    id: string;
    inventory_id: string;
    institution_id: string | null;
    revoked_at: Date | null;
    expected_revision: number;
    received_revision: number;
    validated_revision: number;
    applied_revision: number;
    last_seen_at: Date | null;
    applied_at: Date | null;
    last_error: string | null;
    last_error_at: Date | null;
};
async function transaction<T>(run: (client: PoolClient) => Promise<T>) {
    await initializeDatabase();
    const client = await getDb().connect();
    try {
        await client.query("BEGIN");
        const result = await run(client);
        await client.query("COMMIT");
        return result;
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
async function ownedScreen(user: DbUser, inventoryId: string) {
    const inventory = await getInventory(inventoryId);
    if (!inventory || !canPublishInventoryRecord(user, inventory))
        throw new PlayerError(403, "Screen owner access is required.");
    if (!isDigitalInventory(inventory))
        throw new PlayerError(422, "Only digital screens can pair a player.");
    return inventory;
}
export async function createPairingCode(user: DbUser, inventoryId: string) {
    await ownedScreen(user, inventoryId);
    return transaction(async (client) => {
        await client.query("SELECT id FROM inventory WHERE id=$1 FOR UPDATE", [inventoryId]);
        if ((await client.query("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [inventoryId])).rowCount) {
            throw new PlayerError(409, "Disconnect the current player before pairing a replacement.");
        }
        const code = randomBytes(6).toString("hex").toUpperCase();
        const expiresAt = new Date(Date.now() + 10 * 60000).toISOString();
        await client.query(`INSERT INTO player_pairing_codes (inventory_id,code_hash,created_by,expires_at) VALUES ($1,$2,$3,$4)
      ON CONFLICT(inventory_id) DO UPDATE SET code_hash=EXCLUDED.code_hash,created_by=EXCLUDED.created_by,expires_at=EXCLUDED.expires_at,used_at=NULL`, [inventoryId, hashPlayerSecret(code), user.id, expiresAt]);
        return { code, expiresAt };
    });
}
export async function redeemPairingCode(rawCode: unknown, clientKey: string) {
    await initializeDatabase();
    // Database-backed limits work across stateless instances. No raw client address is retained.
    for (const [bucket, limit] of [["global", 300], [hashPlayerSecret(clientKey), 10]] as const) {
        const result = await getDb().query<{
            attempts: number;
        }>(`INSERT INTO player_pairing_limits (bucket,attempts,expires_at)
      VALUES ($1,1,NOW()+INTERVAL '1 minute') ON CONFLICT(bucket) DO UPDATE SET
      attempts=CASE WHEN player_pairing_limits.expires_at<=NOW() THEN 1 ELSE player_pairing_limits.attempts+1 END,
      expires_at=CASE WHEN player_pairing_limits.expires_at<=NOW() THEN NOW()+INTERVAL '1 minute' ELSE player_pairing_limits.expires_at END RETURNING attempts`, [bucket]);
        if (result.rows[0].attempts > limit)
            throw new PlayerError(429, "Too many pairing attempts. Try again in a minute.");
    }
    await getDb().query("DELETE FROM player_pairing_limits WHERE expires_at<NOW()-INTERVAL '10 minutes'");
    const code = typeof rawCode === "string" ? rawCode.replace(/[\s-]/g, "").toUpperCase() : "";
    if (!/^[A-F0-9]{12}$/.test(code))
        throw new PlayerError(422, "Enter a valid, unexpired pairing code.");
    return transaction(async (client) => {
        const candidate = await client.query<{
            inventory_id: string;
            created_by: string;
        }>("SELECT inventory_id,created_by FROM player_pairing_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at>NOW()", [hashPlayerSecret(code)]);
        if (!candidate.rows[0])
            throw new PlayerError(422, "Enter a valid, unexpired pairing code.");
        const { inventory_id: inventoryId, created_by: creator } = candidate.rows[0];
        const inventory = (await client.query<{
            institution_id: string | null;
            format: string;
            delivery_mode: InventoryItem["deliveryMode"];
        }>("SELECT institution_id,format,delivery_mode FROM inventory WHERE id=$1 FOR UPDATE", [inventoryId])).rows[0];
        const owner = (await client.query<{
            role: string;
            status: string;
        }>("SELECT role,status FROM users WHERE id=$1", [creator])).rows[0];
        if (!inventory || !isDigitalInventory({ format: inventory.format as InventoryItem["format"], deliveryMode: inventory.delivery_mode }) || !owner || owner.status !== "active" || !(owner.role === "admin" || (owner.role === "institutional" && inventory.institution_id === creator))) {
            throw new PlayerError(422, "Enter a valid, unexpired pairing code.");
        }
        const consumed = await client.query("UPDATE player_pairing_codes SET used_at=NOW() WHERE inventory_id=$1 AND code_hash=$2 AND used_at IS NULL AND expires_at>NOW() RETURNING inventory_id", [inventoryId, hashPlayerSecret(code)]);
        if (!consumed.rowCount)
            throw new PlayerError(422, "Enter a valid, unexpired pairing code.");
        if ((await client.query("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [inventoryId])).rowCount)
            throw new PlayerError(409, "This screen already has a paired player.");
        const token = randomBytes(32).toString("hex");
        const id = `PLY-${randomUUID()}`;
        await client.query("INSERT INTO players(id,inventory_id,institution_id,credential_hash,created_by) VALUES ($1,$2,$3,$4,$5)", [id, inventoryId, inventory.institution_id, hashPlayerSecret(token), creator]);
        return { token, playerId: id };
    });
}
async function authenticatedPlayer(client: PoolClient, token: string) {
    if (!/^[a-f0-9]{64}$/.test(token))
        throw new PlayerError(401, "Pair this screen to continue.");
    const player = (await client.query<PlayerRow>(`SELECT p.* FROM players p JOIN inventory i ON i.id=p.inventory_id
    LEFT JOIN users u ON u.id=p.institution_id WHERE p.credential_hash=$1 AND p.revoked_at IS NULL
    AND p.institution_id IS NOT DISTINCT FROM i.institution_id
    AND (p.institution_id IS NULL OR (u.status='active' AND u.role='institutional'))
    AND i.delivery_mode='digital' FOR UPDATE OF p`, [hashPlayerSecret(token)])).rows[0];
    if (!player)
        throw new PlayerError(401, "Pair this screen to continue.");
    return player;
}
async function manifestContent(inventoryId: string, client: PoolClient) {
    const inventory = await getInventory(inventoryId, client);
    if (!inventory)
        throw new PlayerError(401, "Pair this screen to continue.");
    const now = Date.now();
    const through = new Date(now + offlineLeaseSeconds() * 1000).toISOString().slice(0, 10);
    const media = await getActiveDeviceMedia(inventoryId, undefined, client, through,true);
    const legacy = await client.query<{
        id: string;
        booking_id: string;
        placement_id: string|null;
        schedule_snapshot: import("./digital-schedule").Allocation | null;
        ad_slots: number;
    }>("SELECT c.id,c.booking_id,p.id placement_id,b.schedule_snapshot,b.ad_slots FROM creatives c JOIN bookings b ON b.id=c.booking_id LEFT JOIN placements p ON p.id='PLC-LEGACY-' || b.id WHERE b.inventory_id=$1 ORDER BY c.created_at DESC,c.id", [inventoryId]);
    const selectedBookings = new Set<string>();
    const candidateAlert = media ? await getActiveDeviceAlertForDevice(inventoryId, undefined, client) : null;
    const activeAlert = candidateAlert?.institutionId === inventory.institutionId ? candidateAlert : null;
    const interval = Math.max(2, Math.min(60, inventory.imageInterval ?? 6));
    return {
        privateContent:inventory.contentVisibility==="private", inventoryId, inventoryName: inventory.name, city: inventory.address, published: Boolean(media),
        imageInterval: interval, template: resolveDeviceTemplate(undefined, inventory.displayTemplate),
        displayLanguage: inventory.displayLanguage ?? "en", activeAlert,
        loopSeconds: inventory.maxLoopSeconds,
        slides: activeAlert ? [] : [...(media?.items ?? []).filter(item => {
                if (item.source !== "advertiser")
                    return true;
                const booking = legacy.rows.find(row => row.id === item.id);
                if (!booking || selectedBookings.has(booking.booking_id))
                    return false;
                selectedBookings.add(booking.booking_id);
                return true;
            }).map((item) => ({
                id: item.id, assetVersion: hashPlayerSecret(`${item.id}:${item.createdAt}:${item.publicUrl}`),
                title: item.title, subtitle: "", mediaType: item.mediaType, publicUrl: item.source==="device"?`/api/player/assets/${encodeURIComponent(item.id)}`:item.publicUrl, createdAt: item.createdAt,
                startsOn: item.startsOn, endsOn: item.endsOn,
                ...(item.source === "advertiser" ? {
                    legacyBookingId: legacy.rows.find(row => row.id === item.id)?.booking_id,
                        placementId: legacy.rows.find(row => row.id === item.id)?.placement_id ?? undefined,
                    allocation: legacy.rows.find(row => row.id === item.id)?.schedule_snapshot ?? undefined,
                } : {}),
                durationSeconds: item.source === "advertiser" ? (legacy.rows.find(row => row.id === item.id)?.schedule_snapshot?.slotSeconds ?? interval) * (legacy.rows.find(row => row.id === item.id)?.ad_slots ?? 1) : interval,
            })), ...(media ? await campaignSlides(client, inventoryId, undefined, through) : [])],
    } satisfies Omit<PlayerManifest, "playerId" | "revision" | "generatedAt" | "validUntil">;
}
async function currentManifest(client: PoolClient, player: PlayerRow): Promise<PlayerManifest> {
    const content = await manifestContent(player.inventory_id, client);
    const hash = hashPlayerSecret(JSON.stringify(content));
    const existing = (await client.query<{
        content_hash: string;
        manifest: PlayerManifest;
    }>("SELECT content_hash,manifest FROM player_manifests WHERE player_id=$1 AND revision=$2", [player.id, player.expected_revision])).rows[0];
    const now = Date.now();
    const contentBoundary = Infinity;
    const previousExpiry = existing ? Date.parse(existing.manifest.validUntil) : 0;
    // Do not create endlessly competing revisions in the last 30 seconds of an alert/date window.
    if (existing?.content_hash === hash && previousExpiry > now && (previousExpiry > now + 30000 || previousExpiry >= contentBoundary))
        return existing.manifest;
    const validUntil = now + (content.privateContent?60:offlineLeaseSeconds()) * 1000;
    const manifest: PlayerManifest = { ...content, playerId: player.id, revision: player.expected_revision + 1, generatedAt: new Date(now).toISOString(), validUntil: new Date(validUntil).toISOString() };
    await client.query("INSERT INTO player_manifests(player_id,revision,content_hash,manifest,valid_until) VALUES ($1,$2,$3,$4::jsonb,$5)", [player.id, manifest.revision, hash, JSON.stringify(manifest), manifest.validUntil]);
    await client.query("UPDATE players SET expected_revision=$2 WHERE id=$1", [player.id, manifest.revision]);
    return manifest;
}
export async function fetchPlayerManifest(token: string) {
    return transaction(async (client) => currentManifest(client, await authenticatedPlayer(client, token)));
}
export async function playerAsset(token: string, versionId: string) {
    return transaction(async (client) => {
        const player = await authenticatedPlayer(client, token);
        const manifest = await currentManifest(client, player);
        if (!manifest.slides.some(slide => slide.creativeVersionId === versionId || slide.id === versionId))
            throw new PlayerError(404, "Media is not authorized for this player.");
        const asset = (await client.query<{
            storage_path: string;
            mime_type: string;
            checksum: string;
            size_bytes: string;
        }>("SELECT storage_path,mime_type,checksum,size_bytes FROM creative_versions WHERE id=$1 UNION ALL SELECT storage_path,mime_type,id checksum,size_bytes FROM media_resources WHERE id=$1", [versionId])).rows[0];
        if (!asset || Number(asset.size_bytes) > 256 * 1024 * 1024)
            throw new PlayerError(413, "Media exceeds the player storage budget.");
        return asset;
    });
}
export async function ingestPlayback(token: string, body: Record<string, unknown>) {
    return transaction(async (client) => {
        const player = await authenticatedPlayer(client, token);
        const requestHash = hashPlayerSecret(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)))));
        const existing = (await client.query<{
            id: string;
            request_hash: string;
        }>("SELECT id,request_hash FROM digital_delivery_events WHERE player_id=$1 AND idempotency_key=$2", [player.id, `${player.id}:${String(body.eventId)}`])).rows[0];
        if (existing) {
            if (existing.request_hash !== requestHash)
                throw new PlayerError(409, "Playback identity was reused for different evidence.");
            return { eventId: String(body.eventId), recordId: existing.id };
        }
        if (!Number.isSafeInteger(body.revision))
            throw new PlayerError(422, "Invalid playback revision.");
        const manifest = (await client.query<{
            manifest: PlayerManifest;
        }>("SELECT manifest FROM player_manifests WHERE player_id=$1 AND revision=$2", [player.id, body.revision])).rows[0]?.manifest;
        if (!manifest)
            throw new PlayerError(422, "Unknown playback revision.");
        let validated;
        try {
            validated = validatePlayback(body, manifest);
        }
        catch (error) {
            throw new PlayerError(422, (error as Error).message);
        }
        const { event, slide, late } = validated;
        const collision = await client.query("SELECT id FROM digital_delivery_events WHERE player_id=$1 AND session_id=$2 AND sequence=$3 AND provenance='authenticated_player'", [player.id, event.sessionId, event.sequence]);
        if (collision.rowCount)
            throw new PlayerError(409, "Playback sequence was reused.");
        const recordId = `DVE-${randomUUID()}`;
        const eventType = event.outcome === "completed" ? "delivered" : event.outcome === "interrupted" ? "partial" : "unverifiable";
        await client.query(`INSERT INTO digital_delivery_events (id,placement_id,idempotency_key,creative_version_id,event_type,player_id,occurred_at,received_at,evidence,provenance,manifest_revision,session_id,sequence,request_hash,late,retention_until)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,'authenticated_player',$10,$11,$12,$13,$14,NOW()+INTERVAL '7 years')`, [recordId, slide.placementId ?? null, `${player.id}:${event.eventId}`, slide.creativeVersionId ?? null, eventType, player.id, event.occurredAt, new Date().toISOString(), JSON.stringify(event), event.revision, event.sessionId, event.sequence, requestHash, late]);
        if (slide.placementId && event.outcome !== "completed")
            await client.query("INSERT INTO placement_issues(id,placement_id,issue_type,detail,created_at,delivery_event_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING", [`ISS-${randomUUID()}`, slide.placementId, eventType, `Authenticated player reported ${event.outcome}; no completed play claimed.`, new Date().toISOString(), recordId]);
        return { eventId: event.eventId, recordId };
    });
}
export async function heartbeatPlayer(token: string, body: Record<string, unknown>) {
    const errorCodes = ["media_unavailable", "manifest_expired", "connection_lost", "storage_unavailable"];
    if (body.error !== undefined && body.error !== null && !errorCodes.includes(String(body.error)))
        throw new PlayerError(422, "Invalid player status.");
    return transaction(async (client) => {
        const player = await authenticatedPlayer(client, token);
        await client.query(`UPDATE players SET last_seen_at=NOW(),last_error=COALESCE($2,last_error),
      last_error_at=CASE WHEN $2::text IS NOT NULL THEN NOW() ELSE last_error_at END WHERE id=$1`, [player.id, body.error ?? null]);
        return { accepted: true };
    });
}
export async function acknowledgePlayer(token: string, body: Record<string, unknown>) {
    const stages = ["received", "validated", "applied"] as const;
    if (!Number.isSafeInteger(body.revision) || Number(body.revision) < 1 || !stages.includes(body.stage as typeof stages[number]))
        throw new PlayerError(422, "Invalid content acknowledgment.");
    return transaction(async (client) => {
        const player = await authenticatedPlayer(client, token);
        const revision = Number(body.revision);
        const existing = await client.query("SELECT revision FROM player_manifests WHERE player_id=$1 AND revision=$2 AND valid_until>NOW()", [player.id, revision]);
        if (!existing.rowCount || revision !== player.expected_revision)
            throw new PlayerError(409, "Retrieve the latest content before acknowledging it.");
        const stage = body.stage as typeof stages[number];
        if ((stage === "validated" && player.received_revision < revision) || (stage === "applied" && player.validated_revision < revision))
            throw new PlayerError(409, "Acknowledge content preparation first.");
        const column = `${stage}_revision`;
        const result = await client.query(`UPDATE players SET ${column}=$2,last_seen_at=NOW()
      ${stage === "applied" ? ",applied_at=NOW()" : ""} WHERE id=$1 AND ${column}<$2 RETURNING id`, [player.id, revision]);
        const manifestRow=(await client.query<{manifest:PlayerManifest}>("SELECT manifest FROM player_manifests WHERE player_id=$1 AND revision=$2",[player.id,revision])).rows[0];
        const alertId=manifestRow?.manifest.activeAlert?.id;
        if(alertId&&(stage==="received"||stage==="applied")){const col=stage==="received"?"received_at":"applied_at";await client.query(`INSERT INTO player_alert_state(player_id,alert_id,revision,${col}) VALUES($1,$2,$3,NOW()) ON CONFLICT(player_id,alert_id) DO UPDATE SET ${col}=COALESCE(player_alert_state.${col},NOW()),revision=EXCLUDED.revision`,[player.id,alertId,revision]);}
        return { revision, stage, deduplicated: !result.rowCount };
    });
}
export async function revokePlayer(user: DbUser, inventoryId: string, expectedPlayerId: unknown) {
    await ownedScreen(user, inventoryId);
    if (typeof expectedPlayerId !== "string")
        throw new PlayerError(422, "Choose the player to disconnect.");
    return transaction(async (client) => {
        await client.query("SELECT id FROM inventory WHERE id=$1 FOR UPDATE", [inventoryId]);
        const active = (await client.query<{
            id: string;
        }>("SELECT id FROM players WHERE inventory_id=$1 AND revoked_at IS NULL", [inventoryId])).rows[0];
        if (active && active.id !== expectedPlayerId)
            throw new PlayerError(409, "The paired player changed. Refresh before disconnecting.");
        await client.query("UPDATE players SET revoked_at=NOW() WHERE id=$1 AND inventory_id=$2 AND revoked_at IS NULL", [expectedPlayerId, inventoryId]);
        await client.query("DELETE FROM player_pairing_codes WHERE inventory_id=$1", [inventoryId]);
        return { disconnected: true };
    });
}
export async function playerStatus(user: DbUser, inventoryId: string): Promise<PlayerStatus> {
    await ownedScreen(user, inventoryId);
    return transaction(async (client) => {
        const player = (await client.query<PlayerRow>("SELECT * FROM players WHERE inventory_id=$1 AND revoked_at IS NULL FOR UPDATE", [inventoryId])).rows[0];
        if (!player)
            return { enabled: true, player: null };
        const manifest = await currentManifest(client, player);
        return { enabled: true, player: {
                id: player.id, connection: !player.last_seen_at ? "waiting" : Date.now() - player.last_seen_at.getTime() > playerTiming().staleMs ? "stale" : "online",
                lastSeenAt: player.last_seen_at?.toISOString() ?? null, expectedRevision: manifest.revision,
                receivedRevision: player.received_revision, validatedRevision: player.validated_revision, appliedRevision: player.applied_revision,
                appliedAt: player.applied_at?.toISOString() ?? null, lastError: player.last_error, lastErrorAt: player.last_error_at?.toISOString() ?? null,
                lastPlaybackAt: (await client.query<{
                    occurred_at: string;
                }>("SELECT occurred_at FROM digital_delivery_events WHERE player_id=$1 AND provenance='authenticated_player' AND event_type='delivered' ORDER BY occurred_at DESC LIMIT 1", [player.id])).rows[0]?.occurred_at ?? null,
            } };
    });
}

// Render reports come only from the visible authenticated runtime, never dashboard previews.
export async function reportAlertRender(token:string,body:Record<string,unknown>){
 if(!Number.isSafeInteger(body.revision)||!(body.alertId===null||typeof body.alertId==="string"))throw new PlayerError(422,"Invalid alert render report");
 return transaction(async client=>{const player=await authenticatedPlayer(client,token);
 const row=(await client.query<{manifest:PlayerManifest}>("SELECT manifest FROM player_manifests WHERE player_id=$1 AND revision=$2 AND valid_until>NOW()",[player.id,body.revision])).rows[0];
 if(!row||player.applied_revision!==body.revision||!row.manifest.published)throw new PlayerError(409,"Apply the current manifest first");
 const active=row.manifest.activeAlert&&Date.parse(row.manifest.activeAlert.expiresAt)>Date.now()?row.manifest.activeAlert:null;
 if((active?.id??null)!==body.alertId)throw new PlayerError(422,"Alert is outside this manifest");
 if(active)await client.query("UPDATE player_alert_state SET rendered_at=COALESCE(rendered_at,NOW()) WHERE player_id=$1 AND alert_id=$2",[player.id,active.id]);
 else await client.query("UPDATE player_alert_state s SET restored_at=COALESCE(restored_at,NOW()) FROM device_alerts a WHERE s.alert_id=a.id AND s.player_id=$1 AND (a.status='ended' OR a.expires_at::timestamptz<=NOW())",[player.id]);
 return {accepted:true};});
}
