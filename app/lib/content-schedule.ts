/** Local wall-clock rules shared by the server and offline player. */
export type ContentSchedule = {
  version: 1;
  timezone: string;
  daysOfWeek: number[]; // Sunday = 0. Overnight windows belong to their starting day.
  startTime: string;
  endTime: string; // 24:00 is allowed only here.
  startDate: string | null;
  endDate: string | null; // Inclusive starting date, including its overnight tail.
  paused: boolean;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timezone: string) {
  let value = formatters.get(timezone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    // Keep this cache bounded when validating user-supplied zones.
    if (formatters.size >= 64) formatters.clear();
    formatters.set(timezone, value);
  }
  return value;
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function minutes(value: string) { return Number(value.slice(0, 2)) * 60 + Number(value.slice(3)); }

export function parseContentSchedule(input: unknown): ContentSchedule | null {
  if (input === null) return null;
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a valid recurring schedule.");
  const rule = input as Record<string, unknown>;
  if (rule.version !== 1 || typeof rule.paused !== "boolean") throw new Error("Choose a valid recurring schedule.");
  if (typeof rule.timezone !== "string" || rule.timezone.length > 100 || !/^[A-Za-z_+\-/0-9]+$/.test(rule.timezone)) throw new Error("Choose a valid timezone.");
  try { formatter(rule.timezone); } catch { throw new Error("Choose a valid timezone."); }
  if (!Array.isArray(rule.daysOfWeek) || !rule.daysOfWeek.length || rule.daysOfWeek.length > 7 || rule.daysOfWeek.some(day => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error("Select at least one weekday.");
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (typeof rule.startTime !== "string" || !time.test(rule.startTime) || typeof rule.endTime !== "string" || !(time.test(rule.endTime) || rule.endTime === "24:00") || rule.startTime === rule.endTime) throw new Error("Choose different start and end times.");
  if ((rule.startDate !== null && !validDate(rule.startDate)) || (rule.endDate !== null && !validDate(rule.endDate)) || (typeof rule.startDate === "string" && typeof rule.endDate === "string" && rule.endDate < rule.startDate)) throw new Error("Choose a valid date range.");
  return { version: 1, timezone: rule.timezone, daysOfWeek: [...new Set(rule.daysOfWeek as number[])].sort((a, b) => a - b), startTime: rule.startTime, endTime: rule.endTime, startDate: rule.startDate as string | null, endDate: rule.endDate as string | null, paused: rule.paused };
}

function localClock(now: number, timezone: string) {
  const parts = Object.fromEntries(formatter(timezone).formatToParts(now).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
function shiftDate(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export function contentScheduleEligible(input: unknown, now = Date.now()): boolean {
  if (input === null || input === undefined) return true; // Legacy content remains always available.
  try {
    const rule = parseContentSchedule(input)!;
    if (rule.paused || !Number.isFinite(now)) return false;
    const local = localClock(now, rule.timezone);
    const start = minutes(rule.startTime), end = minutes(rule.endTime);
    let anchor = local.date;
    if (end < start) {
      if (local.minute < end) anchor = shiftDate(anchor, -1);
      else if (local.minute < start) return false;
    } else if (local.minute < start || local.minute >= end) return false;
    return (!rule.startDate || anchor >= rule.startDate) && (!rule.endDate || anchor <= rule.endDate) && rule.daysOfWeek.includes(new Date(`${anchor}T00:00:00Z`).getUTCDay());
  } catch { return false; } // Corrupt or unsupported cached rules fail closed.
}

export function contentScheduleState(input: unknown, now = Date.now()): "active" | "scheduled" | "paused" | "ended" | "invalid" {
  if (input == null) return "active";
  try {
    const rule = parseContentSchedule(input)!;
    if (rule.paused) return "paused";
    if (contentScheduleEligible(rule, now)) return "active";
    if (rule.endDate) {
      const local = localClock(now, rule.timezone);
      const lastDate = shiftDate(rule.endDate, minutes(rule.endTime) < minutes(rule.startTime) ? 1 : 0);
      if (local.date > lastDate || (local.date === lastDate && local.minute >= minutes(rule.endTime))) return "ended";
    }
    return "scheduled";
  } catch { return "invalid"; }
}
