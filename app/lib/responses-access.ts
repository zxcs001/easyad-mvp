import { canManageInventoryRecord, canSubmitCreative } from "./auth";
import type { DbUser } from "./db";
import { getBooking, getBookingOwnerId, getInventory } from "./db";

/**
 * Who may see and change a booking's response tracking. The advertiser who
 * owns the booking (and Super Admin) may change it; the screen's owner may see
 * the results, because they are the delivery report for their screen.
 */
export async function responseAccess(user: DbUser | null, bookingId: string) {
  if (!user) return null;
  const booking = await getBooking(bookingId);
  if (!booking) return null;
  const owner = canSubmitCreative(user, await getBookingOwnerId(bookingId));
  const inventory = await getInventory(booking.inventoryId);
  const screenOwner = inventory ? canManageInventoryRecord(user, inventory) : false;
  if (!owner && !screenOwner) return null;
  return { booking, inventory, canEdit: owner };
}
