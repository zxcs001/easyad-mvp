import type { PlayerDiagnostics } from "./player-diagnostics";
import { inspectPlayerStorage } from "./player-storage";

let wakeLock: PlayerDiagnostics["wakeLock"] = "not_requested";
let playback: PlayerDiagnostics["playback"] = "starting";
let expectedDurationMs = 0, progressAt = 0, autoRecoveries = 0;
let sessionId = "", startedAt = 0;
export function reportWakeLock(value: PlayerDiagnostics["wakeLock"]) { wakeLock = value; }
export function reportPlaybackActivity(state: PlayerDiagnostics["playback"], duration = 0) {
  playback = state; expectedDurationMs = duration; progressAt = performance.now();
}
export function playbackWatchdogOverdue() {
  return !document.hidden && ["playing", "waiting"].includes(playback) && performance.now() - progressAt > Math.max(20000, expectedDurationMs + 5000);
}
export function reserveAutomaticRecovery(storage: Pick<Storage, "getItem" | "setItem">, now = Date.now()) {
  try {
    const stored: unknown = JSON.parse(storage.getItem("easyad-player-auto-recovery") ?? "[]");
    if (!Array.isArray(stored) || stored.some(time => !Number.isFinite(time) || time > now + 120000)) return false;
    const recent = stored.filter(time => now - time < 600000);
    if (recent.length >= 3) return false;
    storage.setItem("easyad-player-auto-recovery", JSON.stringify([...recent, now]));
    autoRecoveries += 1;
    return true;
  } catch { return false; }
}
export async function browserDiagnostics(appliedRevision: number, override?: PlayerDiagnostics["playback"]): Promise<PlayerDiagnostics> {
  if (!sessionId) { sessionId = crypto.randomUUID(); startedAt = performance.now(); }
  const ua = navigator.userAgent;
  const browserMatch = ua.match(/(Edg|Chromium|Chrome)\/([\d.]+)/);
  const platform = /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other";
  // Diagnostics must not hold up heartbeats or recovery if browser storage stalls.
  const unavailable = { storageAvailable: false, cacheBytes: 0, assetCount: 0, storedReports: 0, shellReady: false, usageBytes: null, quotaBytes: null };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cache = await Promise.race([inspectPlayerStorage().catch(() => unavailable), new Promise<typeof unavailable>(resolve => { timeout = setTimeout(() => resolve(unavailable), 3000); })]);
  clearTimeout(timeout);
  return { version: 1, sessionId, clientTime: new Date().toISOString(), uptimeSeconds: Math.max(0, Math.round((performance.now() - startedAt) / 1000)), kiosk: new URL(location.href).searchParams.get("kiosk") === "1", visible: !document.hidden, fullscreen: Boolean(document.fullscreenElement), wakeLock, browser: browserMatch?.[1] === "Edg" ? "Edge" : browserMatch?.[1] === "Chromium" ? "Chromium" : browserMatch ? "Chrome" : "Other", browserVersion: browserMatch?.[2] ?? "", platform, width: Math.round(innerWidth), height: Math.round(innerHeight), secureContext: window.isSecureContext, webLocks: Boolean(navigator.locks), serviceWorker: "serviceWorker" in navigator, playback: document.hidden ? "hidden" : override ?? playback, progressAgeMs: Math.max(0, Math.round(performance.now() - progressAt)), expectedDurationMs, appliedRevision, autoRecoveries, ...cache };
}
