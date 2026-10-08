import { canPublishInventoryRecord } from "./auth";
import { getDb, getInventory, initializeDatabase, type DbUser } from "./db";
import { fleetAudit } from "./fleet";

export class ScreenUseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * Change one screen between institution use and private-sector advertising.
 * The rules match the owner fleet policy (ADR 0006): only the owner or a Super
 * Admin may change it, a private screen cannot carry advertising, and the
 * choice is locked while advertising commitments are active on the screen.
 */
export async function setScreenUse(user: DbUser, inventoryId: string, use: unknown, expectedVersion?: unknown) {
  if (use !== "institution" && use !== "advertising") throw new ScreenUseError(422, "Choose institution use or private-sector advertising");
  await initializeDatabase();
  const screen = await getInventory(inventoryId);
  if (!screen) throw new ScreenUseError(404, "Screen not found");
  if (!screen.institutionId) throw new ScreenUseError(422, "Only institution screens have a screen use setting");
  if (!canPublishInventoryRecord(user, screen)) throw new ScreenUseError(403, "Only the owning institution can change screen use");
  const optIn = use === "advertising";
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const locked = (await client.query("SELECT * FROM inventory WHERE id=$1 FOR UPDATE", [inventoryId])).rows[0];
    if (!locked) throw new ScreenUseError(404, "Screen not found");
    if (expectedVersion !== undefined && expectedVersion !== null && Number(expectedVersion) !== locked.fleet_version) {
      throw new ScreenUseError(409, "Screen changed; refresh before retrying");
    }
    if (locked.advertising_opt_in === optIn) {
      await client.query("COMMIT");
      return { item: (await getInventory(inventoryId))!, changed: false };
    }
    if (optIn && locked.content_visibility === "private") throw new ScreenUseError(422, "Private screens must be excluded from marketplace advertising");
    const commitments = await client.query(
      "SELECT id FROM placements WHERE inventory_id=$1 AND status IN ('confirmed','ready_for_fulfillment','live') UNION ALL SELECT id FROM bookings WHERE inventory_id=$1 AND status IN ('approved','scheduled','live')",
      [inventoryId],
    );
    if (commitments.rowCount) throw new ScreenUseError(409, "Existing commitments must finish before changing advertising or privacy policy");
    await client.query("UPDATE inventory SET advertising_opt_in=$2, fleet_version=fleet_version+1 WHERE id=$1", [inventoryId, optIn]);
    await fleetAudit(user, inventoryId, optIn ? "screen_use_advertising" : "screen_use_institution", locked.fleet_version + 1, "success", "ordinary", client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { item: (await getInventory(inventoryId))!, changed: true };
}
