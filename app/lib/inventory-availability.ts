import type { InventoryItem } from "../data";
import { isStaticInventory } from "./inventory-delivery";

type AvailabilityWindow = Pick<InventoryItem, "availableFrom" | "availableTo">;
type MarketplaceAvailabilityInventory = AvailabilityWindow & Pick<InventoryItem, "deliveryMode" | "format">;

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function isValidAvailabilityDate(value: unknown): value is string {
  if (typeof value !== "string" || !isoDatePattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isValidAvailabilityWindow(window: AvailabilityWindow) {
  return isValidAvailabilityDate(window.availableFrom)
    && isValidAvailabilityDate(window.availableTo)
    && window.availableFrom <= window.availableTo;
}

export function isInventoryAvailableOn(item: AvailabilityWindow, date = currentDate()) {
  return isValidAvailabilityWindow(item)
    && isValidAvailabilityDate(date)
    && item.availableFrom <= date
    && item.availableTo >= date;
}

export function isInventoryAvailableForDates(item: AvailabilityWindow, start: string, end: string) {
  return isValidAvailabilityWindow(item)
    && isValidAvailabilityDate(start)
    && isValidAvailabilityDate(end)
    && start <= end
    && item.availableFrom <= start
    && item.availableTo >= end;
}

export function inventoryAvailabilityLabel(item: AvailabilityWindow, date = currentDate()) {
  return isInventoryAvailableOn(item, date) ? "Available" : "Unavailable";
}

export function isMarketplaceInventoryAvailable(item: MarketplaceAvailabilityInventory, date = currentDate()) {
  return !isStaticInventory(item) || isInventoryAvailableOn(item, date);
}

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}
