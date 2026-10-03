import type { InventoryItem } from "../data";
import { getDb, initializeDatabase, listDeviceAlerts, listInventoryByInstitution, type DbUser } from "./db";
import { isDigitalInventory } from "./inventory-delivery";
import { playersEnabled, playerTiming } from "./players";

export type EmergencyTargeting = { mode: "all" | "search"; query?: string; institutionId?: string };
export type EmergencyTarget = Pick<InventoryItem, "id" | "name" | "address">;
export type EmergencyDelivery = {
  alertId: string; inventoryId: string; name: string; playerId: string | null;
  connection: "online" | "offline" | "not-paired";
  receivedAt: string | null; appliedAt: string | null; renderedAt: string | null; restoredAt: string | null;
  deadlineMissed: boolean;
};
export const emergencyDeliveryGoalMs = 120_000;

export async function findEmergencyTargets(user: DbUser, targeting: EmergencyTargeting) {
  const institutionId = user.role === "institutional" ? user.id : targeting.institutionId;
  if (!institutionId) throw new Error("Choose an institution before finding screens.");
  if (!["all", "search"].includes(targeting.mode)) throw new Error("Choose all screens or an area search.");
  const query = typeof targeting.query === "string" ? targeting.query.trim().slice(0, 160) : "";
  if (targeting.mode === "search" && !query) throw new Error("Enter an area, address, building, or screen name.");
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return (await listInventoryByInstitution(institutionId))
    .filter(screen => screen.approvalStatus === "approved" && isDigitalInventory(screen))
    .filter(screen => targeting.mode === "all" || terms.every(term => normalize(`${screen.name} ${screen.address} ${screen.building ?? ""} ${screen.department ?? ""}`).includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function emergencySnapshot(user: DbUser, targeting: EmergencyTargeting) {
  const targets = await findEmergencyTargets(user, targeting);
  const institutionId = user.role === "institutional" ? user.id : targeting.institutionId;
  const alerts = await listDeviceAlerts(institutionId);
  await initializeDatabase();
  const rows = await getDb().query<{
    alert_id: string; inventory_id: string; name: string; player_id: string | null; last_seen_at: Date | null;
    received_at: Date | null; applied_at: Date | null; rendered_at: Date | null; restored_at: Date | null;
  }>(`SELECT a.id alert_id, i.id inventory_id, i.name, p.id player_id, p.last_seen_at,
      s.received_at, s.applied_at, s.rendered_at, s.restored_at
    FROM device_alerts a JOIN inventory i ON a.target_device_ids ? i.id AND i.institution_id=a.institution_id
    LEFT JOIN players p ON p.inventory_id=i.id AND p.revoked_at IS NULL AND p.institution_id=i.institution_id
    LEFT JOIN player_alert_state s ON s.alert_id=a.id AND s.player_id=p.id
    WHERE a.id=ANY($1::text[]) AND a.institution_id=$2 ORDER BY a.created_at DESC, i.name`, [alerts.map(alert => alert.id), institutionId]);
  const now = Date.now();
  const delivery: EmergencyDelivery[] = rows.rows.map(row => {
    const alert = alerts.find(alert => alert.id === row.alert_id)!;
    return {
      alertId: row.alert_id, inventoryId: row.inventory_id, name: row.name, playerId: row.player_id,
      connection: !row.player_id ? "not-paired" : row.last_seen_at && now - row.last_seen_at.getTime() <= playerTiming().staleMs ? "online" : "offline",
      receivedAt: row.received_at?.toISOString() ?? null, appliedAt: row.applied_at?.toISOString() ?? null,
      renderedAt: row.rendered_at?.toISOString() ?? null, restoredAt: row.restored_at?.toISOString() ?? null,
      deadlineMissed: alert.status === "active" && Date.parse(alert.expiresAt) > now && !row.rendered_at && now - Date.parse(alert.createdAt) > emergencyDeliveryGoalMs,
    };
  });
  return { targets: targets.map(({ id, name, address }) => ({ id, name, address })), alerts, delivery, enabled: playersEnabled(), pollMs: playerTiming().pollMs, deliveryGoalMs: emergencyDeliveryGoalMs };
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
