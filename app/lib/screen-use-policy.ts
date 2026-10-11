import type { Booking, InventoryItem } from "../data";

/**
 * An institution screen is either reserved for the institution's own content
 * or open to private-sector advertising. The choice is stored in the existing
 * `advertising_opt_in` column; reserved is the default for institution screens.
 * This module holds no server code, so client components can import it.
 */
export type ScreenUse = "institution" | "advertising";

type ScreenUseFields = Pick<InventoryItem, "institutionId" | "advertisingOptIn">;

export function screenUseOf(item: ScreenUseFields): ScreenUse {
  // Marketplace screens (no institution) are always open to advertising.
  if (!item.institutionId) return "advertising";
  return item.advertisingOptIn ? "advertising" : "institution";
}

export function isReservedInstitutionScreen(item: ScreenUseFields) {
  return screenUseOf(item) === "institution";
}

export function advertisingScreens<T extends ScreenUseFields>(inventory: T[]) {
  return inventory.filter((item) => screenUseOf(item) === "advertising");
}

/**
 * The institution workspace shows its Advertising area only when a screen is
 * open to advertising, or when advertising history still exists to review.
 */
export function showsAdvertisingArea(inventory: ScreenUseFields[], bookings: Pick<Booking, "status">[]) {
  return inventory.some((item) => screenUseOf(item) === "advertising") || bookings.length > 0;
}
