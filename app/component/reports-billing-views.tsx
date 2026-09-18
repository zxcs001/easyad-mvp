"use client";

import "./reports-billing-views.css";
import { Booking, InventoryItem, Transaction } from "../data";
import { deliveredImpressions, money, number, splitRevenue } from "../utils";
import { BookingsTable, EmptyState, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";

export function ReportsView({
  bookings,
  inventory,
  transactions,
  onRunDelivery,
  canRunDelivery,
  isAdvertiser = false,
}: {
  isAdvertiser?: boolean;
  bookings: Booking[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  onRunDelivery: () => Promise<boolean>;
  canRunDelivery: boolean;
}) {
  const { locale, formatNumber, t } = useI18n();
  const totalImpressions = bookings.reduce((sum, booking) => {
    const item = inventory.find((unit) => unit.id === booking.inventoryId);
    return sum + (item ? deliveredImpressions(item, booking) : 0);
  }, 0);
  // Proof of play belongs to the flights that have played. A campaign that
  // starts next month has 0% because it has not run, and averaging that with a
  // finished campaign's 99% reported half the delivery the screens made.
  const playedBookings = bookings.filter((booking) => ["completed", "live"].includes(booking.status));
  const popRate = playedBookings.length
    ? Math.round(playedBookings.reduce((sum, booking) => sum + booking.pop, 0) / playedBookings.length)
    : 0;
  const collected = transactions.filter((transaction) => transaction.status === "paid").reduce((sum, transaction) => sum + transaction.amount, 0);
  // Cost against what was delivered, so both sides of the division cover the
  // same flights. Counting a future campaign's spend against no impressions
  // raised the reported CPM above any real rate card.
  const playedSpend = playedBookings.reduce((sum, booking) => sum + booking.spend, 0);
  const playedImpressions = playedBookings.reduce((sum, booking) => {
    const item = inventory.find((unit) => unit.id === booking.inventoryId);
    return sum + (item ? deliveredImpressions(item, booking) : 0);
  }, 0);
  const cpm = playedImpressions > 0 ? Math.round((playedSpend / playedImpressions) * 1000) : 0;
  const chartRows = Object.values(bookings.reduce<Record<string, { id: string; name: string; impressions: number }>>((rows, booking) => {
    const item = inventory.find((unit) => unit.id === booking.inventoryId);
    if (!item) return rows;
    const delivered = deliveredImpressions(item, booking);
    const row = rows[item.id] ?? { id: item.id, name: item.name, impressions: 0 };
    row.impressions += delivered;
    rows[item.id] = row;
    return rows;
  }, {})).sort((a, b) => b.impressions - a.impressions).slice(0, 6);
  const chartPeak = chartRows.reduce((peak, row) => Math.max(peak, row.impressions), 0);
  return (
    <section className="grid reports-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow={isAdvertiser ? "Results" : "Campaign analytics and reporting"} title={isAdvertiser ? "How your ads did" : "Performance overview"} />
        <div className="report-metrics">
          <Metric label={isAdvertiser ? "Times your ad was seen" : "Delivered impressions"} value={formatNumber(totalImpressions)} />
          <Metric label={isAdvertiser ? "Confirmed playback" : "Proof-of-play completion"} value={`${popRate}%`} />
          <Metric label={isAdvertiser ? "Ads running now" : "Active campaigns"} value={bookings.filter((booking) => ["scheduled", "live"].includes(booking.status)).length} />
          <Metric label={isAdvertiser ? "Cost per 1,000 views" : "Verified CPM"} value={money(cpm, locale)} />
        </div>
        {/* This chart used to plot inventory.impressions, which is the screen's
            own audience figure for screens this account may never have booked.
            Under a "Performance overview" heading that reads as delivered
            results. It now plots what these bookings actually delivered. */}
        {chartRows.length ? (
          <div className="bar-chart">{chartRows.map((row) => <div key={row.id}><span title={row.name}>{row.name}</span><i style={{ height: Math.max(12, row.impressions / Math.max(1, chartPeak) * 150) }} /><small>{formatNumber(row.impressions)}</small></div>)}</div>
        ) : (
          // Operators and owners see this page too. The advertiser copy and its
          // "Find screens" link sent them to a view the server bounces them from.
          <EmptyState
            title="No delivery to report yet"
            copy={isAdvertiser ? "Once a screen owner approves your ad and it starts running, what it delivered appears here." : "Once approved campaigns start running on your screens, what they delivered appears here."}
            action={isAdvertiser ? <a className="primary-button" href="/?role=advertiser&view=discover">{t("Find screens near you")}</a> : undefined}
          />
        )}
      </div>
      {canRunDelivery ? (
      <div className="panel">
        <PanelHeading
          eyebrow="PoP logging"
          title="Delivery logs"
          action={<AsyncButton className="ghost-button" disabled={!canRunDelivery} onClick={onRunDelivery} successMessage="Demo delivery tick recorded across active campaigns." errorMessage="Could not record demo delivery. Please try again.">{canRunDelivery ? "Demo: Run delivery tick" : "Operator only"}</AsyncButton>}
        />
        {bookings.length ? null : <p className="report-empty-note">{t("No delivery logged yet.")}</p>}<div className="pop-list">{bookings.map((booking) => <div key={booking.id}><strong>{booking.id}</strong><span>{booking.campaign}</span><meter min={0} max={100} value={booking.pop} /><small>{t("{percent}% verified - {amount} collected platform-wide", { percent: booking.pop, amount: money(collected, locale) })}</small></div>)}</div>
      </div>
      ) : null}
      <div className="panel span-2"><PanelHeading eyebrow="Campaigns" title={isAdvertiser ? "Every ad you have run" : "Reporting table"} /><BookingsTable bookings={bookings} inventory={inventory} /></div>
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
  const rows = bookings.map((booking) => {
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
                  ) : <span className="commercial-status">{t(status)}</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
