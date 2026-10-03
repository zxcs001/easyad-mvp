import { expect, test } from "vitest";
import type { PlayerManifest } from "../app/player-types";
import { mustClearPreviousContent } from "../app/lib/player-client";
import { playerTiming, playersEnabled } from "../app/lib/players";
import { frPlayer } from "../app/i18n/fr-player";
import { hasTranslation } from "../app/i18n/messages";

const manifest: PlayerManifest = { playerId: "P", revision: 1, inventoryId: "I", inventoryName: "Screen", city: "City", published: true, imageInterval: 6, template: "fullscreen", displayLanguage: "en", generatedAt: "2026-09-04T00:00:00Z", validUntil: "2026-09-04T00:05:00Z", slides: [{ id: "M", assetVersion: "v1", title: "", subtitle: "", mediaType: "image", publicUrl: "/media/M", createdAt: "", startsOn: null, endsOn: null, durationSeconds: 6 }], activeAlert: null };
test("content removal and unpublishing clear the old renderer even if replacement media fails", () => {
  expect(mustClearPreviousContent(manifest, { ...manifest, published: false })).toBe(true);
  expect(mustClearPreviousContent(manifest, { ...manifest, slides: [] })).toBe(true);
  expect(mustClearPreviousContent(manifest, { ...manifest, slides: [{ ...manifest.slides[0], assetVersion: "v2" }] })).toBe(true);
  expect(mustClearPreviousContent(manifest, { ...manifest, revision: 2 })).toBe(false);
});
test("player controls are opt-in and timing has bounded defaults", () => {
  const saved = { flag: process.env.FEATURE_PLAYER_CONTROL, poll: process.env.PLAYER_POLL_MS, heartbeat: process.env.PLAYER_HEARTBEAT_MS };
  try {
    delete process.env.FEATURE_PLAYER_CONTROL;
    expect(playersEnabled()).toBe(false);
    process.env.FEATURE_PLAYER_CONTROL = "TRUE"; expect(playersEnabled()).toBe(false);
    process.env.FEATURE_PLAYER_CONTROL = "true"; expect(playersEnabled()).toBe(true);
    process.env.PLAYER_POLL_MS = "invalid"; process.env.PLAYER_HEARTBEAT_MS = "-1";
    expect(playerTiming()).toMatchObject({ pollMs: 10000, heartbeatMs: 5000 });
  } finally {
    for (const [key, value] of Object.entries({ FEATURE_PLAYER_CONTROL: saved.flag, PLAYER_POLL_MS: saved.poll, PLAYER_HEARTBEAT_MS: saved.heartbeat })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
test("player operational and failure copy has French coverage", () => {
  for (const key of Object.keys(frPlayer)) expect(hasTranslation("fr", key), key).toBe(true);
});
