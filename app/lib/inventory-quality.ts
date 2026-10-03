import type { InventoryItem } from "../data";

export function inventoryDataQuality(item: InventoryItem, now = new Date()) {
  const checks = [Boolean(item.address), Number.isFinite(item.price), Number.isFinite(item.impressions), Boolean(item.audience), Boolean(item.deliveryMode && item.deliveryMode !== "unknown"), Boolean(item.latitude ?? item.x), Boolean(item.longitude ?? item.y)];
  if (item.deliveryMode === "static") checks.push(Boolean(item.productionLeadDays), Boolean(item.installationLeadDays));
  const score = Math.round(checks.filter(Boolean).length / checks.length * 100);
  const measuredAt = item.measurementUpdatedAt ? new Date(item.measurementUpdatedAt) : null;
  const stale = !measuredAt || !Number.isFinite(measuredAt.valueOf()) || now.valueOf() - measuredAt.valueOf() > 365 * 86400000;
  return { score, stale, label: score >= 90 ? "complete" : score >= 70 ? "review" : "incomplete" } as const;
}
