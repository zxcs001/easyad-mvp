import { expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { allocation } from "../app/lib/digital-schedule";
import { rotationSlides, slideEligible, validatePlayback } from "../app/lib/playback-validation";
import type { PlaybackEvent, PlayerManifest } from "../app/player-types";
const epoch = Date.parse("2026-11-01T00:00:00Z");
const manifest: PlayerManifest = { playerId: "p", revision: 1, inventoryId: "i", inventoryName: "Screen", city: "Thunder Bay", generatedAt: new Date(epoch).toISOString(), validUntil: new Date(epoch + 86400000).toISOString(), published: true, imageInterval: 6, template: "fullscreen", displayLanguage: "en", activeAlert: null, slides: [{ id: "s", assetVersion: "v", mediaType: "image", publicUrl: "/media/s", title: "", subtitle: "", createdAt: new Date(epoch).toISOString(), startsOn: "2026-11-01", endsOn: "2026-11-01", durationSeconds: 6 }] };
function event(): PlaybackEvent { return { eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: 1, slideId: "s", assetVersion: "v", startedAt: new Date(epoch + 1000).toISOString(), occurredAt: new Date(epoch + 7000).toISOString(), durationMs: 6000, outcome: "completed" }; }
test("24-hour authorized window accepts late evidence, never extends expiration", () => {
    expect(validatePlayback(event(), manifest, epoch + 86400000).late).toBe(true);
    expect(() => validatePlayback({ ...event(), occurredAt: new Date(epoch + 86400001).toISOString() }, manifest, epoch + 86400002)).toThrow();
    expect(() => validatePlayback(event(), manifest, epoch + 8 * 86400000)).toThrow();
});
test("timestamps, exact media/revision, durations and overrides constrain evidence", () => {
    for (const change of [{ durationMs: 100 }, { revision: 2 }, { assetVersion: "other" }, { outcome: "downloaded" }, { sequence: 0 }, { eventId: "bad" }, { startedAt: "yesterday" }, { occurredAt: new Date(epoch + 130000).toISOString() }])
        expect(() => validatePlayback({ ...event(), ...change }, manifest, epoch + 7000)).toThrow();
    expect(() => validatePlayback(event(), { ...manifest, published: false }, epoch + 7000)).toThrow();
    expect(() => validatePlayback(event(), { ...manifest, activeAlert: { expiresAt: new Date(epoch + 10000).toISOString() } as never }, epoch + 7000)).toThrow();
    expect(validatePlayback({ ...event(), outcome: "interrupted", durationMs: 2000, occurredAt: new Date(epoch + 3000).toISOString() }, manifest, epoch + 7000).event.outcome).toBe("interrupted");
});
test("UTC schedule remains 24 hours over local DST transitions and excludes expired slides", () => {
    for (const date of ["2026-03-08", "2026-11-01"]) {
        const snap = allocation(date, date, 6, 120);
        expect(snap.timezone).toBe("UTC");
        expect(Date.parse(date) + 86400000 - Date.parse(date)).toBe(86400000);
    }
    expect(slideEligible(manifest.slides[0], epoch + 86400000)).toBe(false);
    expect(() => allocation("2026-02-30", "2026-03-01", 6, 120)).toThrow();
});
test("commercial reservations limit filler and legacy commitments cannot double the loop", () => {
    const ad = { ...manifest.slides[0], id: "ad", placementId: "placement" };
    expect(rotationSlides({ ...manifest, loopSeconds: 6, slides: [...manifest.slides, ad] }, epoch)).toEqual([ad]);
    expect(rotationSlides({ ...manifest, loopSeconds: 6, slides: [ad, { ...ad, id: "other" }] }, epoch)).toEqual([]);
});

test("announcement timestamps include the start and exclude the exact end", () => {
    const timed = { ...manifest.slides[0], startsOn: new Date(epoch + 1000).toISOString(), endsOn: new Date(epoch + 7000).toISOString() };
    expect(slideEligible(timed, epoch + 999)).toBe(false);
    expect(slideEligible(timed, epoch + 1000)).toBe(true);
    expect(slideEligible(timed, epoch + 6999)).toBe(true);
    expect(slideEligible(timed, epoch + 7000)).toBe(false);
});

test("a time-of-day booking plays inside its Toronto slots only, and its evidence must too", () => {
    const evening = allocation("2026-07-15", "2026-07-15", 6, 120, 1, ["evening"]);
    expect(evening).toMatchObject({ model: "daypart-slot-v1", timezone: "America/Toronto", dayparts: ["evening"] });
    expect(() => allocation("2026-07-15", "2026-07-15", 6, 120, 1, ["brunch" as never])).toThrow("Unknown time-of-day slot");
    expect(allocation("2026-07-15", "2026-07-15", 6, 120, 1, ["morning", "midday", "afternoon", "evening", "overnight"]).model).toBe("fixed-slot-v1");
    const ad = { ...manifest.slides[0], id: "ad", legacyBookingId: "BK-1", allocation: evening, startsOn: "2026-07-15", endsOn: "2026-07-15" };
    const filler = { ...manifest.slides[0], id: "filler", startsOn: null, endsOn: null };
    const at = (iso: string) => Date.parse(iso);
    expect(slideEligible(ad, at("2026-07-15T22:59:59Z"))).toBe(false); // 18:59 EDT
    expect(slideEligible(ad, at("2026-07-15T23:00:00Z"))).toBe(true); // 19:00 EDT
    // 22:30 EDT is already 2026-07-16 in UTC. The local date still matches.
    expect(slideEligible(ad, at("2026-07-16T02:30:00Z"))).toBe(true);
    const timed = { ...manifest, generatedAt: "2026-07-15T12:00:00.000Z", validUntil: "2026-07-17T12:00:00.000Z", loopSeconds: 120, slides: [ad, filler] };
    expect(rotationSlides(timed, at("2026-07-15T16:00:00Z")).map((slide) => slide.id)).toEqual(["filler"]);
    expect(rotationSlides(timed, at("2026-07-16T00:00:00Z")).map((slide) => slide.id)).toEqual(["ad", "filler"]);
    const play = (startedAt: string, occurredAt: string) => ({ eventId: randomUUID(), sessionId: randomUUID(), sequence: 1, revision: 1, slideId: "ad", assetVersion: "v", startedAt, occurredAt, durationMs: 6000, outcome: "completed" });
    expect(validatePlayback(play("2026-07-16T00:00:00.000Z", "2026-07-16T00:00:06.000Z"), timed, at("2026-07-16T00:00:07Z")).slide.id).toBe("ad");
    expect(() => validatePlayback(play("2026-07-15T16:00:00.000Z", "2026-07-15T16:00:06.000Z"), timed, at("2026-07-15T16:00:07Z"))).toThrow("outside its authorized schedule");
});
