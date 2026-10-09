"use client";

import "./booking-schedule-fields.css";
import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useI18n } from "../i18n/client";
import {
  DAYPARTS,
  LENGTH_PRESETS,
  addDays,
  calendarWeeks,
  isAllDay,
  isIsoDate,
  lengthInDays,
  type CalendarInput,
  type DaypartId,
  type DayStatus,
} from "../lib/booking-schedule";

export type PlanMode = "dates" | "budget";

const statusLabels: Record<DayStatus, string> = {
  open: "Space open",
  limited: "Few spots left",
  full: "Full",
  unavailable: "Not available",
};

/** Two ways to plan the same booking: pick the dates, or start from a budget. */
export function PlanModeToggle({ mode, onChange }: { mode: PlanMode; onChange: (mode: PlanMode) => void }) {
  const { t } = useI18n();
  return (
    <div className="schedule-segmented" role="group" aria-label={t("How do you want to plan?")}>
      {(["dates", "budget"] as const).map((value) => (
        <button key={value} type="button" aria-pressed={mode === value} className={mode === value ? "selected" : ""} onClick={() => onChange(value)}>
          {mode === value ? <Check aria-hidden="true" size={14} /> : null}
          {t(value === "dates" ? "Pick dates" : "Start from a budget")}
        </button>
      ))}
    </div>
  );
}

/** One click sets a common run length from the start date. */
export function LengthPresets({ start, end, onPick }: { start: string; end: string; onPick: (days: number) => void }) {
  const { t } = useI18n();
  const current = lengthInDays(start, end);
  return (
    <div className="schedule-presets" role="group" aria-label={t("How long it runs")}>
      {LENGTH_PRESETS.map((preset) => (
        <button key={preset.days} type="button" aria-pressed={current === preset.days} className={current === preset.days ? "selected" : ""} onClick={() => onPick(preset.days)}>
          {current === preset.days ? <Check aria-hidden="true" size={13} /> : null}
          {t(preset.label)}
        </button>
      ))}
    </div>
  );
}

/**
 * Time-of-day slots. All day is the default. Choosing a slot narrows the
 * booking to it; clearing every slot returns to all day, so a booking always
 * has a time to run.
 */
export function DaypartPicker({ value, onChange, dailyRate }: { value: readonly DaypartId[]; onChange: (next: DaypartId[]) => void; dailyRate: (dayparts: DaypartId[]) => string }) {
  const { t } = useI18n();
  const allDay = isAllDay(value);
  function toggle(id: DaypartId) {
    const chosen = new Set(allDay ? [] : value);
    if (chosen.has(id)) chosen.delete(id);
    else chosen.add(id);
    const next = DAYPARTS.map((daypart) => daypart.id).filter((slot) => chosen.has(slot));
    onChange(next.length === DAYPARTS.length ? [] : next);
  }
  return (
    <fieldset className="schedule-dayparts">
      <legend>{t("Time of day")}</legend>
      <small id="schedule-dayparts-help">{t("Times are Toronto time. You pay only for the hours you choose.")}</small>
      <div className="schedule-daypart-grid" aria-describedby="schedule-dayparts-help">
        <button type="button" aria-pressed={allDay} className={allDay ? "selected" : ""} onClick={() => onChange([])}>
          <span className="schedule-daypart-mark" aria-hidden="true">{allDay ? <Check size={13} /> : null}</span>
          <span><strong>{t("All day")}</strong><small>{t("24 hours")} · {dailyRate([])}</small></span>
        </button>
        {DAYPARTS.map((daypart) => {
          const selected = !allDay && value.includes(daypart.id);
          return (
            <button key={daypart.id} type="button" aria-pressed={selected} className={selected ? "selected" : ""} onClick={() => toggle(daypart.id)}>
              <span className="schedule-daypart-mark" aria-hidden="true">{selected ? <Check size={13} /> : null}</span>
              <span><strong>{t(daypart.label)}</strong><small>{t(daypart.hours)} · {dailyRate([daypart.id])}</small></span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * A five-week calendar of open, busy and full days for the current request.
 * Clicking a day moves the start there and keeps the run length.
 */
export function AvailabilityCalendar({ input, start, onPickStart, loading }: { input: CalendarInput; start: string; onPickStart: (date: string) => void; loading?: boolean }) {
  const { formatDate, t } = useI18n();
  const anchor = isIsoDate(start) && start >= input.today ? start : input.today;
  const [from, setFrom] = useState(anchor);
  const [anchorSeen, setAnchorSeen] = useState(anchor);
  const weeks = useMemo(() => calendarWeeks(from, 5, input), [from, input]);
  const first = weeks[0][0].date;
  const last = weeks[weeks.length - 1][6].date;
  // A start date typed or picked outside the visible weeks brings its week
  // into view. Paging the calendar alone never moves the start.
  if (anchorSeen !== anchor) {
    setAnchorSeen(anchor);
    if (anchor < first || anchor > last) setFrom(anchor);
  }
  const canGoBack = first > input.today;
  const weekdays = weeks[0].map((day) => formatDate(`${day.date}T12:00:00`, { weekday: "narrow" }));
  const title = `${formatDate(`${first}T12:00:00`, { month: "short", day: "numeric" })} – ${formatDate(`${last}T12:00:00`, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="schedule-calendar" aria-busy={loading || undefined}>
      <div className="schedule-calendar-head">
        <strong id="schedule-calendar-title">{title}</strong>
        <div>
          <button type="button" className="schedule-calendar-nav" disabled={!canGoBack} aria-label={t("Earlier weeks")} onClick={() => setFrom((current) => { const back = addDays(current, -28); return back < input.today ? input.today : back; })}><ChevronLeft aria-hidden="true" size={16} /></button>
          <button type="button" className="schedule-calendar-nav" aria-label={t("Later weeks")} onClick={() => setFrom((current) => addDays(current, 28))}><ChevronRight aria-hidden="true" size={16} /></button>
        </div>
      </div>
      <table className="schedule-calendar-grid" aria-labelledby="schedule-calendar-title">
        <thead>
          <tr>{weekdays.map((label, index) => <th key={index} scope="col">{label}</th>)}</tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0].date}>
              {week.map((day) => {
                const label = `${formatDate(`${day.date}T12:00:00`, { weekday: "long", month: "long", day: "numeric" })}: ${t(statusLabels[day.status])}${day.inRange ? `, ${t("in your dates")}` : ""}`;
                return (
                  <td key={day.date}>
                    <button
                      type="button"
                      className={`schedule-day is-${day.status}${day.inRange ? " in-range" : ""}${day.isToday ? " is-today" : ""}`}
                      disabled={day.status === "unavailable"}
                      aria-label={label}
                      aria-pressed={day.date === start}
                      onClick={() => onPickStart(day.date)}
                    >
                      <span>{Number(day.date.slice(8))}</span>
                      <DayMark status={day.status} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="schedule-legend" aria-label={t("Calendar key")}>
        {(["open", "limited", "full", "unavailable"] as const).map((status) => (
          <li key={status}><span className={`schedule-legend-swatch is-${status}`} aria-hidden="true"><DayMark status={status} /></span>{t(statusLabels[status])}</li>
        ))}
        <li><span className="schedule-legend-swatch in-range" aria-hidden="true" />{t("Your dates")}</li>
      </ul>
      <small className="schedule-calendar-help">{t("Pick a day to start there. The run length stays the same.")}</small>
    </div>
  );
}

// Each state has its own shape, so the calendar never relies on colour alone.
function DayMark({ status }: { status: DayStatus }) {
  if (status === "full") return <X className="schedule-day-mark" aria-hidden="true" size={10} strokeWidth={3} />;
  if (status === "limited") return <i className="schedule-day-mark is-half" aria-hidden="true" />;
  return null;
}
