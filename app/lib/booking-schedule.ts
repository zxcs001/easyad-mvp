// Scheduling helpers for the advertiser booking flow: time-of-day slots,
// quick lengths, the availability calendar, the next free dates and
// budget-first planning. Pure functions only. The browser, the booking API,
// the capacity check and the player all import this file, so it must not
// import server code.

export const SCHEDULE_TIME_ZONE = "America/Toronto";

export type DaypartId = "morning" | "midday" | "afternoon" | "evening" | "overnight";

export type Daypart = {
  id: DaypartId;
  label: string;
  hours: string;
  /** Local start, in minutes after midnight. */
  startMinute: number;
  /** Local end, in minutes after midnight. Smaller than the start when the slot crosses midnight. */
  endMinute: number;
  /** Share of the daily rate. The five shares add up to 1, so all day costs the daily rate. */
  priceShare: number;
};

// Peak hours carry a larger share of the daily rate than their length alone.
// Evening and overnight cost less per hour because fewer people pass.
export const DAYPARTS: readonly Daypart[] = [
  { id: "morning", label: "Morning", hours: "6–10 a.m.", startMinute: 6 * 60, endMinute: 10 * 60, priceShare: 0.25 },
  { id: "midday", label: "Midday", hours: "10 a.m.–3 p.m.", startMinute: 10 * 60, endMinute: 15 * 60, priceShare: 0.25 },
  { id: "afternoon", label: "Afternoon drive", hours: "3–7 p.m.", startMinute: 15 * 60, endMinute: 19 * 60, priceShare: 0.25 },
  { id: "evening", label: "Evening", hours: "7–11 p.m.", startMinute: 19 * 60, endMinute: 23 * 60, priceShare: 0.15 },
  { id: "overnight", label: "Overnight", hours: "11 p.m.–6 a.m.", startMinute: 23 * 60, endMinute: 6 * 60, priceShare: 0.1 },
];

export const DAYPART_IDS: readonly DaypartId[] = DAYPARTS.map((daypart) => daypart.id);

const daypartById = new Map(DAYPARTS.map((daypart) => [daypart.id, daypart]));

/**
 * Reads a time-of-day selection from a form value, a JSON array or a database
 * array. The result is in the canonical order with no duplicates. An empty
 * result means all day, and a selection of every slot is stored as all day
 * too, so one schedule has one representation. Returns null for an unknown slot.
 */
export function parseDayparts(value: unknown): DaypartId[] | null {
  if (value === null || value === undefined || value === "") return [];
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : null;
  if (!raw) return null;
  const chosen = new Set<DaypartId>();
  for (const entry of raw) {
    const id = typeof entry === "string" ? entry.trim() : "";
    if (!id) continue;
    if (!daypartById.has(id as DaypartId)) return null;
    chosen.add(id as DaypartId);
  }
  if (chosen.size === DAYPART_IDS.length) return [];
  return DAYPART_IDS.filter((id) => chosen.has(id));
}

/** The slots a schedule occupies. All day occupies every slot. */
export function effectiveDayparts(dayparts: readonly DaypartId[] | undefined): readonly DaypartId[] {
  return dayparts && dayparts.length ? dayparts : DAYPART_IDS;
}

export function isAllDay(dayparts: readonly DaypartId[] | undefined) {
  return !dayparts || dayparts.length === 0 || dayparts.length === DAYPART_IDS.length;
}

export function daypartPriceShare(dayparts: readonly DaypartId[] | undefined) {
  if (isAllDay(dayparts)) return 1;
  return round4(dayparts!.reduce((sum, id) => sum + (daypartById.get(id)?.priceShare ?? 0), 0));
}

export function daypartHoursPerDay(dayparts: readonly DaypartId[] | undefined) {
  if (isAllDay(dayparts)) return 24;
  return dayparts!.reduce((sum, id) => {
    const daypart = daypartById.get(id);
    if (!daypart) return sum;
    const minutes = daypart.endMinute > daypart.startMinute ? daypart.endMinute - daypart.startMinute : 24 * 60 - daypart.startMinute + daypart.endMinute;
    return sum + minutes / 60;
  }, 0);
}

export function daypartAt(minuteOfDay: number): DaypartId {
  const found = DAYPARTS.find((daypart) => daypart.endMinute > daypart.startMinute
    ? minuteOfDay >= daypart.startMinute && minuteOfDay < daypart.endMinute
    : minuteOfDay >= daypart.startMinute || minuteOfDay < daypart.endMinute);
  return found?.id ?? "overnight";
}

export function daypartsInclude(dayparts: readonly DaypartId[] | undefined, minuteOfDay: number) {
  return isAllDay(dayparts) || dayparts!.includes(daypartAt(minuteOfDay));
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

/** The wall-clock date and minute of the day in a time zone. Intl applies daylight saving time. */
export function localClock(epochMs: number, timeZone = SCHEDULE_TIME_ZONE) {
  let formatter = clockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    clockFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(new Date(epochMs)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

/** True when a scheduled slot may play at this instant. */
export function isScheduledNow(schedule: { startDate: string; endDate: string; dayparts?: readonly DaypartId[]; timezone?: string }, epochMs: number) {
  const clock = localClock(epochMs, schedule.timezone || SCHEDULE_TIME_ZONE);
  return clock.date >= schedule.startDate && clock.date <= schedule.endDate && daypartsInclude(schedule.dayparts, clock.minute);
}

// --- Dates -------------------------------------------------------------------

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && isoDate.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Inclusive day count. */
export function lengthInDays(start: string, end: string) {
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return 0;
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

export const LENGTH_PRESETS = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 28, label: "4 weeks" },
] as const;

/** The end date for a run of `days` days that starts on `start`. */
export function endForLength(start: string, days: number) {
  return addDays(start, Math.max(1, Math.round(days)) - 1);
}

// --- Capacity ----------------------------------------------------------------

/** Loop time another booking already holds. It names no advertiser. */
export type LoopCommitment = {
  start: string;
  end: string;
  seconds: number;
  dayparts?: readonly DaypartId[];
};

/** What the booking calendar reads for one screen: GET /api/inventory/{id}/availability. */
export type ScreenAvailability = {
  inventoryId: string;
  deliveryMode: "digital" | "static";
  timeZone: string;
  slotSeconds: number;
  loopSeconds: number;
  /** Loop seconds open to advertisers after the owner's own reserved airtime. */
  capacitySeconds: number;
  availableFrom: string;
  availableTo: string;
  commitments: LoopCommitment[];
};

export type CapacityInput = {
  /** Seconds each loop can sell, after any institutional reserve. */
  capacitySeconds: number;
  /** Seconds this request needs each loop. */
  requestSeconds: number;
  dayparts?: readonly DaypartId[];
  commitments: readonly LoopCommitment[];
};

/** The most loop time used in the chosen slots on one date. */
export function peakUsedSeconds(date: string, dayparts: readonly DaypartId[] | undefined, commitments: readonly LoopCommitment[]) {
  let peak = 0;
  for (const slot of effectiveDayparts(dayparts)) {
    const used = commitments.reduce((sum, commitment) => commitment.start <= date && commitment.end >= date && effectiveDayparts(commitment.dayparts).includes(slot) ? sum + commitment.seconds : sum, 0);
    peak = Math.max(peak, used);
  }
  return peak;
}

export function fitsOnDate(date: string, input: CapacityInput) {
  return peakUsedSeconds(date, input.dayparts, input.commitments) + input.requestSeconds <= input.capacitySeconds;
}

const MAX_RANGE_DAYS = 400;

/** True when the request fits on every date of the range, in every chosen slot. */
export function rangeFits(start: string, end: string, input: CapacityInput) {
  const days = lengthInDays(start, end);
  if (!days || days > MAX_RANGE_DAYS) return false;
  if (input.requestSeconds > input.capacitySeconds) return false;
  const relevant = input.commitments.filter((commitment) => commitment.start <= end && commitment.end >= start);
  for (let offset = 0; offset < days; offset += 1) {
    if (!fitsOnDate(addDays(start, offset), { ...input, commitments: relevant })) return false;
  }
  return true;
}

/** The most loop time used on any date of the range, in the chosen slots. */
export function peakUsedInRange(start: string, end: string, dayparts: readonly DaypartId[] | undefined, commitments: readonly LoopCommitment[]) {
  const days = Math.min(lengthInDays(start, end), MAX_RANGE_DAYS);
  const relevant = commitments.filter((commitment) => commitment.start <= end && commitment.end >= start);
  let peak = 0;
  for (let offset = 0; offset < days; offset += 1) peak = Math.max(peak, peakUsedSeconds(addDays(start, offset), dayparts, relevant));
  return peak;
}

// --- Calendar ----------------------------------------------------------------

export type DayStatus = "open" | "limited" | "full" | "unavailable";

export type CalendarDay = {
  date: string;
  status: DayStatus;
  inRange: boolean;
  isToday: boolean;
  /** False for the days of the first week before the calendar's first date. */
  inMonth: boolean;
};

export type CalendarInput = {
  today: string;
  /** Static faces and screens outside their sale window. */
  isDateAvailable?: (date: string) => boolean;
  capacity?: CapacityInput;
  rangeStart?: string;
  rangeEnd?: string;
};

export function dayStatus(date: string, input: CalendarInput): DayStatus {
  if (date < input.today || (input.isDateAvailable && !input.isDateAvailable(date))) return "unavailable";
  if (!input.capacity) return "open";
  const used = peakUsedSeconds(date, input.capacity.dayparts, input.capacity.commitments);
  if (used + input.capacity.requestSeconds > input.capacity.capacitySeconds) return "full";
  return used * 2 > input.capacity.capacitySeconds ? "limited" : "open";
}

/** Weeks that start on Sunday and cover `weeks` weeks from the week of `from`. */
export function calendarWeeks(from: string, weeks: number, input: CalendarInput): CalendarDay[][] {
  const first = new Date(`${from}T00:00:00Z`);
  const gridStart = addDays(from, -first.getUTCDay());
  const rows: CalendarDay[][] = [];
  for (let week = 0; week < weeks; week += 1) {
    const row: CalendarDay[] = [];
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(gridStart, week * 7 + day);
      row.push({
        date,
        status: dayStatus(date, input),
        inRange: Boolean(input.rangeStart && input.rangeEnd && date >= input.rangeStart && date <= input.rangeEnd),
        isToday: date === input.today,
        inMonth: date >= from,
      });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * The earliest run of `days` days, on or after `from`, that passes `fits`.
 * Looks `horizonDays` ahead, then gives up.
 */
export function findNextFreeRange(from: string, days: number, fits: (start: string, end: string) => boolean, horizonDays = 180) {
  const length = Math.max(1, Math.round(days));
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const start = addDays(from, offset);
    const end = endForLength(start, length);
    if (fits(start, end)) return { start, end };
  }
  return null;
}

// --- Budget ------------------------------------------------------------------

export type BudgetPlan = {
  /** Whole days the budget pays for. Zero when it does not cover one day. */
  days: number;
  total: number;
  leftover: number;
};

export const MAX_BUDGET_DAYS = 365;

/**
 * How many whole days a budget buys at a daily cost. `costForDays` returns the
 * rounded total for a number of days, the same figure the booking stores, so
 * the plan never promises a total that the quote then exceeds.
 */
export function planBudget(budget: number, dailyCost: number, costForDays: (days: number) => number): BudgetPlan {
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(dailyCost) || dailyCost <= 0) return { days: 0, total: 0, leftover: Math.max(0, Number.isFinite(budget) ? budget : 0) };
  let days = Math.min(MAX_BUDGET_DAYS, Math.floor(budget / dailyCost + 1e-9));
  while (days > 0 && costForDays(days) > budget) days -= 1;
  const total = days ? costForDays(days) : 0;
  return { days, total, leftover: Math.round(budget - total) };
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}
