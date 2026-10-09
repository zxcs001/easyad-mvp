// Relays official Alert Ready messages (NAAD System, CAP-CP) to the screens
// inside each alert's area. Server only. Decision record: ADR 0010.
//
// - Every Actual alert or update that covers an institution's screens is
//   stored with its matched screens and appears in that institution's
//   Emergency updates page.
// - "Ask me first" (the default) waits for a person to choose Show on screens.
// - "Show automatically" shows a Broadcast Immediately alert at once, but only
//   when its NAAD signature verifies against a configured Pelmorex certificate.
// - A Cancel, or an Update, ends the screen messages of the alerts it refers to.
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { DeviceAlertType, InventoryItem } from "../../data";
import { getDb, initializeDatabase, listInventoryByInstitution } from "../db";
import { isDigitalInventory } from "../inventory-delivery";
import { capKey, parseCap, trustedCertificatesFromEnvironment, verifyCapSignature, type CapAlert, type CapInfo, type CapReference, type SignatureResult } from "./cap";
import { matchScreens, type AreaMatch } from "./match";

export type AlertReadyMode = "off" | "review" | "automatic";
export const ALERT_READY_MODES: AlertReadyMode[] = ["off", "review", "automatic"];
export const RELAYED_ISSUER = "Alert Ready (NAAD System)";
const RELAYED_ISSUER_FR = "En Alerte (système ADNA)";
const MAX_SCREEN_MESSAGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_SCREEN_MESSAGE_MS = 60 * 60 * 1000;
const MAX_RAW_XML = 512 * 1024;
const FEED_ROW = "naad";

export function alertReadyEnabled() {
  return process.env.FEATURE_ALERT_READY === "true";
}

export type IngestResult =
  | { kind: "heartbeat"; missing: CapReference[] }
  | { kind: "duplicate"; key: string }
  | { kind: "ignored"; key: string; reason: string }
  | { kind: "alert"; key: string; signature: SignatureResult; matchedInstitutions: number; matchedScreens: number; shownAlertIds: string[]; endedAlertIds: string[] };

/** Stores one CAP message from the feed and applies it. Safe to call twice with the same message. */
export async function ingestCapMessage(xml: string, receivedVia: string, now = new Date()): Promise<IngestResult> {
  const alert = parseCap(xml);
  await initializeDatabase();
  const db = getDb();
  if (alert.isHeartbeat) {
    await db.query(`INSERT INTO alert_ready_feed(id,last_heartbeat_at,updated_at) VALUES($1,$2,$2)
      ON CONFLICT(id) DO UPDATE SET last_heartbeat_at=EXCLUDED.last_heartbeat_at,updated_at=EXCLUDED.updated_at`, [FEED_ROW, now.toISOString()]);
    const keys = alert.references.map(capKey);
    const known = keys.length ? (await db.query<{ key: string }>("SELECT key FROM official_alerts WHERE key=ANY($1::text[])", [keys])).rows.map((row) => row.key) : [];
    return { kind: "heartbeat", missing: alert.references.filter((reference) => !known.includes(capKey(reference))) };
  }
  const key = capKey(alert);
  const signature = verifyCapSignature(xml, trustedCertificatesFromEnvironment());
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('alert-ready'), 0)");
    const inserted = await client.query(`INSERT INTO official_alerts
      (key,identifier,sender,sent,status,msg_type,reference_keys,event,broadcast_immediately,signature,expires_at,infos,raw_xml,received_via,received_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12::jsonb,$13,$14,$15) ON CONFLICT(key) DO NOTHING`, [
      key, alert.identifier, alert.sender, alert.sent, alert.status, alert.msgType, JSON.stringify(alert.references.map(capKey)),
      primaryInfo(alert)?.eventCode ?? primaryInfo(alert)?.event ?? "", alert.infos.some((info) => info.broadcastImmediately), signature,
      latestExpiry(alert), JSON.stringify(alert.infos), Buffer.byteLength(xml) <= MAX_RAW_XML ? xml : null, receivedVia.slice(0, 120), now.toISOString(),
    ]);
    if (!inserted.rowCount) { await client.query("COMMIT"); return { kind: "duplicate", key }; }
    await client.query(`INSERT INTO alert_ready_feed(id,last_alert_at,updated_at) VALUES($1,$2,$2)
      ON CONFLICT(id) DO UPDATE SET last_alert_at=EXCLUDED.last_alert_at,updated_at=EXCLUDED.updated_at`, [FEED_ROW, now.toISOString()]);

    // Exercise, Test and Draft messages are kept for the record but never reach a screen.
    if (alert.status !== "Actual" || !["Alert", "Update", "Cancel"].includes(alert.msgType)) {
      await client.query("COMMIT");
      return { kind: "ignored", key, reason: `${alert.status} ${alert.msgType}` };
    }

    // An Update replaces, and a Cancel withdraws, the alerts it refers to.
    const endedAlertIds = alert.msgType === "Alert" || !alert.references.length ? [] : (await client.query<{ id: string }>(
      "UPDATE device_alerts SET status='ended',ended_at=$1 WHERE official_alert_key=ANY($2::text[]) AND status='active' RETURNING id",
      [now.toISOString(), alert.references.map(capKey)],
    )).rows.map((row) => row.id);
    if (alert.msgType === "Cancel" || !alert.infos.length || (latestExpiry(alert) && Date.parse(latestExpiry(alert)!) <= now.getTime())) {
      await client.query("COMMIT");
      return { kind: "alert", key, signature, matchedInstitutions: 0, matchedScreens: 0, shownAlertIds: [], endedAlertIds };
    }

    const screens = await relayableScreens(client);
    const matches = new Map<string, { screen: RelayScreen; match: AreaMatch }>();
    for (const info of alert.infos) for (const found of matchScreens(info, screens)) if (!matches.has(found.inventoryId)) matches.set(found.inventoryId, { screen: screens.find((screen) => screen.id === found.inventoryId)!, match: found.match });
    for (const { screen, match } of matches.values()) {
      await client.query("INSERT INTO official_alert_matches(alert_key,institution_id,inventory_id,area_match) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [key, screen.institutionId, screen.id, match]);
    }
    const institutions = [...new Set([...matches.values()].map(({ screen }) => screen.institutionId))];
    const shownAlertIds: string[] = [];
    // Update messages keep the screens that the replaced alert was already showing.
    const replacing = endedAlertIds.length > 0;
    for (const institutionId of institutions) {
      const mode = await institutionMode(client, institutionId);
      const automatic = mode === "automatic" && alert.infos.some((info) => info.broadcastImmediately) && signature === "verified";
      if (mode === "off") continue;
      if (!automatic && !(replacing && await replacedWasShown(client, alert, institutionId))) continue;
      const screensForInstitution = [...matches.values()].filter(({ screen }) => screen.institutionId === institutionId).map(({ screen }) => screen);
      shownAlertIds.push(...await insertRelayedAlerts(client, alert, key, institutionId, screensForInstitution, null, now));
    }
    await client.query("COMMIT");
    return { kind: "alert", key, signature, matchedInstitutions: institutions.length, matchedScreens: matches.size, shownAlertIds, endedAlertIds };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

type RelayScreen = Pick<InventoryItem, "id" | "name" | "latitude" | "longitude" | "x" | "y" | "displayLanguage"> & { institutionId: string };

// Published, digital, institution-owned screens. Private screens are included:
// a paired private player still shows public-safety messages.
async function relayableScreens(client: PoolClient): Promise<RelayScreen[]> {
  const result = await client.query<{ id: string; name: string; latitude: number | null; longitude: number | null; x: number; y: number; display_language: string | null; institution_id: string; format: string; delivery_mode: string | null }>(
    "SELECT id,name,latitude,longitude,x,y,display_language,institution_id,format,delivery_mode FROM inventory WHERE institution_id IS NOT NULL AND approval_status='approved'",
  );
  return result.rows
    .filter((row) => isDigitalInventory({ format: row.format as InventoryItem["format"], deliveryMode: (row.delivery_mode ?? undefined) as InventoryItem["deliveryMode"] }))
    .map((row) => ({ id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude, x: Number(row.x), y: Number(row.y), displayLanguage: row.display_language === "fr" ? "fr" : "en", institutionId: row.institution_id }));
}

async function institutionMode(client: PoolClient, institutionId: string): Promise<AlertReadyMode> {
  const mode = (await client.query<{ mode: AlertReadyMode }>("SELECT mode FROM alert_ready_settings WHERE institution_id=$1", [institutionId])).rows[0]?.mode;
  return mode && ALERT_READY_MODES.includes(mode) ? mode : "review";
}

async function replacedWasShown(client: PoolClient, alert: CapAlert, institutionId: string) {
  return Boolean((await client.query("SELECT 1 FROM device_alerts WHERE institution_id=$1 AND official_alert_key=ANY($2::text[]) LIMIT 1", [institutionId, alert.references.map(capKey)])).rowCount);
}

/**
 * One screen message per display language, so a French screen shows the
 * French text of a bilingual alert. Relayed messages skip the overlap check:
 * an official alert takes the screen even over an institution's own override,
 * and the override returns when the official alert ends.
 */
async function insertRelayedAlerts(client: PoolClient, alert: CapAlert, key: string, institutionId: string, screens: RelayScreen[], actorId: string | null, now: Date) {
  const ids: string[] = [];
  for (const language of ["en", "fr"] as const) {
    const targets = screens.filter((screen) => (screen.displayLanguage ?? "en") === language);
    if (!targets.length) continue;
    const info = infoFor(alert, language);
    if (!info) continue;
    const id = `ALT-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const expires = Math.min(Date.parse(info.expires ?? "") || now.getTime() + DEFAULT_SCREEN_MESSAGE_MS, now.getTime() + MAX_SCREEN_MESSAGE_MS);
    await client.query(`INSERT INTO device_alerts
      (id,institution_id,alert_type,title,message,area,status,target_device_ids,issued_by,created_by,created_at,expires_at,ended_at,image,image_storage_path,source,official_alert_key)
      VALUES ($1,$2,$3,$4,$5,$6,'active',$7::jsonb,$8,$9,$10,$11,NULL,NULL,NULL,'alert-ready',$12)`, [
      id, institutionId, alertTypeFor(info), screenTitle(info), screenMessage(info), screenArea(info), JSON.stringify(targets.map((screen) => screen.id)),
      language === "fr" ? RELAYED_ISSUER_FR : RELAYED_ISSUER, actorId, now.toISOString(), new Date(expires).toISOString(), key,
    ]);
    ids.push(id);
  }
  return ids;
}

/** "Show on screens" for an institution that asks first. */
export async function showOfficialAlert(key: string, institutionId: string, actorId: string, now = new Date()) {
  await initializeDatabase();
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('alert-ready'), 0)");
    const stored = (await client.query<{ key: string; identifier: string; sender: string; sent: string; status: CapAlert["status"]; msg_type: CapAlert["msgType"]; infos: CapInfo[]; expires_at: string | null }>("SELECT * FROM official_alerts WHERE key=$1", [key])).rows[0];
    if (!stored) throw new RelayError(404, "This alert is no longer available.");
    if (stored.status !== "Actual" || stored.msg_type === "Cancel") throw new RelayError(409, "Only an active official alert can be shown.");
    if (stored.expires_at && Date.parse(stored.expires_at) <= now.getTime()) throw new RelayError(409, "This alert has expired.");
    const superseded = (await client.query("SELECT 1 FROM official_alerts WHERE reference_keys ? $1 LIMIT 1", [key])).rowCount;
    if (superseded) throw new RelayError(409, "A newer message replaced or cancelled this alert.");
    if ((await client.query("SELECT 1 FROM device_alerts WHERE official_alert_key=$1 AND institution_id=$2 AND status='active' AND expires_at>$3 LIMIT 1", [key, institutionId, now.toISOString()])).rowCount) {
      throw new RelayError(409, "This alert is already showing on your screens.");
    }
    const screenIds = (await client.query<{ inventory_id: string }>("SELECT inventory_id FROM official_alert_matches WHERE alert_key=$1 AND institution_id=$2", [key, institutionId])).rows.map((row) => row.inventory_id);
    const screens = (await listInventoryByInstitution(institutionId)).filter((screen) => screenIds.includes(screen.id) && screen.approvalStatus === "approved" && isDigitalInventory(screen))
      .map((screen) => ({ ...screen, institutionId }));
    if (!screens.length) throw new RelayError(409, "None of your published screens are inside this alert's area now.");
    const alert = { identifier: stored.identifier, sender: stored.sender, sent: stored.sent, status: stored.status, msgType: stored.msg_type, scope: "Public", references: [], infos: stored.infos, isHeartbeat: false, signatureCount: 0 } satisfies CapAlert;
    const ids = await insertRelayedAlerts(client, alert, key, institutionId, screens, actorId, now);
    await client.query("COMMIT");
    return ids;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export class RelayError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function setAlertReadyMode(institutionId: string, mode: AlertReadyMode, actorId: string) {
  if (!ALERT_READY_MODES.includes(mode)) throw new RelayError(400, "Choose Off, Ask me first, or Show automatically.");
  await initializeDatabase();
  await getDb().query(`INSERT INTO alert_ready_settings(institution_id,mode,updated_by,updated_at) VALUES($1,$2,$3,$4)
    ON CONFLICT(institution_id) DO UPDATE SET mode=EXCLUDED.mode,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`, [institutionId, mode, actorId, new Date().toISOString()]);
  return mode;
}

export type OfficialAlertSummary = {
  key: string;
  event: string;
  headline: string;
  headlineFr: string | null;
  areaDescription: string;
  sent: string;
  expiresAt: string | null;
  msgType: string;
  broadcastImmediately: boolean;
  signature: SignatureResult;
  screens: { id: string; name: string; match: AreaMatch }[];
  state: "showing" | "waiting" | "ended" | "expired" | "replaced";
  showingAlertIds: string[];
};

/** The Emergency updates page: settings, feed health and the alerts that cover this institution's screens. */
export async function alertReadySnapshot(institutionId: string, now = new Date()) {
  await initializeDatabase();
  const db = getDb();
  const [mode, feed, alerts] = await Promise.all([
    db.query<{ mode: AlertReadyMode }>("SELECT mode FROM alert_ready_settings WHERE institution_id=$1", [institutionId]),
    db.query<{ last_heartbeat_at: string | null; last_alert_at: string | null }>("SELECT last_heartbeat_at,last_alert_at FROM alert_ready_feed WHERE id=$1", [FEED_ROW]),
    db.query<{ key: string; event: string; sent: string; expires_at: string | null; msg_type: string; broadcast_immediately: boolean; signature: SignatureResult; infos: CapInfo[]; screens: { id: string; name: string; match: AreaMatch }[]; showing: string[]; shown: number; superseded: boolean }>(`
      SELECT a.key,a.event,a.sent,a.expires_at,a.msg_type,a.broadcast_immediately,a.signature,a.infos,
        json_agg(json_build_object('id',i.id,'name',i.name,'match',m.area_match) ORDER BY i.name) screens,
        COALESCE((SELECT json_agg(d.id) FROM device_alerts d WHERE d.official_alert_key=a.key AND d.institution_id=$1 AND d.status='active' AND d.expires_at>$2),'[]'::json) showing,
        (SELECT COUNT(*) FROM device_alerts d WHERE d.official_alert_key=a.key AND d.institution_id=$1)::int shown,
        EXISTS(SELECT 1 FROM official_alerts n WHERE n.reference_keys ? a.key) superseded
      FROM official_alerts a JOIN official_alert_matches m ON m.alert_key=a.key AND m.institution_id=$1 JOIN inventory i ON i.id=m.inventory_id
      GROUP BY a.key ORDER BY a.sent DESC LIMIT 20`, [institutionId, now.toISOString()]),
  ]);
  const heartbeat = feed.rows[0]?.last_heartbeat_at ?? null;
  return {
    enabled: alertReadyEnabled(),
    mode: mode.rows[0]?.mode ?? "review",
    signatureConfigured: trustedCertificatesFromEnvironment().length > 0,
    feed: { lastHeartbeatAt: heartbeat, lastAlertAt: feed.rows[0]?.last_alert_at ?? null, healthy: Boolean(heartbeat && now.getTime() - Date.parse(heartbeat) < 3 * 60 * 1000) },
    alerts: alerts.rows.map((row): OfficialAlertSummary => {
      const english = row.infos.find((info) => info.language.toLowerCase().startsWith("en")) ?? row.infos[0];
      const french = row.infos.find((info) => info.language.toLowerCase().startsWith("fr"));
      const expired = Boolean(row.expires_at && Date.parse(row.expires_at) <= now.getTime());
      return {
        key: row.key, event: row.event, headline: english ? screenTitle(english) : row.event, headlineFr: french ? screenTitle(french) : null,
        areaDescription: english ? screenArea(english) : "", sent: row.sent, expiresAt: row.expires_at, msgType: row.msg_type,
        broadcastImmediately: row.broadcast_immediately, signature: row.signature, screens: row.screens, showingAlertIds: row.showing,
        state: row.showing.length ? "showing" : row.superseded ? "replaced" : expired ? "expired" : row.shown ? "ended" : "waiting",
      };
    }),
  };
}

// --- Screen text --------------------------------------------------------------

function primaryInfo(alert: CapAlert) {
  return infoFor(alert, "en");
}

function infoFor(alert: Pick<CapAlert, "infos">, language: "en" | "fr") {
  return alert.infos.find((info) => info.language.toLowerCase().startsWith(language)) ?? alert.infos[0] ?? null;
}

function latestExpiry(alert: CapAlert) {
  const times = alert.infos.map((info) => Date.parse(info.expires ?? "")).filter(Number.isFinite);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

const weatherEvents = new Set(["tornado", "thunderstorm", "hurricane", "tropicalStorm", "rainfall", "snowfall", "blizzard", "winterStorm", "wind", "heat", "coldWave", "freezingRain", "fog", "stormSurge", "squall", "dustStorm", "flashFreeze", "arcticOutflow", "snowSquall", "waterspout", "flood", "flashFlood", "airQuality"]);

export function alertTypeFor(info: Pick<CapInfo, "eventCode" | "event" | "responseTypes">): DeviceAlertType {
  const code = info.eventCode ?? "";
  if (code === "amber" || /amber/i.test(info.event)) return "amber";
  if (info.responseTypes.includes("Evacuate")) return "evacuation";
  if (weatherEvents.has(code)) return "weather";
  return "public-safety";
}

function clip(value: string, length: number) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length - 1).trimEnd()}…` : clean;
}

function screenTitle(info: CapInfo) {
  return clip(info.headline || info.event || "Emergency alert", 120);
}

// Instructions first: a passer-by needs what to do more than the background.
function screenMessage(info: CapInfo) {
  return clip([info.instruction, info.description].filter(Boolean).join(" ") || info.headline || info.event, 600);
}

function screenArea(info: CapInfo) {
  return clip(info.areas.map((area) => area.description).filter(Boolean).join(", ") || "Area in the alert", 160);
}
