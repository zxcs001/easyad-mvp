"use client";

import "./reports-billing-views.css";
import { Booking, InventoryItem, Transaction } from "../data";
import { deliveredImpressions, money, number, splitRevenue } from "../utils";
import { BookingsTable, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";

export function ReportsView({
  bookings,
  inventory,
  transactions,
  onRunDelivery,
  canRunDelivery,
}: {
  bookings: Booking[];
  inventory: InventoryItem[];
  transactions: Transaction[];
  onRunDelivery: () => Promise<boolean>;
  canRunDelivery: boolean;
}) {
  const totalImpressions = bookings.reduce((sum, booking) => {
    const item = inventory.find((unit) => unit.id === booking.inventoryId);
    return sum + (item ? deliveredImpressions(item, booking) : 0);
  }, 0);
  const popRate = Math.round(bookings.reduce((sum, booking) => sum + booking.pop, 0) / Math.max(1, bookings.length));
  const collected = transactions.filter((transaction) => transaction.status === "paid").reduce((sum, transaction) => sum + transaction.amount, 0);
  const cpm = totalImpressions > 0 ? Math.round((bookings.reduce((sum, booking) => sum + booking.spend, 0) / totalImpressions) * 1000) : 0;
  return (
    <section className="grid reports-grid">
      <div className="panel span-2">
        <PanelHeading eyebrow="Campaign analytics and reporting" title="Performance overview" />
        <div className="report-metrics">
          <Metric label="Delivered impressions" value={number(totalImpressions)} />
          <Metric label="Proof-of-play completion" value={`${popRate}%`} />
          <Metric label="Active campaigns" value={bookings.filter((booking) => ["scheduled", "live"].includes(booking.status)).length} />
          <Metric label="Verified CPM" value={money(cpm)} />
        </div>
        <div className="bar-chart">{inventory.slice(0, 6).map((item) => <div key={item.id}><span>{item.id}</span><i style={{ height: Math.max(12, item.impressions / 2200) }} /><small>{number(item.impressions)}</small></div>)}</div>
      </div>
      <div className="panel">
        <PanelHeading
          eyebrow="PoP logging"
          title="Delivery logs"
          action={<AsyncButton className="ghost-button" disabled={!canRunDelivery} onClick={onRunDelivery} successMessage="Delivery tick recorded across active campaigns." errorMessage="Could not record delivery. Please try again.">{canRunDelivery ? "Run delivery tick" : "Operator only"}</AsyncButton>}
        />
        <div className="pop-list">{bookings.map((booking) => <div key={booking.id}><strong>{booking.id}</strong><span>{booking.campaign}</span><meter min={0} max={100} value={booking.pop} /><small>{booking.pop}% verified - {money(collected)} collected platform-wide</small></div>)}</div>
      </div>
      <div className="panel span-2"><PanelHeading eyebrow="Campaigns" title="Reporting table" /><BookingsTable bookings={bookings} inventory={inventory} /></div>
    </section>
  );
}

export function BillingView({
  bookings,
  transactions,
  onSettle,
  canManage,
}: {
  bookings: Booking[];
  transactions: Transaction[];
  onSettle: (bookingId: string, action: "pay" | "refund") => Promise<boolean>;
  canManage: boolean;
}) {
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
        <PanelHeading eyebrow="Payment and transaction infrastructure" title="Billing ledger" />
        <div className="report-metrics">
          <Metric label="Gross billings" value={money(gross)} />
          <Metric label="Platform share" value={money(platform)} />
          <Metric label="Operator payable" value={money(operator)} />
          <Metric label="Open invoices" value={outstanding} />
        </div>
        <div className="inventory-table billing-table">
          <div className="table-head"><span>Invoice</span><span>Advertiser</span><span>Gross</span><span>Platform</span><span>Operator</span><span>Gateway</span><span>Status</span></div>
          {rows.map(({ booking, amount, platformFee, operatorPayout, status, gatewayRef }) => {
            const paid = status === "paid";
            return (
              <div className="table-row" key={booking.id}>
                <span><strong>INV-{booking.id.replace("BK-", "")}</strong><small>{booking.campaign}</small></span>
                <span>{booking.advertiser}</span>
                <span>{money(amount)}</span>
                <span>{money(platformFee)}</span>
                <span>{money(operatorPayout)}</span>
                <span><small className="gateway-ref">{gatewayRef ?? "-"}</small></span>
                <span>
                  <AsyncButton
                    className={paid ? "paid" : ""}
                    disabled={!canManage}
                    onClick={() => onSettle(booking.id, paid ? "refund" : "pay")}
                    successMessage={paid ? `Invoice INV-${booking.id.replace("BK-", "")} refunded.` : `Invoice INV-${booking.id.replace("BK-", "")} charged.`}
                    errorMessage="Payment gateway error. Please try again."
                  >
                    {paid ? "Paid" : status === "refunded" ? "Refunded" : status === "failed" ? "Retry" : "Charge"}
                  </AsyncButton>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
