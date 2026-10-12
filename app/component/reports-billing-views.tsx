"use client";

import "./reports-billing-views.css";
import { Booking, InventoryItem, Transaction } from "../data";
import { money, splitRevenue } from "../utils";
import { useEffect, useState } from "react";
import type { BookingDelivery } from "../lib/delivery-report";
import BookingDeliverySummary from "./booking-delivery-summary";
import { EmptyState, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";
import ResponsesPanel from "./responses-panel";

export function ReportsView({
  bookings, inventory, onRunDelivery, canRunDelivery, isAdvertiser = false,
}: {
  isAdvertiser?: boolean;
  bookings: Booking[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  onRunDelivery: () => Promise<boolean>;
  canRunDelivery: boolean;
}) {
  const { locale, formatNumber, formatDate, t } = useI18n();
  const [result, setResult] = useState<{ delivery: BookingDelivery[]; asOf: string } | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  // Reload when a flight changes, and cancel older requests on unmount/change.
  const bookingKey = JSON.stringify(bookings);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    setResult(null);
    setError(false);
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch("/api/delivery", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const data = await response.json() as { delivery: BookingDelivery[]; asOf: string };
        if (!Array.isArray(data.delivery) || !Number.isFinite(Date.parse(data.asOf))) throw new Error();
        if (!controller.signal.aborted) { setResult(data); setError(false); }
      } catch {
        if (!controller.signal.aborted) { setResult(null); setError(true); }
      } finally { pending = false; }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 60000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [bookingKey, revision]);

  const ids = new Set(bookings.map(b => b.id));
  const rows = (result?.delivery ?? []).filter(d => ids.has(d.bookingId));
  const byBooking = new Map(rows.map(d => [d.bookingId, d]));
  const estimates = rows.filter(d => d.estimatedViews !== null);
  const views = estimates.reduce((sum, d) => sum + d.estimatedViews!, 0);
  const estimateSpend = estimates.reduce((sum, d) => sum + (bookings.find(b => b.id === d.bookingId)?.spend ?? 0), 0);
  const cpm = views > 0 ? estimateSpend / views * 1000 : null;
  const received = result ? formatNumber(rows.reduce((sum, d) => sum + d.player.completed, 0)) : "—";
  const declared = result ? formatNumber(rows.reduce((sum, d) => sum + d.operator.completed, 0)) : "—";
  return (
    <section className="grid reports-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow="Results" title={isAdvertiser ? "How your ads did" : "Performance overview"}
          action={<button className="ghost-button" type="button" onClick={() => setRevision(v => v + 1)}>{t("Refresh delivery")}</button>} />
        {error ? <p role="alert">{t("Delivery evidence is unavailable. Retry to refresh it.")}</p> : !result ? <p role="status">{t("Loading delivery evidence…")}</p> : null}
        <div className="report-metrics">
          <Metric label="Player-reported completed plays" value={received} />
          <Metric label="Operator-declared completed plays" value={declared} />
          <Metric label="Estimated views" value={estimates.length ? views > 0 && views < 1 ? "<1" : formatNumber(views, { maximumFractionDigits: 0 }) : "—"} />
          <Metric label="Estimated CPM" value={cpm === null ? "—" : money(cpm, locale, true)} />
        </div>
        <p className="report-empty-note">{t("Player reports, operator declarations and demo records are kept separate. Estimates are not measured audience views.")}</p>
        {result ? <>
          <p className="report-empty-note">{t("Estimates available for {known} of {total} digital bookings; unavailable bookings are excluded from estimated CPM.", { known: estimates.length, total: rows.filter(d => d.digital).length })}</p>
          <p className="report-empty-note">{t("Evidence as of {date}", { date: formatDate(result.asOf, { dateStyle: "medium", timeStyle: "short" }) })}</p>
        </> : null}
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Delivery" title="Delivery by booking" />
        {bookings.length ? bookings.map(b => {
          const screen = inventory.find(s => s.id === b.inventoryId);
          const delivery = byBooking.get(b.id);
          return <article className="delivery-booking" key={b.id}>
            <h3>{b.campaign}</h3>
            <p>{b.id} · {screen?.name ?? b.inventoryId} · {b.start} – {b.end}</p>
            {delivery ? <BookingDeliverySummary delivery={delivery} /> : <p>{t(result ? "Delivery evidence unavailable for this booking." : "Delivery evidence has not loaded.")}</p>}
            <a className="ghost-button" href={`/report/${encodeURIComponent(b.id)}`} target="_blank" rel="noreferrer">{t("Report (PDF)")}</a>
          </article>;
        }) : <EmptyState title="No delivery to report yet" copy="Once approved campaigns start running, their delivery evidence appears here." />}
      </div>
      <ResponsesPanel bookings={bookings} inventory={inventory} canEdit={isAdvertiser} />
      {canRunDelivery ? <div className="panel span-2">
        <PanelHeading eyebrow="Demo" title="Demo delivery records"
          action={<AsyncButton className="ghost-button" onClick={async () => { const ok = await onRunDelivery(); if (ok) setRevision(v => v + 1); return ok; }}
            successMessage="Demo delivery tick recorded across active campaigns." errorMessage="Could not record demo delivery. Please try again.">Demo: Run delivery tick</AsyncButton>} />
        <p>{t("Demo records are excluded from playback and audience estimates.")}</p>
      </div> : null}
    </section>
  );
}

export function BillingView({
  bookings,
  transactions,
  onSettle,
  canManage,
  isAdvertiser = false,
  paymentsEnabled = false,
}: {
  isAdvertiser?: boolean;
  bookings: Booking[];
  transactions: Transaction[];
  onSettle: (bookingId: string, action: "pay" | "refund") => Promise<boolean>;
  canManage: boolean;
  paymentsEnabled?: boolean;
}) {
  const { locale, t } = useI18n();
  const rows = bookings.filter((booking) => booking.status !== "cancelled").map((booking) => {
    const transaction = transactions.find((entry) => entry.bookingId === booking.id);
    const split = splitRevenue(booking.spend);
    return {
      booking,
      amount: transaction?.amount ?? split.gross,
      platformFee: transaction?.platformFee ?? split.platformFee,
      operatorPayout: transaction?.operatorPayout ?? split.operatorPayout,
      status: transaction?.status ?? (booking.paid ? "paid" : "pending"),
      gatewayRef: transaction?.gatewayRef ?? null,
    };
  });
  const gross = rows.reduce((sum, row) => sum + row.amount, 0);
  const platform = rows.reduce((sum, row) => sum + row.platformFee, 0);
  const operator = rows.reduce((sum, row) => sum + row.operatorPayout, 0);
  const outstanding = rows.filter((row) => row.status !== "paid").length;
  return (
    <section className="grid billing-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow={isAdvertiser ? "Your account" : "Offline commercial terms"} title={isAdvertiser ? "What you owe" : "Commercial ledger"} />
        <p className="commercial-policy" role="note">
          {paymentsEnabled
            ? t("Demo only: mock charge and refund controls are enabled. Do not use them for real payments.")
            : t("Payment collection is turned off. Record quotes and approvals offline; no card will be charged.")}
        </p>
        <div className="report-metrics">
          <Metric label={isAdvertiser ? "Your total" : "Gross billings"} value={money(gross, locale)} />
          {/* The platform's cut and what it pays the screen owner are the
              marketplace's own revenue split. A buyer has no use for either,
              and showing a take rate to the person being charged is wrong. */}
          {isAdvertiser ? null : <Metric label="Platform share" value={money(platform, locale)} />}
          {isAdvertiser ? null : <Metric label="Operator payable" value={money(operator, locale)} />}
          <Metric label={isAdvertiser ? "Still to pay" : "Open invoices"} value={outstanding} />
        </div>
        {/* The tiles above hide the platform share and operator payable from a
            buyer on purpose. The table showed both anyway, per invoice. */}
        {rows.length ? null : <p className="report-empty-note">{t("No invoices yet.")}</p>}
        <div className={`inventory-table billing-table${isAdvertiser ? " is-advertiser" : ""}`}>
          {rows.length ? <div className="table-head"><span>{t("Reference")}</span><span>{t("Advertiser")}</span><span>{t(isAdvertiser ? "Amount" : "Gross")}</span>{isAdvertiser ? null : <><span>{t("Platform")}</span><span>{t("Operator")}</span></>}<span>{t("Gateway")}</span><span>{t("Status")}</span></div> : null}
          {rows.map(({ booking, amount, platformFee, operatorPayout, status, gatewayRef }) => {
            const paid = status === "paid";
            return (
              <div className="table-row" key={booking.id}>
                <span><strong>INV-{booking.id.replace("BK-", "")}</strong><small>{booking.campaign}</small></span>
                <span>{booking.advertiser}</span>
                <span>{money(amount, locale)}</span>
                {isAdvertiser ? null : <><span>{money(platformFee, locale)}</span><span>{money(operatorPayout, locale)}</span></>}
                <span><small className="gateway-ref">{gatewayRef ?? "-"}</small></span>
                <span>
                  {paymentsEnabled ? (
                    <AsyncButton
                      className={paid ? "paid" : ""}
                      disabled={!canManage}
                      onClick={() => onSettle(booking.id, paid ? "refund" : "pay")}
                      successMessage={paid ? `Invoice INV-${booking.id.replace("BK-", "")} refunded.` : `Invoice INV-${booking.id.replace("BK-", "")} charged.`}
                      errorMessage="Payment gateway error. Please try again."
                    >
                      {paid ? "Paid" : status === "refunded" ? "Refunded" : status === "failed" ? "Retry" : "Demo charge"}
                    </AsyncButton>
                  ) : <span className={`commercial-status is-${status}`}>{t(status)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
