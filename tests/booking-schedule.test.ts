import { describe, expect, test } from "vitest";
import {
  DAYPARTS,
  addDays,
  calendarWeeks,
  daypartAt,
  daypartHoursPerDay,
  daypartPriceShare,
  endForLength,
  findNextFreeRange,
  isScheduledNow,
  lengthInDays,
  localClock,
  parseDayparts,
  peakUsedInRange,
  planBudget,
  rangeFits,
  type CapacityInput,
} from "../app/lib/booking-schedule";

describe("time-of-day slots", () => {
  test("the five slots cover the day once and their prices add up to the daily rate", () => {
    expect(DAYPARTS.reduce((sum, daypart) => sum + daypart.priceShare, 0)).toBeCloseTo(1, 10);
    expect(daypartHoursPerDay(["morning", "midday", "afternoon", "evening", "overnight"])).toBe(24);
    for (let minute = 0; minute < 24 * 60; minute += 15) {
      const owners = DAYPARTS.filter((daypart) => daypart.endMinute > daypart.startMinute
        ? minute >= daypart.startMinute && minute < daypart.endMinute
        : minute >= daypart.startMinute || minute < daypart.endMinute);
      expect(owners).toHaveLength(1);
    }
  });

  test("a selection has one stored form: canonical order, no duplicates, and every slot is all day", () => {
    expect(parseDayparts("evening,morning,evening")).toEqual(["morning", "evening"]);
    expect(parseDayparts(["overnight", "morning", "midday", "afternoon", "evening"])).toEqual([]);
    expect(parseDayparts("")).toEqual([]);
    expect(parseDayparts(undefined)).toEqual([]);
    expect(parseDayparts("brunch")).toBeNull();
    expect(parseDayparts(42)).toBeNull();
  });

  test("slot prices and hours follow the selection", () => {
    expect(daypartPriceShare([])).toBe(1);
    expect(daypartPriceShare(["morning", "afternoon"])).toBe(0.5);
    expect(daypartPriceShare(["evening", "overnight"])).toBe(0.25);
    expect(daypartHoursPerDay(["morning"])).toBe(4);
    expect(daypartHoursPerDay(["overnight"])).toBe(7);
  });

  test("slot boundaries include the start minute and exclude the end minute", () => {
    expect(daypartAt(6 * 60 - 1)).toBe("overnight");
    expect(daypartAt(6 * 60)).toBe("morning");
    expect(daypartAt(10 * 60)).toBe("midday");
    expect(daypartAt(23 * 60)).toBe("overnight");
    expect(daypartAt(0)).toBe("overnight");
  });

  test("Toronto wall-clock time follows daylight saving time", () => {
    // The clocks go forward at 2:00 a.m. EST (07:00 UTC) on 2026-03-08.
    expect(localClock(Date.parse("2026-03-08T06:30:00Z"))).toEqual({ date: "2026-03-08", minute: 90 });
    expect(localClock(Date.parse("2026-03-08T07:30:00Z"))).toEqual({ date: "2026-03-08", minute: 3 * 60 + 30 });
    // Summer: UTC-4. 10:00 UTC is 06:00 local, the first minute of the morning slot.
    expect(localClock(Date.parse("2026-07-15T10:00:00Z"))).toEqual({ date: "2026-07-15", minute: 6 * 60 });
    // Winter: UTC-5. The same UTC instant is 05:00 local, still overnight.
    expect(localClock(Date.parse("2026-12-15T10:00:00Z"))).toEqual({ date: "2026-12-15", minute: 5 * 60 });
  });

  test("a time-of-day booking plays on Toronto dates inside its slots only", () => {
    const schedule = { startDate: "2026-07-15", endDate: "2026-07-16", dayparts: ["evening" as const], timezone: "America/Toronto" };
    expect(isScheduledNow(schedule, Date.parse("2026-07-15T22:59:00Z"))).toBe(false); // 18:59 local
    expect(isScheduledNow(schedule, Date.parse("2026-07-15T23:00:00Z"))).toBe(true); // 19:00 local
    // 22:30 local on the last day is already the next UTC date. It still plays.
    expect(isScheduledNow(schedule, Date.parse("2026-07-17T02:30:00Z"))).toBe(true);
    expect(isScheduledNow(schedule, Date.parse("2026-07-17T03:00:00Z"))).toBe(false); // 23:00 local
    expect(isScheduledNow(schedule, Date.parse("2026-07-17T23:30:00Z"))).toBe(false); // the day after the end
  });
});

describe("dates and lengths", () => {
  test("lengths are inclusive and presets end on the right day", () => {
    expect(lengthInDays("2026-07-01", "2026-07-07")).toBe(7);
    expect(lengthInDays("2026-07-07", "2026-07-01")).toBe(0);
    expect(endForLength("2026-07-01", 7)).toBe("2026-07-07");
    expect(endForLength("2026-02-25", 7)).toBe("2026-03-03");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("capacity", () => {
  const base: CapacityInput = { capacitySeconds: 30, requestSeconds: 10, commitments: [] };

  test("bookings in different time-of-day slots do not share loop time", () => {
    const commitments = [{ start: "2026-07-01", end: "2026-07-31", seconds: 30, dayparts: ["morning" as const] }];
    expect(rangeFits("2026-07-10", "2026-07-12", { ...base, commitments, dayparts: ["evening"] })).toBe(true);
    expect(rangeFits("2026-07-10", "2026-07-12", { ...base, commitments, dayparts: ["morning", "evening"] })).toBe(false);
    // All day occupies every slot, so it collides with the morning booking.
    expect(rangeFits("2026-07-10", "2026-07-12", { ...base, commitments })).toBe(false);
  });

  test("bookings that never run on the same day do not add up", () => {
    const commitments = [
      { start: "2026-07-01", end: "2026-07-05", seconds: 20 },
      { start: "2026-07-06", end: "2026-07-10", seconds: 20 },
    ];
    expect(peakUsedInRange("2026-07-01", "2026-07-10", [], commitments)).toBe(20);
    expect(rangeFits("2026-07-01", "2026-07-10", { ...base, commitments })).toBe(true);
    expect(rangeFits("2026-07-01", "2026-07-10", { ...base, requestSeconds: 11, commitments })).toBe(false);
  });

  test("the next free range keeps the run length and skips the full days", () => {
    const commitments = [{ start: "2026-07-01", end: "2026-07-09", seconds: 30 }];
    const fits = (start: string, end: string) => rangeFits(start, end, { ...base, commitments });
    expect(findNextFreeRange("2026-07-01", 7, fits)).toEqual({ start: "2026-07-10", end: "2026-07-16" });
    expect(findNextFreeRange("2026-07-01", 7, () => false, 30)).toBeNull();
  });

  test("the calendar marks past, full, busy and open days", () => {
    const commitments = [
      { start: "2026-07-08", end: "2026-07-08", seconds: 30 },
      { start: "2026-07-09", end: "2026-07-09", seconds: 20 },
    ];
    const weeks = calendarWeeks("2026-07-07", 5, { today: "2026-07-07", capacity: { ...base, commitments }, rangeStart: "2026-07-10", rangeEnd: "2026-07-11" });
    const day = (date: string) => weeks.flat().find((entry) => entry.date === date)!;
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0].date).toBe("2026-07-05"); // Sunday
    expect(day("2026-07-06").status).toBe("unavailable");
    expect(day("2026-07-07")).toMatchObject({ status: "open", isToday: true });
    expect(day("2026-07-08").status).toBe("full");
    expect(day("2026-07-09").status).toBe("limited");
    expect(day("2026-07-10")).toMatchObject({ status: "open", inRange: true });
    expect(day("2026-07-12").inRange).toBe(false);
  });
});

describe("budget-first planning", () => {
  const costFor = (daily: number) => (days: number) => Math.round(daily * days);

  test("a budget buys the most whole days without going over", () => {
    expect(planBudget(1000, 312.5, costFor(312.5))).toEqual({ days: 3, total: 938, leftover: 62 });
    expect(planBudget(625, 312.5, costFor(312.5))).toEqual({ days: 2, total: 625, leftover: 0 });
  });

  test("rounding never makes the quote exceed the budget", () => {
    // Three days cost 99.9, which the quote rounds up to 100: more than a 99.90 budget.
    const plan = planBudget(99.9, 33.3, costFor(33.3));
    expect(plan.days).toBe(2);
    expect(plan.total).toBeLessThanOrEqual(99.9);
  });

  test("a budget below one day buys nothing and a huge budget stops at one year", () => {
    expect(planBudget(50, 100, costFor(100))).toEqual({ days: 0, total: 0, leftover: 50 });
    expect(planBudget(Number.NaN, 100, costFor(100)).days).toBe(0);
    expect(planBudget(10_000_000, 100, costFor(100)).days).toBe(365);
  });
});
