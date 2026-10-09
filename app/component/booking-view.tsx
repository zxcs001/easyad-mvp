"use client";

import "./booking-view.css";
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Booking, InventoryItem } from "../data";
import type { BookingDraft } from "../types";
import { bookingCommitments, capitalize, dailyCost, daysBetween, estimateSpend, money, overlaps, reservedLoopSeconds, toDate } from "../utils";
import { BookingsTable, Metric, PanelHeading } from "./shared-ui";
import AsyncButton from "./async-button";
import { useI18n } from "../i18n/client";
import { isDigitalInventory, isStaticInventory } from "../lib/inventory-delivery";
import { isInventoryAvailableForDates, isValidAvailabilityDate } from "../lib/inventory-availability";
import { daypartHoursPerDay, endForLength, findNextFreeRange, isAllDay, lengthInDays, peakUsedInRange, planBudget, rangeFits, type CalendarInput, type CapacityInput, type DaypartId, type ScreenAvailability } from "../lib/booking-schedule";
import { AvailabilityCalendar, DaypartPicker, LengthPresets, PlanModeToggle, type PlanMode } from "./booking-schedule-fields";
import { daypartSummary } from "./daypart-summary";

// The screen's confirmed loop time, without advertiser names. A signed-in
// advertiser's own list holds only their bookings, so the calendar needs this.
async function fetchScreenAvailability(inventoryId: string): Promise<ScreenAvailability | null> {
  if (typeof window === "undefined" || typeof fetch !== "function") return null;
  const response = await fetch(`/api/inventory/${encodeURIComponent(inventoryId)}/availability`, { cache: "no-store" });
  return response.ok ? await response.json() as ScreenAvailability : null;
}

export default function BookingView({ item, inventory, draft, bookings, setDraft, hasCapacityConflict, onSubmit, onCancel, canBuy, advertiserNameFixed = false, allowCreativeUpload = true, loadAvailability = fetchScreenAvailability }: {
  /** Reads the screen's confirmed loop time. Tests pass their own. */
  loadAvailability?: (inventoryId: string) => Promise<ScreenAvailability | null>;
  // An advertiser's booking always carries the account name (the server sets
  // it), so an editable "Advertiser" field did nothing for them.
  advertiserNameFixed?: boolean;
  allowCreativeUpload?: boolean;
  item: InventoryItem;
  inventory: InventoryItem[];
  draft: BookingDraft;
  bookings: Booking[];
  setDraft: Dispatch<SetStateAction<BookingDraft>>;
  hasCapacityConflict: (inventoryId: string, start: string, end: string, adSlots?: number, excludeId?: string, dayparts?: DaypartId[]) => boolean;
  onSubmit: (file?: File | null) => Promise<boolean>;
  onCancel: () => void;
  canBuy?: boolean;
}) {
  const { formatDate, formatNumber, locale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [creativeImage, setCreativeImage] = useState<File | null>(null);
  const [creativeError, setCreativeError] = useState("");
  const [showOptions, setShowOptions] = useState(draft.adSlots > 1);
  const [submitting, setSubmitting] = useState(false);
  const [planMode, setPlanMode] = useState<PlanMode>("dates");
  const [budget, setBudget] = useState("");
  const [availability, setAvailability] = useState<ScreenAvailability | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const isDigital = isDigitalInventory(item);
  const isStatic = isStaticInventory(item);
  const dayparts = useMemo(() => isDigital ? draft.dayparts ?? [] : [], [draft.dayparts, isDigital]);
  const today = toDate(new Date());
  const datesValid = isValidAvailabilityDate(draft.start) && isValidAvailabilityDate(draft.end) && draft.start <= draft.end;
  const pastDates = isValidAvailabilityDate(draft.start) && draft.start < today;
  const runDays = datesValid ? lengthInDays(draft.start, draft.end) : 0;

  useEffect(() => {
    let current = true;
    setAvailabilityLoading(true);
    loadAvailability(item.id)
      .then((result) => { if (current) setAvailability(result && result.inventoryId === item.id ? result : null); })
      .catch(() => { if (current) setAvailability(null); })
      .finally(() => { if (current) setAvailabilityLoading(false); });
    return () => { current = false; };
  }, [item.id, loadAvailability]);

  // Digital capacity: the screen's confirmed loop time when the calendar has
  // loaded, otherwise the bookings this account can see.
  const capacity = useMemo<CapacityInput>(() => ({
    capacitySeconds: availability?.capacitySeconds ?? item.maxLoopSeconds,
    requestSeconds: reservedLoopSeconds(item, draft.adSlots),
    dayparts,
    commitments: availability?.commitments ?? bookingCommitments(item, bookings),
  }), [availability, bookings, dayparts, draft.adSlots, item]);
  const fits = useMemo(() => (start: string, end: string) => isStatic ? isInventoryAvailableForDates(item, start, end) : rangeFits(start, end, capacity), [capacity, isStatic, item]);

  const staticAvailable = !isStatic || isInventoryAvailableForDates(item, draft.start, draft.end);
  const conflict = isDigital && (hasCapacityConflict(item.id, draft.start, draft.end, draft.adSlots, undefined, dayparts) || (datesValid && !rangeFits(draft.start, draft.end, capacity)));
  const blocked = isStatic ? !staticAvailable : conflict;
  const bookedSeconds = datesValid ? peakUsedInRange(draft.start, draft.end, dayparts, capacity.commitments) : 0;
  const requestedSeconds = reservedLoopSeconds(item, draft.adSlots);
  const remainingSeconds = Math.max(0, capacity.capacitySeconds - bookedSeconds);
  const showsLoopCapacity = isDigital;
  const perDay = dailyCost(item, draft.adSlots, dayparts);
  const budgetValue = Number(budget);
  const plan = planBudget(budgetValue, perDay, (days) => Math.round(perDay * days));
  const budgetShort = planMode === "budget" && plan.days === 0;
  const bookingDetailsReady = Boolean(draft.campaign.trim() && datesValid && !pastDates);

  // Budget mode sets the end date: the most whole days the budget pays for.
  useEffect(() => {
    if (planMode !== "budget" || !plan.days || !isValidAvailabilityDate(draft.start)) return;
    const end = endForLength(draft.start, plan.days);
    if (end !== draft.end) setDraft((current) => ({ ...current, end }));
  }, [draft.end, draft.start, plan.days, planMode, setDraft]);

  // When the chosen dates do not work, offer the nearest run of the same length that does.
  const suggestion = useMemo(() => {
    if (!blocked && !pastDates) return null;
    if (!runDays && !pastDates) return null;
    const from = isValidAvailabilityDate(draft.start) && draft.start > today ? draft.start : today;
    return findNextFreeRange(from, runDays || 14, fits) ?? (from === today ? null : findNextFreeRange(today, runDays || 14, fits));
  }, [blocked, draft.start, fits, pastDates, runDays, today]);

  const calendarInput = useMemo<CalendarInput>(() => ({
    today,
    isDateAvailable: isStatic ? (date: string) => date >= item.availableFrom && date <= item.availableTo : undefined,
    capacity: isDigital ? capacity : undefined,
    rangeStart: datesValid ? draft.start : undefined,
    rangeEnd: datesValid ? draft.end : undefined,
  }), [capacity, datesValid, draft.end, draft.start, isDigital, isStatic, item.availableFrom, item.availableTo, today]);

  const shortDate = (date: string) => formatDate(`${date}T12:00:00`, { month: "short", day: "numeric" });
  const dayRate = (slots: DaypartId[]) => t("{amount} a day", { amount: money(dailyCost(item, draft.adSlots, slots), locale) });

  // The submit button has several independent blocking conditions. Every
  // blocked state names itself and says what to do.
  const blockedReason = !canBuy
    ? "Sign in with an advertiser account to book this screen."
    : pastDates
      ? "Choose a start date today or later. Campaigns cannot start in the past."
    : budgetShort
      ? budget.trim()
        ? t("This budget does not cover one day at {amount} a day. Raise the budget, or choose fewer times of day.", { amount: money(perDay, locale) })
        : "Enter your budget to see how long your ad can run."
    : blocked
      ? isStatic
        ? "This billboard is already taken for these dates. Pick different dates."
        : isAllDay(dayparts)
          ? "This screen is full for these dates. Pick different dates, or ask for fewer showings."
          : "This screen is full at these times on these dates. Pick different dates or other times of day."
      : allowCreativeUpload && creativeError
        ? "Choose a different picture, or remove it and add artwork later."
        : !bookingDetailsReady
          ? "Add a campaign name and a valid date range to continue."
        : "";

  function setStart(start: string) {
    setDraft((current) => {
      const length = lengthInDays(current.start, current.end) || 14;
      return { ...current, start, end: isValidAvailabilityDate(start) ? endForLength(start, length) : current.end };
    });
  }

  function pickLength(days: number) {
    setDraft((current) => {
      const start = isValidAvailabilityDate(current.start) && current.start >= today ? current.start : today;
      return { ...current, start, end: endForLength(start, days) };
    });
  }

  function changePlanMode(mode: PlanMode) {
    setPlanMode(mode);
    // Starting a budget from the current cost keeps the dates the person already chose.
    if (mode === "budget" && !budget && datesValid) setBudget(String(estimateSpend(item, draft.start, draft.end, draft.adSlots, dayparts)));
  }

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
      return await onSubmit(allowCreativeUpload ? creativeImage : null);
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
          {((advertiserNameFixed ? ["campaign"] : ["advertiser", "campaign"]) as ("advertiser" | "campaign")[]).map((key) => (
            <label key={key}>
              {t(capitalize(key))}
              <input type="text" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
        </div>
        <section className="schedule-section" aria-labelledby="booking-schedule-heading">
          <h3 id="booking-schedule-heading">{t("When it runs")}</h3>
          <PlanModeToggle mode={planMode} onChange={changePlanMode} />
          <div className="schedule-row">
            <label>
              {t("Start date")}
              <input type="date" min={today} value={draft.start} onChange={(event) => setStart(event.target.value)} />
            </label>
            {planMode === "dates" ? (
              <label>
                {t("End date")}
                <input type="date" min={draft.start || today} value={draft.end} onChange={(event) => setDraft((current) => ({ ...current, end: event.target.value }))} />
              </label>
            ) : (
              <label>
                {t("Your budget (CAD)")}
                <input type="number" inputMode="numeric" min={1} step={1} value={budget} aria-describedby="booking-budget-result" onChange={(event) => setBudget(event.target.value)} />
              </label>
            )}
          </div>
          {planMode === "dates" ? <LengthPresets start={draft.start} end={draft.end} onPick={pickLength} /> : (
            <div id="booking-budget-result" aria-live="polite">
              {plan.days ? (
                <p className="schedule-budget-result">{t(plan.days === 1 ? "Your budget covers 1 day: {start}. Total {total}, {leftover} left over." : "Your budget covers {days} days: {start} to {end}. Total {total}, {leftover} left over.", { days: plan.days, start: shortDate(draft.start), end: shortDate(endForLength(draft.start, plan.days)), total: money(plan.total, locale), leftover: money(plan.leftover, locale) })}</p>
              ) : null}
              <p className="schedule-budget-hint">{t("One day costs {amount}. Fewer times of day make the budget last longer.", { amount: money(perDay, locale) })}</p>
            </div>
          )}
          {isDigital ? <DaypartPicker value={dayparts} onChange={(next) => setDraft((current) => ({ ...current, dayparts: next }))} dailyRate={dayRate} /> : null}
          <AvailabilityCalendar input={calendarInput} start={draft.start} onPickStart={setStart} loading={availabilityLoading} />
        </section>
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
        {allowCreativeUpload ? <div className="booking-creative-field">
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
        </div> : null}
        <div className="quote">
          <Metric label="Total cost" value={money(estimateSpend(item, draft.start, draft.end, draft.adSlots, dayparts), locale)} />
          <Metric label="How long it runs" value={t("{count} days", { count: daysBetween(draft.start, draft.end) })} />
          <Metric label="Estimated views" value={formatNumber(Math.round((item.impressions * daysBetween(draft.start, draft.end)) / 14 * (daypartHoursPerDay(dayparts) / 24)))} />
          {isDigital ? <Metric label="On screen each day" value={isAllDay(dayparts) ? t("All day") : t("{count} hours", { count: daypartHoursPerDay(dayparts) })} /> : null}
          {showsLoopCapacity ? <>
            <Metric label="Your time each cycle" value={t("{count}s", { count: requestedSeconds })} />
            <Metric label="Time still free" value={t("{count}s of {total}s", { count: remainingSeconds, total: capacity.capacitySeconds })} />
            <Metric label="Time already booked" value={t("{count}s", { count: bookedSeconds })} />
          </> : null}
        </div>
        {blockedReason ? <p className="booking-blocked-reason" id="booking-submit-reason">{t(blockedReason)}</p> : null}
        {suggestion && (blocked || pastDates) ? (
          <div className="schedule-suggestion">
            <span>{t("Next open dates: {start} to {end}.", { start: shortDate(suggestion.start), end: shortDate(suggestion.end) })}</span>
            <button className="secondary-button" type="button" onClick={() => setDraft((current) => ({ ...current, start: suggestion.start, end: suggestion.end }))}>{t("Use these dates")}</button>
          </div>
        ) : null}
        <div className="booking-submit-actions">
          <button className="secondary-button" type="button" disabled={submitting} onClick={onCancel}>{t("Cancel campaign")}</button>
          <AsyncButton aria-describedby={blockedReason ? "booking-submit-reason" : undefined} className="primary-button" disabled={submitting || blocked || budgetShort || !canBuy || !bookingDetailsReady || Boolean(allowCreativeUpload && creativeError)} onClick={createCampaign} successMessage="Your booking request was sent." errorMessage="Could not send this booking request. Your details are still here—please try again.">{canBuy ? allowCreativeUpload ? "Create campaign" : "Continue to make your ad" : "Sign in to request dates"}</AsyncButton>
        </div>
      </div>
      <div className="panel">
        <PanelHeading eyebrow={isStatic ? "Placement availability" : "What else is booked"} title="Dates already taken" />
        <div className="timeline large">
          {bookings.filter((booking) => booking.inventoryId === item.id && !["cancelled", "rejected"].includes(booking.status)).map((booking) => (
            <div key={booking.id} className={overlaps(draft.start, draft.end, booking.start, booking.end) ? "warning" : ""}>
              <span>{booking.start} {t("to")} {booking.end}</span>
              <strong>{booking.campaign}</strong>
              <small>{t(booking.status)} - {booking.advertiser} - {t(booking.adSlots === 1 ? "{count} slot" : "{count} slots", { count: booking.adSlots })} - {daypartSummary(booking.dayparts, t)}</small>
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
