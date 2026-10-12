import type { FleetPlayerHealth, PlayerDiagnostics } from "../../app/lib/player-diagnostics";
export function browserReport(overrides: Partial<PlayerDiagnostics> = {}): PlayerDiagnostics {
  return { version: 1, sessionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", clientTime: new Date().toISOString(), uptimeSeconds: 60,
    kiosk: true, visible: true, fullscreen: false, wakeLock: "active", browser: "Chrome", browserVersion: "140.0.0.0", platform: "Windows",
    width: 1920, height: 1080, secureContext: true, webLocks: true, serviceWorker: true, playback: "playing", progressAgeMs: 1000, expectedDurationMs: 6000,
    appliedRevision: 1, autoRecoveries: 0, storageAvailable: true, cacheBytes: 100000, assetCount: 1, storedReports: 0, shellReady: true, usageBytes: 100000, quotaBytes: 10000000, ...overrides };
}
export function browserHealth(overrides: Partial<FleetPlayerHealth> = {}): FleetPlayerHealth {
  return { inventoryId: "INV-1", playerId: "PLY-1", connection: "online", lastSeenAt: new Date().toISOString(), expectedRevision: 1, appliedRevision: 1, error: null,
    diagnostics: browserReport(), diagnosticsAt: new Date().toISOString(), clockSkewMs: 0, commands: [], ...overrides };
}
