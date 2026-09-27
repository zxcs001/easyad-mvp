"use client";

import "./campaign-spaces-view.css";
import type { Booking, InventoryItem } from "../data";
import type { DbUser } from "../lib/db";
import { money, reservedLoopSeconds } from "../utils";
import { EmptyState, Meter, PanelHeading } from "./shared-ui";
import { useI18n } from "../i18n/client";
import { isDigitalInventory } from "../lib/inventory-delivery";

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
  const { locale, t } = useI18n();
  // No filter by account name: the server already returns only this account's
  // bookings. Matching the free-text advertiser name hid every older booking
  // once an account was renamed.
  const visibleBookings = bookings.filter((booking) => booking.status !== "rejected");
  // Admin sees this screen too, and "find screens near you" is not their job.
  const isAdvertiser = currentUser?.role === "advertiser";

  return (
    <section className="grid booking-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow={isAdvertiser ? "Your ads" : "Advertiser reserved spaces"} title={isAdvertiser ? "Screens you have booked" : "Campaign inventory"} />
        <div className="inventory-table campaign-space-table">
          {/* A column header above an empty table labels nothing. It appears
              only once there is a row to label. */}
          {visibleBookings.length ? <div className="table-head"><span>{t("Campaign")}</span><span>{t(isAdvertiser ? "Screen" : "Device")}</span><span>{t("Dates")}</span><span>{t(isAdvertiser ? "Your time each cycle" : "Loop reserved")}</span><span>{t("Status")}</span><span>{t(isAdvertiser ? "Your picture" : "Creative")}</span><span>{t("Actions")}</span></div> : null}
          {visibleBookings.length ? visibleBookings.map((booking) => {
            const item = inventory.find((unit) => unit.id === booking.inventoryId);
            const isDigital = item ? isDigitalInventory(item) : false;
            const reservedSeconds = item ? reservedLoopSeconds(item, booking.adSlots) : 0;
            const capacity = item?.maxLoopSeconds ?? 0;
            const capacityPercent = capacity ? Math.min(100, Math.round((reservedSeconds / capacity) * 100)) : 0;
            return (
              <div className="table-row" key={booking.id}>
                <span><strong>{booking.campaign}</strong><small>{booking.advertiser} - {money(booking.spend, locale)}</small></span>
                <span>{item?.name ?? booking.inventoryId}<small>{item?.address ?? t("Inventory record")}</small></span>
                <span>{booking.start}<small>{booking.end}</small></span>
                <span>{isDigital ? <><Meter value={capacityPercent} />{t("{reserved}s of {capacity}s", { reserved: reservedSeconds, capacity })}<small>{t(booking.adSlots === 1 ? "{count} slot" : "{count} slots", { count: booking.adSlots })} {t("at")} {item?.imageInterval ?? 0}s</small></> : <><strong>{t("Static placement")}</strong><small>{t("No playback loop")}</small></>}</span>
                <span><span className="status">{t(booking.status)}</span></span>
                <span>{t(booking.creativeStatus)}<small>{t("Submission state")}</small></span>
                <div className="campaign-space-actions">
                  <button className="secondary-button" type="button" onClick={() => onOpenCreative(booking)}>{t("Edit")}</button>
                  {isDigital ? <a className="secondary-button" href={`/inventory/${booking.inventoryId}`}>{t("Inventory")}</a> : null}
                </div>
              </div>
            );
          }) : (
            <EmptyState
              title={isAdvertiser ? "You have no campaigns yet" : "No campaign spaces yet"}
              copy={isAdvertiser
                ? "A campaign appears here once you request dates. You can add artwork before or after the request."
                : "Submit a booking with its creative image to start the approval workflow."}
              action={isAdvertiser ? <a className="primary-button" href="/?role=advertiser&view=discover">{t("Find screens near you")}</a> : undefined}
            />
          )}
        </div>
      </div>
      {/* Three cards of documentation about how loop capacity works. That is
          operator mechanics, and for an advertiser it is noise that also leaves
          a half-width orphan panel beside the list. */}
      {isAdvertiser ? null : (
      <div className="panel">
        <PanelHeading eyebrow="Creative assignment" title="Reserved devices" />
        <div className="automation-list">
          <div><strong>{t("Shared capacity")}</strong><span>{t("Multiple advertisers can reserve the same dates while the loop stays under device capacity.")}</span></div>
          <div><strong>{t("Device actions")}</strong><span>{t("Open the creative suite or inspect the reserved device inventory profile.")}</span></div>
          <div><strong>{t("Operator controls")}</strong><span>{t("Loop interval and maximum loop capacity are managed from inventory.")}</span></div>
        </div>
      </div>
      )}
    </section>
  );
}
