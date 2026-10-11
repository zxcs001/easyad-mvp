"use client";

import "./institution-advertising-view.css";
import { useMemo, useRef, useState } from "react";
import { Megaphone, ShieldCheck } from "lucide-react";
import type { ApprovalEvent, Booking, Creative, InventoryItem, MediaResource, Transaction } from "../data";
import { useI18n } from "../i18n/client";
import { advertisingScreens } from "../lib/screen-use-policy";
import { money } from "../utils";
import { Meter, PanelHeading } from "./shared-ui";
import { ApprovalsView, CalendarView } from "./operator-views";
import { BillingView, ReportsView } from "./reports-billing-views";

type AdvertisingTab = "screens" | "review" | "calendar" | "performance" | "billing";

const tabs: Array<{ id: AdvertisingTab; label: string }> = [
  { id: "screens", label: "Screens and rates" },
  { id: "review", label: "Booking review" },
  { id: "calendar", label: "Booking calendar" },
  { id: "performance", label: "Performance" },
  { id: "billing", label: "Billing" },
];

/**
 * The one place in the institution workspace that shows rates, bookings,
 * campaign performance and billing. It covers only screens the institution
 * opened to private-sector advertising. With every screen reserved, it shows a
 * read-only note instead.
 */
export default function InstitutionAdvertisingView({
  inventory,
  bookings,
  creatives,
  transactions,
  approvalHistory,
  paymentsEnabled,
  hasConflict,
  updateBooking,
  updateMediaApproval,
  onSettle,
  onRunDelivery,
  onOpenCommandCentre,
  onEditScreen,
}: {
  inventory: InventoryItem[];
  bookings: Booking[];
  creatives: Creative[];
  transactions: Transaction[];
  approvalHistory: ApprovalEvent[];
  paymentsEnabled: boolean;
  hasConflict: (inventoryId: string, start: string, end: string, excludeId?: string) => boolean;
  updateBooking: (id: string, updates: Partial<Booking>) => Promise<boolean>;
  updateMediaApproval: (id: string, approvalStatus: Extract<MediaResource["approvalStatus"], "approved" | "rejected">) => Promise<boolean>;
  onSettle: (bookingId: string, action: "pay" | "refund") => Promise<boolean>;
  onRunDelivery: () => Promise<boolean>;
  onOpenCommandCentre: (screenId: string) => void;
  onEditScreen: (screenId: string) => void;
}) {
  const { locale, t } = useI18n();
  const [tab, setTab] = useState<AdvertisingTab>("screens");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const opened = useMemo(() => advertisingScreens(inventory), [inventory]);
  const reservedCount = inventory.length - opened.length;
  const pendingReview = bookings.filter((booking) => ["pending approval", "creative review"].includes(booking.status)).length;

  if (!opened.length && !bookings.length) {
    return (
      <section className="panel advertising-reserved" aria-labelledby="advertising-reserved-title">
        <span className="advertising-reserved-icon"><ShieldCheck aria-hidden="true" /></span>
        <div>
          <span className="eyebrow">{t("Institution use only")}</span>
          <h2 id="advertising-reserved-title">{t("All screens are reserved for your institution")}</h2>
          <p>{t("Your screens show only your own content. No pricing, bookings, or billing apply.")}</p>
          <p>{t("To let local businesses advertise on a screen, choose Open to private-sector advertising for that screen in the Command centre.")}</p>
        </div>
        {inventory[0] ? <button className="secondary-button" type="button" onClick={() => onOpenCommandCentre(inventory[0].id)}>{t("Open Command centre")}</button> : null}
      </section>
    );
  }

  function moveFocus(index: number) {
    const next = (index + tabs.length) % tabs.length;
    setTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  const openedIds = new Set(opened.map((item) => item.id));

  return (
    <section className="institution-advertising">
      <div className="advertising-scope-note" role="note">
        <Megaphone aria-hidden="true" />
        <span>{t(opened.length === 1 ? "{count} screen is open to private-sector advertising." : "{count} screens are open to private-sector advertising.", { count: opened.length })} {reservedCount ? t(reservedCount === 1 ? "{count} screen stays reserved for institution use and is not listed here." : "{count} screens stay reserved for institution use and are not listed here.", { count: reservedCount }) : null}</span>
      </div>

      <div className="advertising-tabs" role="tablist" aria-label={t("Advertising sections")}>
        {tabs.map((entry, index) => (
          <button
            aria-controls={`advertising-panel-${entry.id}`}
            aria-selected={tab === entry.id}
            className={tab === entry.id ? "active" : ""}
            id={`advertising-tab-${entry.id}`}
            key={entry.id}
            onClick={() => setTab(entry.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); moveFocus(index + 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus(index - 1); }
            }}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            tabIndex={tab === entry.id ? 0 : -1}
            type="button"
          >
            {t(entry.label)}{entry.id === "review" && pendingReview ? <span className="advertising-tab-count">{pendingReview}</span> : null}
          </button>
        ))}
      </div>

      <div aria-labelledby={`advertising-tab-${tab}`} id={`advertising-panel-${tab}`} role="tabpanel">
        {tab === "screens" ? (
          <div className="panel">
            <PanelHeading eyebrow="Private-sector advertising" title="Screens and rates" />
            {opened.length ? (
              <div className="advertising-screen-table">
                <div className="table-head"><span>{t("Screen")}</span><span>{t("Daily rate")}</span><span>{t("Occupancy")}</span><span>{t("Bookable dates")}</span><span>{t("Bookings")}</span><span><span className="sr-only">{t("Actions")}</span></span></div>
                {opened.map((item) => {
                  const activeBookings = bookings.filter((booking) => booking.inventoryId === item.id && !["cancelled", "rejected", "completed"].includes(booking.status)).length;
                  return (
                    <div className="table-row" key={item.id}>
                      <span><strong>{item.name}</strong><small>{item.address}</small></span>
                      <span>{money(item.price, locale)}</span>
                      <span><Meter value={item.occupancy} />{item.occupancy}%</span>
                      <span>{item.availableFrom}<small>{t("to")} {item.availableTo}</small></span>
                      <span>{activeBookings}</span>
                      <span className="advertising-row-actions">
                        <button className="secondary-button" type="button" onClick={() => onEditScreen(item.id)}>{t("Edit rate and details")}</button>
                        <button className="ghost-button" type="button" onClick={() => onOpenCommandCentre(item.id)}>{t("Change screen use")}</button>
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state"><strong>{t("No screens are open to advertising now")}</strong><span>{t("Past bookings, performance, and billing remain available in the other sections.")}</span></div>
            )}
          </div>
        ) : null}
        {tab === "review" ? (
          <ApprovalsView mode="advertising" bookings={bookings} inventory={inventory} creatives={creatives} mediaResources={[]} canReviewDeviceContent={false} approvalHistory={approvalHistory} hasConflict={hasConflict} updateBooking={updateBooking} updateMediaApproval={updateMediaApproval} />
        ) : null}
        {tab === "calendar" ? <CalendarView inventory={inventory.filter((item) => openedIds.has(item.id) || bookings.some((booking) => booking.inventoryId === item.id))} bookings={bookings} /> : null}
        {tab === "performance" ? <ReportsView bookings={bookings} inventory={inventory} transactions={transactions} onRunDelivery={onRunDelivery} canRunDelivery /> : null}
        {tab === "billing" ? <BillingView bookings={bookings} transactions={transactions} onSettle={onSettle} canManage paymentsEnabled={paymentsEnabled} /> : null}
      </div>
    </section>
  );
}
