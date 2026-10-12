import type { Booking, InventoryItem } from "../data";
import { getDb, initializeDatabase, listInventory } from "./db";
import { bookingDelivery, type DeclarationGroup, type DeliveryEventGroup } from "./delivery-report";

/** Call only with bookings already authorized for the viewer. No credentials,
 * raw manifests, private media URLs or cross-booking evidence leave this layer.
 */
export async function bookingDeliveries(bookings: Booking[], inventory?: InventoryItem[], asOf = new Date()) {
  if (!bookings.length) return [];
  await initializeDatabase();
  const ids = bookings.map(b => b.id);
  const screens = inventory ?? await listInventory();
  const [snapshots, events, declarations] = await Promise.all([
    getDb().query<{ id: string; schedule_snapshot: unknown }>("SELECT id,schedule_snapshot FROM bookings WHERE id=ANY($1::text[])", [ids]),
    getDb().query<DeliveryEventGroup>(`
      SELECT COALESCE(b.id,slide->>'legacyBookingId') booking_id,
        COALESCE(e.creative_version_id,e.evidence->>'slideId',slide->>'id','Unknown creative') creative_id,e.event_type,e.late,COUNT(*) count
      FROM digital_delivery_events e
      LEFT JOIN bookings b ON e.placement_id='PLC-LEGACY-' || b.id
      LEFT JOIN player_manifests m ON e.placement_id IS NULL AND m.player_id=e.player_id AND m.revision=e.manifest_revision
      LEFT JOIN LATERAL jsonb_array_elements(COALESCE(m.manifest->'slides','[]'::jsonb)) slide
        ON slide->>'id'=e.evidence->>'slideId' AND slide->>'assetVersion'=e.evidence->>'assetVersion'
      WHERE e.provenance='authenticated_player' AND e.occurred_at<=$2
        AND COALESCE(b.id,slide->>'legacyBookingId')=ANY($1::text[])
      GROUP BY COALESCE(b.id,slide->>'legacyBookingId'),COALESCE(e.creative_version_id,e.evidence->>'slideId',slide->>'id','Unknown creative'),e.event_type,e.late`, [ids, asOf.toISOString()]),
    getDb().query<DeclarationGroup>(`
      SELECT booking_id,CASE WHEN id LIKE 'POP-DEMO-%' OR id LIKE 'POP-TB-%' OR source IN ('demo-delivery-tick','demo-seed')
        THEN 'demo' ELSE 'operator_declaration' END provenance,status,SUM(plays) plays
      FROM pop_logs WHERE booking_id=ANY($1::text[]) AND played_at<=$2
      GROUP BY booking_id,provenance,status`, [ids, asOf.toISOString()]),
  ]);
  const snapshotById = new Map(snapshots.rows.map(row => [row.id, row.schedule_snapshot]));
  const screenById = new Map(screens.map(screen => [screen.id, screen]));
  return bookings.map(booking => bookingDelivery(booking, screenById.get(booking.inventoryId), snapshotById.get(booking.id), events.rows, declarations.rows, asOf.valueOf()));
}
