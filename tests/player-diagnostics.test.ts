import { expect, test } from "vitest";
import { diagnosticIssues, parsePlayerDiagnostics } from "../app/lib/player-diagnostics";
import { browserHealth, browserReport } from "./helpers/kiosk-diagnostics-fixtures";

test("diagnostics retain only bounded operational fields", () => {
  const report = browserReport();
  expect(parsePlayerDiagnostics({ ...report, privateUrl: "https://private.example", credential: "secret" })).toEqual(report);
});
test.each([{ width: -1 }, { cacheBytes: Infinity }, { storedReports: 50001 }, { expectedDurationMs: 3600001 }, { wakeLock: "unknown" }, { sessionId: "invalid" }, { clientTime: "yesterday" }, { browserVersion: "arbitrary private text" }, { kiosk: "true" }])("rejects invalid diagnostics %j", fields => {
  expect(() => parsePlayerDiagnostics({ ...browserReport(), ...fields })).toThrow("Invalid browser diagnostics.");
});
test("native OS kiosk does not require the fullscreen API to indicate a healthy browser", () => {
  expect(diagnosticIssues(browserHealth())).toEqual([]);
});
test("contact and diagnostic freshness are evaluated using server receipt times", () => {
  expect(diagnosticIssues(browserHealth({ lastSeenAt: new Date(Date.now() - 100000).toISOString() }))).toEqual(["Connection stale"]);
  expect(diagnosticIssues(browserHealth({ diagnosticsAt: new Date(Date.now() - 100000).toISOString() }))).toEqual(["Browser diagnostics unavailable"]);
  expect(diagnosticIssues(browserHealth({ staleMs: 180000, lastSeenAt: new Date(Date.now() - 100000).toISOString() }))).toEqual([]);
});
test("flags clock drift, revision lag, storage pressure and hidden tabs", () => {
  const issues = diagnosticIssues(browserHealth({ expectedRevision: 2, clockSkewMs: 125000, diagnostics: browserReport({ visible: false, storedReports: 45000, usageBytes: 9500000 }) }));
  expect(issues).toEqual(expect.arrayContaining(["Player tab hidden", "Device clock differs from server", "Content update pending", "Playback report queue nearly full", "Browser storage nearly full"]));
});
test("long reserved loop waits and scheduled gaps do not trigger overdue progress", () => {
  expect(diagnosticIssues(browserHealth({ diagnostics: browserReport({ playback: "waiting", progressAgeMs: 90000, expectedDurationMs: 120000 }) }))).toEqual([]);
  expect(diagnosticIssues(browserHealth({ diagnostics: browserReport({ playback: "empty", progressAgeMs: 200000 }) }))).toEqual([]);
  expect(diagnosticIssues(browserHealth({ diagnostics: browserReport({ playback: "playing", progressAgeMs: 25000 }) }))).toContain("Playback progress overdue");
});
