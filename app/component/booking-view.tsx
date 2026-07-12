"use client";

import "./booking-view.css";
import type { Dispatch, SetStateAction } from "react";
import { Booking, InventoryItem } from "../data";
import type { BookingDraft } from "../types";
import { availableLoopSeconds, bookedLoopSeconds, capitalize, daysBetween, estimateSpend, money, number, overlaps, reservedLoopSeconds } from "../utils";
import { BookingsTable, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";

export default function BookingView({ item, inventory, draft, bookings, setDraft, hasCapacityConflict, onSubmit, canBuy }: {
  item: InventoryItem;
  inventory: InventoryItem[];
  draft: BookingDraft;
  bookings: Booking[];
  setDraft: Dispatch<SetStateAction<BookingDraft>>;
  hasCapacityConflict: (inventoryId: string, start: string, end: string, adSlots?: number, excludeId?: string) => boolean;
  onSubmit: () => Promise<boolean>;
  canBuy?: boolean;
}) {
  const conflict = hasCapacityConflict(item.id, draft.start, draft.end, draft.adSlots);
  const bookedSeconds = bookedLoopSeconds(item, bookings, draft.start, draft.end);
  const requestedSeconds = reservedLoopSeconds(item, draft.adSlots);
  const remainingSeconds = availableLoopSeconds(item, bookings, draft.start, draft.end);
  return (
    <section className="grid booking-grid">
      <div className="panel">
        <PanelHeading eyebrow="Reserve loop space" title={item.name} action={<span className={`status ${conflict ? "bad" : "good"}`}>{conflict ? "Capacity full" : "Available"}</span>} />
        <div className="form-grid">
          {(["advertiser", "campaign", "start", "end"] as (keyof BookingDraft)[]).map((key) => (
            <label key={key}>
              {capitalize(key === "start" ? "Start date" : key === "end" ? "End date" : key)}
              <input type={key === "start" || key === "end" ? "date" : "text"} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
          <label>
            Ad slots
            <input type="number" min={1} max={100} value={draft.adSlots} onChange={(event) => setDraft((current) => ({ ...current, adSlots: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} />
          </label>
        </div>
        <div className="quote">
          <Metric label="Estimated spend" value={money(estimateSpend(item, draft.start, draft.end, draft.adSlots))} />
          <Metric label="Run length" value={`${daysBetween(draft.start, draft.end)} days`} />
          <Metric label="Estimated impressions" value={number(Math.round((item.impressions * daysBetween(draft.start, draft.end)) / 14))} />
          <Metric label="Reserved loop time" value={`${requestedSeconds}s`} />
          <Metric label="Available loop time" value={`${remainingSeconds}s / ${item.maxLoopSeconds}s`} />
          <Metric label="Booked loop time" value={`${bookedSeconds}s`} />
        </div>
        <AsyncButton className="primary-button wide" disabled={conflict || !canBuy} onClick={onSubmit} successMessage="Loop space reserved - campaign created." errorMessage="Could not reserve this space. Please try again.">{canBuy ? "Reserve space" : "Sign in as advertiser to buy"}</AsyncButton>
      </div>
      <div className="panel">
        <PanelHeading eyebrow="Shared loop capacity" title="Schedule check" />
        <div className="timeline large">
          {bookings.filter((booking) => booking.inventoryId === item.id).map((booking) => (
            <div key={booking.id} className={overlaps(draft.start, draft.end, booking.start, booking.end) ? "warning" : ""}>
              <span>{booking.start} to {booking.end}</span>
              <strong>{booking.campaign}</strong>
              <small>{booking.status} - {booking.advertiser} - {booking.adSlots} slot{booking.adSlots === 1 ? "" : "s"}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Advertiser dashboard" title="Booking pipeline" />
        <BookingsTable bookings={bookings} inventory={inventory} />
      </div>
    </section>
  );
}
