import { expect, test } from "vitest";
import { contentScheduleEligible as eligible, contentScheduleState, parseContentSchedule, type ContentSchedule } from "../app/lib/content-schedule";
import { slideEligible, validatePlayback } from "../app/lib/playback-validation";
import type { PlayerManifest } from "../app/player-types";
import { randomUUID } from "node:crypto";

const rule: ContentSchedule = { version: 1, timezone: "America/Toronto", daysOfWeek: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00", startDate: "2026-10-01", endDate: "2026-10-31", paused: false };
const at = Date.parse;
test("local weekdays and dates include starts and exclude ends", () => {
  for (const [timestamp, expected] of [["2026-10-12T12:59:59Z", false], ["2026-10-12T13:00:00Z", true], ["2026-10-12T20:59:59Z", true], ["2026-10-12T21:00:00Z", false], ["2026-10-11T14:00:00Z", false], ["2026-09-30T14:00:00Z", false], ["2026-11-02T14:00:00Z", false]] as const) expect(eligible(rule, at(timestamp))).toBe(expected);
  expect(eligible(null, at("2026-10-11T14:00Z"))).toBe(true);
  expect(eligible({ ...rule, paused: true }, at("2026-10-12T14:00Z"))).toBe(false);
  expect(contentScheduleState({ ...rule, paused: true })).toBe("paused");
});
test("overnight belongs to its starting weekday and inclusive final date", () => {
  const overnight = { ...rule, daysOfWeek: [5], startTime: "22:00", endTime: "02:00", startDate: "2026-10-09", endDate: "2026-10-09" };
  expect(eligible(overnight, at("2026-10-10T01:59:59Z"))).toBe(false);
  expect(eligible(overnight, at("2026-10-10T02:00:00Z"))).toBe(true);
  expect(eligible(overnight, at("2026-10-10T05:59:59Z"))).toBe(true);
  expect(eligible(overnight, at("2026-10-10T06:00:00Z"))).toBe(false);
  expect(eligible(overnight, at("2026-10-11T03:00:00Z"))).toBe(false);
  expect(contentScheduleState(overnight, at("2026-10-10T06:00Z"))).toBe("ended");
});
test("all day uses local calendar days, with other zones and midnight respected", () => {
  const allDay = { ...rule, timezone: "America/Vancouver", daysOfWeek: [1], startTime: "00:00", endTime: "24:00", startDate: null, endDate: null };
  expect(eligible(allDay, at("2026-10-12T06:59:59Z"))).toBe(false);
  expect(eligible(allDay, at("2026-10-12T07:00Z"))).toBe(true);
  expect(eligible(allDay, at("2026-10-13T06:59:59Z"))).toBe(true);
  expect(eligible(allDay, at("2026-10-13T07:00Z"))).toBe(false);
});
test("daylight saving skips nonexistent hours and repeats the same local fall window", () => {
  const dst = { ...rule, daysOfWeek: [0], startDate: null, endDate: null, startTime: "01:30", endTime: "02:30" };
  expect(eligible(dst, at("2026-03-08T06:30Z"))).toBe(true);
  expect(eligible(dst, at("2026-03-08T07:00Z"))).toBe(false); // Jump to 03:00.
  expect(eligible(dst, at("2026-11-01T05:30Z"))).toBe(true); // First 01:30.
  expect(eligible(dst, at("2026-11-01T06:30Z"))).toBe(true); // Second 01:30.
  expect(eligible(dst, at("2026-11-01T07:30Z"))).toBe(false);
  expect(eligible({ ...dst, startTime: "02:00", endTime: "03:00" }, at("2026-03-08T07:00Z"))).toBe(false);
});
test("malformed rules fail closed and validation returns stable normalized fields", () => {
  for (const change of [{ version: 2 }, { paused: "false" }, { timezone: "Mars/Olympus" }, { daysOfWeek: [] }, { daysOfWeek: [7] }, { startTime: "24:00" }, { endTime: "25:00" }, { endTime: "09:00" }, { startDate: "2026-02-30" }, { startDate: "2026-11-01" }]) {
    expect(() => parseContentSchedule({ ...rule, ...change })).toThrow();
    expect(eligible({ ...rule, ...change })).toBe(false);
  }
  expect(() => parseContentSchedule(undefined)).toThrow();
  expect(parseContentSchedule({ ...rule, daysOfWeek: [5, 1, 1] })?.daysOfWeek).toEqual([1, 5]);
});
test("playback intersects recurrence with absolute dates and preserves cutoff interruptions", () => {
  const start = at("2026-10-12T20:59:58Z"), end = start + 2300;
  const slide = { id: "s", assetVersion: "v", title: "", subtitle: "", mediaType: "image" as const, publicUrl: "/a.png", createdAt: new Date(start).toISOString(), startsOn: null, endsOn: null, durationSeconds: 2, contentSchedule: rule };
  expect(slideEligible({ ...slide, startsOn: "2026-10-13T00:00:00Z" }, start)).toBe(false);
  expect(slideEligible(slide, start)).toBe(true);
  const manifest: PlayerManifest = { playerId: "p", revision: 1, inventoryId: "i", inventoryName: "Screen", city: "", generatedAt: new Date(start - 10000).toISOString(), validUntil: new Date(start + 86400000).toISOString(), published: true, imageInterval: 2, template: "fullscreen", displayLanguage: "en", activeAlert: null, slides: [slide] };
  const event = { eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: 1, slideId: "s", assetVersion: "v", startedAt: new Date(start).toISOString(), occurredAt: new Date(end).toISOString(), durationMs: 2300, outcome: "interrupted" };
  expect(validatePlayback(event, manifest, end).event.outcome).toBe("interrupted");
  expect(() => validatePlayback({ ...event, outcome: "completed" }, manifest, end)).toThrow();
  expect(() => validatePlayback({ ...event, occurredAt: new Date(end + 1500).toISOString(), durationMs: 3800 }, manifest, end + 1500)).toThrow();
});
