/** Browser reports are operational hints, not proof that a physical panel is lit. */
export type PlayerDiagnostics = {
  version: 1; sessionId: string; clientTime: string; uptimeSeconds: number;
  kiosk: boolean; visible: boolean; fullscreen: boolean;
  wakeLock: "active" | "requesting" | "released" | "unavailable" | "insecure" | "not_requested";
  browser: "Chrome" | "Chromium" | "Edge" | "Other"; browserVersion: string;
  platform: "Windows" | "Android" | "macOS" | "Linux" | "Other";
  width: number; height: number; secureContext: boolean; webLocks: boolean; serviceWorker: boolean;
  playback: "starting" | "playing" | "waiting" | "empty" | "hidden" | "storage_paused" | "emergency" | "unpublished" | "media_error";
  progressAgeMs: number; expectedDurationMs: number; appliedRevision: number; autoRecoveries: number;
  storageAvailable: boolean; cacheBytes: number; assetCount: number; storedReports: number;
  shellReady: boolean; usageBytes: number | null; quotaBytes: number | null;
};
export const recoveryKinds = ["refresh_content", "reload_player", "rebuild_cache"] as const;
export type RecoveryKind = typeof recoveryKinds[number];
export type RecoveryCommand = { id: string; kind: RecoveryKind; status: "queued" | "received" | "succeeded" | "failed" | "expired"; requestedAt: string; expiresAt: string; finishedAt: string | null; result: string | null };
export type FleetPlayerHealth = { inventoryId: string; playerId: string | null; connection: "unpaired" | "waiting" | "online" | "stale"; staleMs?: number; lastSeenAt: string | null; expectedRevision: number; appliedRevision: number; error: string | null; diagnostics: PlayerDiagnostics | null; diagnosticsAt: string | null; clockSkewMs: number | null; commands: RecoveryCommand[] };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validRecoveryKey(value: unknown): value is string { return typeof value === "string" && uuid.test(value); }
export function parsePlayerDiagnostics(input: unknown): PlayerDiagnostics {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid browser diagnostics.");
  const value = input as Record<string, unknown>, result: Record<string, unknown> = { version: 1 };
  if (value.version !== 1 || !validRecoveryKey(value.sessionId) || typeof value.clientTime !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.clientTime) || !Number.isFinite(Date.parse(value.clientTime))) throw new Error("Invalid browser diagnostics.");
  result.sessionId = value.sessionId; result.clientTime = value.clientTime;
  for (const key of ["kiosk", "visible", "fullscreen", "secureContext", "webLocks", "serviceWorker", "storageAvailable", "shellReady"]) {
    if (typeof value[key] !== "boolean") throw new Error("Invalid browser diagnostics.");
    result[key] = value[key];
  }
  const ranges: Record<string, number> = { uptimeSeconds: 1e9, width: 32000, height: 32000, progressAgeMs: 1e12, expectedDurationMs: 3600000, appliedRevision: 2147483647, autoRecoveries: 1000000, cacheBytes: 1e12, assetCount: 10000, storedReports: 50000, usageBytes: 1e15, quotaBytes: 1e15 };
  for (const [key, maximum] of Object.entries(ranges)) {
    if (["usageBytes", "quotaBytes"].includes(key) && value[key] === null) { result[key] = null; continue; }
    if (!Number.isSafeInteger(value[key]) || Number(value[key]) < 0 || Number(value[key]) > maximum) throw new Error("Invalid browser diagnostics.");
    result[key] = value[key];
  }
  const choices: Record<string, readonly string[]> = { wakeLock: ["active", "requesting", "released", "unavailable", "insecure", "not_requested"], browser: ["Chrome", "Chromium", "Edge", "Other"], platform: ["Windows", "Android", "macOS", "Linux", "Other"], playback: ["starting", "playing", "waiting", "empty", "hidden", "storage_paused", "emergency", "unpublished", "media_error"] };
  for (const [key, allowed] of Object.entries(choices)) { if (!allowed.includes(String(value[key]))) throw new Error("Invalid browser diagnostics."); result[key] = value[key]; }
  if (typeof value.browserVersion !== "string" || !/^[\d.]{0,40}$/.test(value.browserVersion)) throw new Error("Invalid browser diagnostics.");
  result.browserVersion = value.browserVersion;
  return result as PlayerDiagnostics;
}

export function diagnosticIssues(health: FleetPlayerHealth, now = Date.now(), staleMs = health.staleMs ?? 90000): string[] {
  if (!health.playerId) return ["Not paired"];
  if (!health.lastSeenAt) return ["Waiting for contact"];
  if (now - Date.parse(health.lastSeenAt) > staleMs) return ["Connection stale"];
  const issues: string[] = [];
  if (health.error) issues.push(health.error);
  const d = health.diagnostics;
  if (!d || !health.diagnosticsAt || now - Date.parse(health.diagnosticsAt) > staleMs) { issues.push("Browser diagnostics unavailable"); return issues; }
  if (!d.visible) issues.push("Player tab hidden");
  if (!d.kiosk) issues.push("Kiosk mode is off");
  if (!d.secureContext || !d.webLocks || !d.serviceWorker) issues.push("Required browser capabilities unavailable");
  if (!d.storageAvailable) issues.push("storage_unavailable");
  if (d.storedReports > 40000) issues.push("Playback report queue nearly full");
  if (d.quotaBytes && d.usageBytes !== null && d.usageBytes / d.quotaBytes > .9) issues.push("Browser storage nearly full");
  if (!d.shellReady) issues.push("Offline player shell not ready");
  if (d.kiosk && d.wakeLock !== "active") issues.push("Check device power settings");
  if (health.clockSkewMs !== null && Math.abs(health.clockSkewMs) > 120000) issues.push("Device clock differs from server");
  if (["playing", "waiting"].includes(d.playback) && d.progressAgeMs > Math.max(20000, d.expectedDurationMs + 5000)) issues.push("Playback progress overdue");
  if (health.appliedRevision < health.expectedRevision) issues.push("Content update pending");
  return [...new Set(issues)];
}
