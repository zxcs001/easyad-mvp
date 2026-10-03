import type { PoolClient } from "pg";
import type { PlayerSlide } from "../player-types";
import { isFeatureEnabled } from "./feature-flags";
export class ScheduleError extends Error {
    readonly status = 409;
}
export type Allocation = {
    model: "fixed-slot-v1";
    slotSeconds: number;
    slots: number;
    loopSeconds: number;
    startDate: string;
    endDate: string;
    timezone: "UTC";
    operatingHours: "00:00-24:00";
    dayparts: [
    ];
};
export function allocation(startDate: string, endDate: string, slotSeconds: number, loopSeconds: number, slots = 1): Allocation {
    for (const date of [startDate, endDate])
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
            throw new ScheduleError("Valid UTC schedule dates are required");
    if (endDate < startDate || !Number.isInteger(slots) || slots < 1 || slotSeconds < 2 || loopSeconds < slotSeconds * slots)
        throw new ScheduleError("Invalid digital allocation");
    return { model: "fixed-slot-v1", slotSeconds, slots, loopSeconds, startDate, endDate, timezone: "UTC", operatingHours: "00:00-24:00", dayparts: [] };
}
// Caller holds the inventory row lock. All commitments (including legacy) share this check.
export async function checkDigitalCapacity(client: PoolClient, inventoryId: string, requested: Allocation, exclude: string[] = []) {
    const policy=(await client.query("SELECT advertising_opt_in,content_visibility,reserved_seconds FROM inventory WHERE id=$1",[inventoryId])).rows[0];
    if(policy&&(!policy.advertising_opt_in||policy.content_visibility==="private"))throw new ScheduleError("Owner advertising participation is required");
    const capacity=requested.loopSeconds-Number(policy?.reserved_seconds??0);
    if(requested.slots*requested.slotSeconds>capacity)throw new ScheduleError("Reserved institutional airtime leaves insufficient capacity");
    const result = await client.query<{
        id: string;
        start_date: string;
        end_date: string;
        seconds: number;
        loop_seconds: number;
    }>(`
    SELECT p.id,p.start_date,p.end_date,
      COALESCE((p.schedule_snapshot->>'slotSeconds')::int,i.image_interval)*COALESCE((p.schedule_snapshot->>'slots')::int,1) seconds,
      COALESCE((p.schedule_snapshot->>'loopSeconds')::int,i.max_loop_seconds) loop_seconds
    FROM placements p JOIN inventory i ON i.id=p.inventory_id JOIN campaigns c ON c.id=p.campaign_id
    WHERE p.inventory_id=$1 AND p.delivery_mode='digital' AND p.status IN ('confirmed','ready_for_fulfillment','live')
      AND c.status<>'archived' AND p.id NOT LIKE 'PLC-LEGACY-%' AND NOT(p.id=ANY($2::text[]))
    UNION ALL SELECT b.id,b.start_date,b.end_date,
      COALESCE((b.schedule_snapshot->>'slotSeconds')::int,i.image_interval)*b.ad_slots,
      COALESCE((b.schedule_snapshot->>'loopSeconds')::int,i.max_loop_seconds)
    FROM bookings b JOIN inventory i ON i.id=b.inventory_id
    WHERE b.inventory_id=$1 AND b.status IN ('approved','scheduled','live') AND NOT(b.id=ANY($2::text[]))`, [inventoryId, exclude]);
    const overlapping = result.rows.filter(row => row.start_date <= requested.endDate && row.end_date >= requested.startDate);
    const boundaries = new Set([requested.startDate, ...overlapping.map(row => row.start_date).filter(date => date >= requested.startDate)]);
    for (const date of boundaries) {
        const active = overlapping.filter(row => row.start_date <= date && row.end_date >= date);
        if (active.some(row => Number(row.loop_seconds) !== requested.loopSeconds) || active.reduce((sum, row) => sum + Number(row.seconds), requested.slots * requested.slotSeconds) > capacity)
            throw new ScheduleError("Device loop capacity is full or its confirmed loop configuration differs");
    }
}
export async function reserveCampaign(client: PoolClient, campaignId: string) {
    const units = await client.query<{
        id: string;
        image_interval: number;
        max_loop_seconds: number;
    }>("SELECT i.id,i.image_interval,i.max_loop_seconds FROM inventory i WHERE i.id IN (SELECT inventory_id FROM placements WHERE campaign_id=$1 AND status<>'cancelled') ORDER BY i.id FOR UPDATE", [campaignId]);
    for (const unit of units.rows) {
        const placements = await client.query<{
            id: string;
            start_date: string;
            end_date: string;
            schedule_snapshot: Allocation | null;
        }>("SELECT id,start_date,end_date,schedule_snapshot FROM placements WHERE campaign_id=$1 AND inventory_id=$2 AND delivery_mode='digital' AND status<>'cancelled' ORDER BY id", [campaignId, unit.id]);
        for (const placement of placements.rows) {
            const snapshot = placement.schedule_snapshot;
            if (!snapshot)
                throw new ScheduleError("Operator confirmation must specify the digital allocation first");
            await checkDigitalCapacity(client, unit.id, snapshot, [placement.id]);
            await client.query("UPDATE placements SET schedule_snapshot=$2::jsonb,status='confirmed' WHERE id=$1", [placement.id, JSON.stringify(snapshot)]);
        }
    }
}
export async function quoteDigitalAllocations(client: PoolClient, campaignId: string) {
    const units = await client.query<{
        id: string;
        image_interval: number;
        max_loop_seconds: number;
    }>("SELECT i.id,i.image_interval,i.max_loop_seconds FROM inventory i WHERE i.id IN (SELECT inventory_id FROM placements WHERE campaign_id=$1 AND delivery_mode='digital' AND status<>'cancelled') ORDER BY i.id FOR SHARE", [campaignId]);
    for (const unit of units.rows) {
        const placements = await client.query<{
            id: string;
            start_date: string;
            end_date: string;
        }>("SELECT id,start_date,end_date FROM placements WHERE campaign_id=$1 AND inventory_id=$2 AND status<>'cancelled'", [campaignId, unit.id]);
        for (const p of placements.rows)
            await client.query("UPDATE placements SET schedule_snapshot=COALESCE(schedule_snapshot,$2::jsonb) WHERE id=$1", [p.id, JSON.stringify(allocation(p.start_date, p.end_date, unit.image_interval, unit.max_loop_seconds))]);
    }
}
export async function campaignSlides(client: PoolClient, inventoryId: string, asOf = new Date().toISOString().slice(0, 10), through = asOf): Promise<PlayerSlide[]> {
    if (!isFeatureEnabled("campaign_model_v2"))
        return [];
    const result = await client.query<{
        id: string;
        name: string;
        schedule_snapshot: Allocation;
        version_id: string;
        checksum: string;
        mime_type: string;
        created_at: string;
    }>(`
    SELECT p.id,c.name,p.schedule_snapshot,v.id version_id,v.checksum,v.mime_type,v.created_at
    FROM placements p JOIN campaigns c ON c.id=p.campaign_id
    JOIN LATERAL (
      SELECT v.* FROM creative_assignments a JOIN creative_versions v ON v.id=a.creative_version_id
      JOIN creative_assets asset ON asset.id=v.asset_id AND asset.campaign_id=p.campaign_id AND asset.organization_id=c.organization_id
      WHERE a.placement_id=p.id AND v.status='approved'
        AND EXISTS (SELECT 1 FROM creative_reviews r WHERE r.creative_version_id=v.id AND r.review_type='client' AND r.decision='approved')
        AND EXISTS (SELECT 1 FROM creative_reviews r WHERE r.creative_version_id=v.id AND r.review_type='operator' AND r.decision='approved')
      ORDER BY a.created_at DESC,v.version DESC,v.id LIMIT 1
    ) v ON TRUE
    WHERE p.inventory_id=$1 AND p.delivery_mode='digital' AND p.status IN ('confirmed','ready_for_fulfillment','live')
      AND c.status<>'archived' AND p.schedule_snapshot IS NOT NULL AND p.id NOT LIKE 'PLC-LEGACY-%'
      AND p.start_date<=$3 AND p.end_date>=$2
    ORDER BY p.id`, [inventoryId, asOf, through]);
    return result.rows.filter(row => ["image/png", "image/jpeg", "image/gif", "image/webp", "video/mp4", "video/webm"].includes(row.mime_type)).map(row => ({
        id: row.id, placementId: row.id, creativeVersionId: row.version_id, assetVersion: row.checksum,
        title: row.name, subtitle: "", mediaType: row.mime_type.startsWith("video/") ? "video" : "image",
        publicUrl: `/api/player/assets/${encodeURIComponent(row.version_id)}`, createdAt: row.created_at,
        startsOn: row.schedule_snapshot.startDate, endsOn: row.schedule_snapshot.endDate,
        durationSeconds: row.schedule_snapshot.slotSeconds * row.schedule_snapshot.slots, allocation: row.schedule_snapshot,
    }));
}
