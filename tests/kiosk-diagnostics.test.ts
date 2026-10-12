/** @vitest-environment jsdom */
import { afterEach, expect, test, vi } from "vitest";
vi.mock("../app/lib/player-storage", () => ({ inspectPlayerStorage: vi.fn(() => new Promise(() => {})) }));
import { browserDiagnostics, playbackWatchdogOverdue, reportPlaybackActivity, reserveAutomaticRecovery } from "../app/lib/kiosk-diagnostics";
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); sessionStorage.clear(); });
test("automatic restarts stop after three attempts and recover their budget after ten minutes", () => {
  for (let i = 0; i < 3; i++) expect(reserveAutomaticRecovery(sessionStorage, 1000000 + i)).toBe(true);
  expect(reserveAutomaticRecovery(sessionStorage, 1000004)).toBe(false);
  expect(reserveAutomaticRecovery(sessionStorage, 1600005)).toBe(true);
  sessionStorage.setItem("easyad-player-auto-recovery", "[99999999999]");
  expect(reserveAutomaticRecovery(sessionStorage, 1600005)).toBe(false);
  expect(reserveAutomaticRecovery({ getItem: () => { throw new Error("blocked"); }, setItem: vi.fn() })).toBe(false);
});
test("watchdog respects deliberate loop waits, emergency content, and hidden pages", () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(100);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  reportPlaybackActivity("waiting", 120000);
  now.mockReturnValue(110000); expect(playbackWatchdogOverdue()).toBe(false);
  now.mockReturnValue(126000); expect(playbackWatchdogOverdue()).toBe(true);
  reportPlaybackActivity("emergency"); now.mockReturnValue(500000); expect(playbackWatchdogOverdue()).toBe(false);
  reportPlaybackActivity("playing", 6000); now.mockReturnValue(600000);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true); expect(playbackWatchdogOverdue()).toBe(false);
});
test("stalled browser storage cannot block a heartbeat's diagnostics", async () => {
  vi.useFakeTimers();
  const pending = browserDiagnostics(9);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toMatchObject({ appliedRevision: 9, storageAvailable: false, quotaBytes: null });
});
