"use client";

import "./campaign-spaces-view.css";
import type { Booking, InventoryItem } from "../data";
import type { DbUser } from "../lib/db";
import { money, reservedLoopSeconds } from "../utils";
import { Meter, PanelHeading } from "./shared-ui";

export default function CampaignSpacesView({
  bookings,
  inventory,
  currentUser,
  onOpenCreative,
}: {
  bookings: Booking[];
  inventory: InventoryItem[];
  currentUser?: DbUser | null;
  onOpenCreative: (booking: Booking) => void;
}) {
  const visibleBookings = bookings
    .filter((booking) => booking.status !== "rejected")
    .filter((booking) => !currentUser || currentUser.role === "admin" || booking.advertiser === currentUser.name);

  return (
    <section className="grid booking-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow="Advertiser reserved spaces" title="Campaign inventory" />
        <div className="inventory-table campaign-space-table">
          <div className="table-head"><span>Campaign</span><span>Device</span><span>Dates</span><span>Loop reserved</span><span>Status</span><span>Creative</span><span>Actions</span></div>
          {visibleBookings.length ? visibleBookings.map((booking) => {
            const item = inventory.find((unit) => unit.id === booking.inventoryId);
            const reservedSeconds = item ? reservedLoopSeconds(item, booking.adSlots) : 0;
            const capacity = item?.maxLoopSeconds ?? 0;
            const capacityPercent = capacity ? Math.min(100, Math.round((reservedSeconds / capacity) * 100)) : 0;
            return (
              <div className="table-row" key={booking.id}>
                <span><strong>{booking.campaign}</strong><small>{booking.advertiser} - {money(booking.spend)}</small></span>
                <span>{item?.name ?? booking.inventoryId}<small>{item?.address ?? "Inventory record"}</small></span>
                <span>{booking.start}<small>{booking.end}</small></span>
                <span><Meter value={capacityPercent} />{reservedSeconds}s of {capacity}s<small>{booking.adSlots} slot{booking.adSlots === 1 ? "" : "s"} at {item?.imageInterval ?? 0}s</small></span>
                <span><span className="status">{booking.status}</span></span>
                <span>{booking.creativeStatus}<small>Submission state</small></span>
                <div className="campaign-space-actions">
                  <button className="secondary-button" type="button" onClick={() => onOpenCreative(booking)}>Creative</button>
                  <a className="secondary-button" href={`/inventory/${booking.inventoryId}`}>Inventory</a>
                </div>
              </div>
            );
          }) : (
            <div className="empty-state">
              <strong>No campaign spaces yet</strong>
              <span>Reserve space from the booking workflow, then upload creative for each device here.</span>
            </div>
          )}
        </div>
      </div>
      <div className="panel">
        <PanelHeading eyebrow="Creative assignment" title="Reserved devices" />
        <div className="automation-list">
          <div><strong>Shared capacity</strong><span>Multiple advertisers can reserve the same dates while the loop stays under device capacity.</span></div>
          <div><strong>Device actions</strong><span>Open the creative suite or inspect the reserved device inventory profile.</span></div>
          <div><strong>Operator controls</strong><span>Loop interval and maximum loop capacity are managed from inventory.</span></div>
        </div>
      </div>
    </section>
  );
}
