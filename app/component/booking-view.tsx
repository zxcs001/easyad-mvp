"use client";

import "./booking-view.css";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Booking, InventoryItem } from "../data";
import type { BookingDraft } from "../types";
import { availableLoopSeconds, bookedLoopSeconds, capitalize, daysBetween, estimateSpend, money, overlaps, reservedLoopSeconds } from "../utils";
import { BookingsTable, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";
import { isDigitalInventory, isStaticInventory } from "../lib/inventory-delivery";
import { isInventoryAvailableForDates } from "../lib/inventory-availability";

export default function BookingView({ item, inventory, draft, bookings, setDraft, hasCapacityConflict, onSubmit, onCancel, canBuy, advertiserNameFixed = false }: {
  // An advertiser's booking always carries the account name (the server sets
  // it), so an editable "Advertiser" field did nothing for them.
  advertiserNameFixed?: boolean;
  item: InventoryItem;
  inventory: InventoryItem[];
  draft: BookingDraft;
  bookings: Booking[];
  setDraft: Dispatch<SetStateAction<BookingDraft>>;
  hasCapacityConflict: (inventoryId: string, start: string, end: string, adSlots?: number, excludeId?: string) => boolean;
  onSubmit: (file?: File | null) => Promise<boolean>;
  onCancel: () => void;
  canBuy?: boolean;
}) {
  const { formatNumber, locale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creativeImage, setCreativeImage] = useState<File | null>(null);
  const [creativeError, setCreativeError] = useState("");
  const [showOptions, setShowOptions] = useState(draft.adSlots > 1);
  const [submitting, setSubmitting] = useState(false);
  const isDigital = isDigitalInventory(item);
  const isStatic = isStaticInventory(item);
  const staticAvailable = !isStatic || isInventoryAvailableForDates(item, draft.start, draft.end);
  const conflict = hasCapacityConflict(item.id, draft.start, draft.end, draft.adSlots);
  const blocked = isStatic ? !staticAvailable : conflict;
  const bookedSeconds = bookedLoopSeconds(item, bookings, draft.start, draft.end);
  const requestedSeconds = reservedLoopSeconds(item, draft.adSlots);
  const remainingSeconds = availableLoopSeconds(item, bookings, draft.start, draft.end);
  const showsLoopCapacity = isDigital;
  const bookingDetailsReady = Boolean(draft.campaign.trim() && draft.start && draft.end && draft.start <= draft.end);

  // The submit button has three independent blocking conditions. Before this,
  // only one of them changed the label, so the other two left a grey button and
  // no explanation. Every blocked state now names itself and says what to do.
  const blockedReason = !canBuy
    ? "Sign in with an advertiser account to book this screen."
    : blocked
      ? isStatic
        ? "This billboard is already taken for these dates. Pick different dates."
        : "This screen is full for these dates. Pick different dates, or ask for fewer showings."
      : creativeError
        ? "Choose a different picture, or remove it and add artwork later."
        : !bookingDetailsReady
          ? "Add a campaign name and a valid date range to continue."
        : "";

  function chooseCreative(file: File | null) {
    setCreativeImage(file);
    setCreativeError(file ? validateBookingImage(file, isDigital) : t(isDigital ? "Choose a PNG, JPEG, or GIF image for approval." : "Choose a PNG or JPEG image for approval."));
  }

  function removeCreative() {
    setCreativeImage(null);
    setCreativeError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function createCampaign() {
    setSubmitting(true);
    try {
      return await onSubmit(creativeImage);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grid booking-grid">
      <div className="panel">
        <PanelHeading eyebrow={isStatic ? "Request this billboard" : "Request time on this screen"} title={item.name} action={<span className={`status ${blocked ? "bad" : "good"}`}>{t(isStatic ? staticAvailable ? "Available" : "Unavailable" : conflict ? "Fully booked" : "Available")}</span>} />
        <div className="booking-screen-summary" aria-label={t("Selected screen")}>
          <span><strong>{t("Selected screen")}</strong><small>{item.address}</small></span>
          <span><strong>{t("Daily rate")}</strong><small>{money(item.price, locale)}</small></span>
          <span><strong>{t("Format")}</strong><small>{t(item.deliveryMode === "static" ? "Static" : "Digital")}</small></span>
        </div>
        <div className="form-grid">
          {((advertiserNameFixed ? ["campaign", "start", "end"] : ["advertiser", "campaign", "start", "end"]) as (keyof BookingDraft)[]).map((key) => (
            <label key={key}>
              {t(capitalize(key === "start" ? "Start date" : key === "end" ? "End date" : key))}
              <input type={key === "start" || key === "end" ? "date" : "text"} value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
        </div>
        {isDigital ? <div className="booking-options">
          <button aria-controls="booking-more-options" aria-expanded={showOptions} className="secondary-button" type="button" onClick={() => setShowOptions((current) => !current)}>{t(showOptions ? "Hide options" : "More options")}</button>
          {showOptions ? <div id="booking-more-options" className="booking-options-panel">
            <label>
              {t("Showings per cycle")}
              <input type="number" min={1} max={100} value={draft.adSlots} onChange={(event) => setDraft((current) => ({ ...current, adSlots: Math.max(1, Math.round(Number(event.target.value) || 1)) }))} />
              <small>{t("One showing per cycle works for most campaigns.")}</small>
            </label>
          </div> : null}
        </div> : null}
        <div className="booking-creative-field">
          <label htmlFor="booking-creative-image">
            <strong>{t("Add artwork now (optional)")}</strong>
          </label>
          <small id="booking-creative-requirements">{t(isDigital ? "PNG, JPEG, or animated GIF, up to 50 MB." : "PNG or JPEG, up to 50 MB.")}</small>
          <input
            ref={fileInputRef}
            id="booking-creative-image"
            type="file"
            accept={isDigital ? "image/png,image/jpeg,image/gif" : "image/png,image/jpeg"}
            aria-invalid={creativeError ? "true" : undefined}
            aria-describedby="booking-creative-requirements booking-creative-help booking-creative-error"
            onChange={(event) => chooseCreative(event.target.files?.[0] ?? null)}
          />
          <small id="booking-creative-help">{t("You can send the date request now and add artwork in Make an ad later. The screen owner checks it before it goes live.")}</small>
          {creativeImage ? (
            <div className={`booking-creative-summary${creativeError ? " bad" : ""}`}>
              <span><strong>{creativeImage.name}</strong><small>{formatFileSize(creativeImage.size)}</small></span>
              <button className="secondary-button" type="button" onClick={removeCreative}>{t("Remove")}</button>
            </div>
          ) : null}
          {creativeError ? <span className="form-error" id="booking-creative-error" role="alert">{creativeError}</span> : <span id="booking-creative-error" />}
        </div>
        <div className="quote">
          <Metric label="Total cost" value={money(estimateSpend(item, draft.start, draft.end, draft.adSlots), locale)} />
          <Metric label="How long it runs" value={t("{count} days", { count: daysBetween(draft.start, draft.end) })} />
          <Metric label="Estimated views" value={formatNumber(Math.round((item.impressions * daysBetween(draft.start, draft.end)) / 14))} />
          {showsLoopCapacity ? <>
            <Metric label="Your time each cycle" value={t("{count}s", { count: requestedSeconds })} />
            <Metric label="Time still free" value={t("{count}s of {total}s", { count: remainingSeconds, total: item.maxLoopSeconds })} />
            <Metric label="Time already booked" value={t("{count}s", { count: bookedSeconds })} />
          </> : null}
        </div>
        {blockedReason ? <p className="booking-blocked-reason" id="booking-submit-reason">{t(blockedReason)}</p> : null}
        <div className="booking-submit-actions">
          <button className="secondary-button" type="button" disabled={submitting} onClick={onCancel}>{t("Cancel campaign")}</button>
          <AsyncButton aria-describedby={blockedReason ? "booking-submit-reason" : undefined} className="primary-button" disabled={submitting || blocked || !canBuy || !bookingDetailsReady || Boolean(creativeError)} onClick={createCampaign} successMessage="Your booking request was sent." errorMessage="Could not send this booking request. Your details are still here—please try again.">{canBuy ? "Create campaign" : "Sign in to request dates"}</AsyncButton>
        </div>
      </div>
      <div className="panel">
        <PanelHeading eyebrow={isStatic ? "Placement availability" : "What else is booked"} title="Dates already taken" />
        <div className="timeline large">
          {bookings.filter((booking) => booking.inventoryId === item.id).map((booking) => (
            <div key={booking.id} className={overlaps(draft.start, draft.end, booking.start, booking.end) ? "warning" : ""}>
              <span>{booking.start} {t("to")} {booking.end}</span>
              <strong>{booking.campaign}</strong>
              <small>{t(booking.status)} - {booking.advertiser} - {t(booking.adSlots === 1 ? "{count} slot" : "{count} slots", { count: booking.adSlots })}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="panel span-2">
        <PanelHeading eyebrow="Your account" title="Your bookings" />
        <BookingsTable bookings={bookings} inventory={inventory} />
      </div>
    </section>
  );
}

function validateBookingImage(file: File, allowsGif: boolean) {
  if (!file.size) return allowsGif ? "The selected image is empty. Choose another PNG, JPEG, or GIF image." : "The selected image is empty. Choose another PNG or JPEG image.";
  if (file.size > 50 * 1024 * 1024) return "The selected image is larger than 50 MB.";
  const supportedTypes = allowsGif ? ["image/png", "image/jpeg", "image/gif"] : ["image/png", "image/jpeg"];
  if (!supportedTypes.includes(file.type)) return allowsGif ? "Choose a PNG, JPEG, or GIF image." : "Choose a PNG or JPEG image.";
  return "";
}

function formatFileSize(bytes: number) {
  if (bytes < 1048576) return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}
