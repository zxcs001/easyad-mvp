import type { InventoryItem } from "../data";

type InventoryDelivery = Pick<InventoryItem, "deliveryMode" | "format">;

export function isDigitalInventory(item: InventoryDelivery) {
  if (item.deliveryMode !== undefined) return item.deliveryMode === "digital";
  return item.format === "digital";
}

export function isStaticInventory(item: InventoryDelivery) {
  if (item.deliveryMode !== undefined) return item.deliveryMode === "static";
  return item.format === "static";
}
