import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { PlayerManifest } from "../app/player-types";
import { restoredPlayerManifest } from "../app/lib/player-storage";

const now = Date.parse("2026-10-06T04:00:00Z");
const ordinary: PlayerManifest = {
  playerId: "P1", inventoryId: "I1", revision: 3, inventoryName: "Lobby", city: "Toronto",
  published: true, imageInterval: 6, template: "fullscreen", displayLanguage: "en", slides: [], activeAlert: null,
  generatedAt: new Date(now - 60_000).toISOString(), validUntil: new Date(now + 60_000).toISOString(),
};
const override: PlayerManifest = { ...ordinary, revision: 4, validUntil: new Date(now + 90_000).toISOString(), activeAlert: {
  id: "A1", institutionId: "ORG1", alertType: "public-safety", title: "Test alert", message: "Instructions",
  area: "Lobby", targetDeviceIds: ["I1"], issuedBy: "Operator", status: "active", createdBy: "USR1", endedAt: null,
  createdAt: new Date(now - 30_000).toISOString(), expiresAt: new Date(now + 1000).toISOString(),
} };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());

test("an active emergency always takes precedence over a cached ordinary snapshot", () => {
  expect(restoredPlayerManifest({ manifest: override, fallback: ordinary })).toBe(override);
});

test("expired alerts resume the original authorized revision without renewing its lease", () => {
  vi.setSystemTime(now + 1000);
  expect(restoredPlayerManifest({ manifest: override, fallback: ordinary })).toBe(ordinary);
  vi.setSystemTime(now + 60_000);
  expect(restoredPlayerManifest({ manifest: override, fallback: ordinary })).toBeUndefined();
});

test.each([
  { playerId: "P2" }, { inventoryId: "I2" }, { privateContent: true }, { published: false },
  { generatedAt: new Date(now + 180_000).toISOString() }, { activeAlert: override.activeAlert },
])("an expired alert cannot restore ordinary content across an invalid boundary: %j", change => {
  vi.setSystemTime(now + 1000);
  expect(restoredPlayerManifest({ manifest: override, fallback: { ...ordinary, ...change } })).toBeUndefined();
});

test("unpublishing and backward clock changes prevent both alert and fallback restoration", () => {
  expect(restoredPlayerManifest({ manifest: override, fallback: ordinary, observedAt: now + 120_001 })).toBeUndefined();
  vi.setSystemTime(now + 1000);
  expect(restoredPlayerManifest({ manifest: { ...override, published: false }, fallback: ordinary })).toBeUndefined();
});

test("an expired alert without a complete ordinary snapshot stays neutral", () => {
  vi.setSystemTime(now + 1000);
  expect(restoredPlayerManifest({ manifest: override })).toBeUndefined();
});
