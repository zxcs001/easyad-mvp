"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/client";
import { diagnosticIssues, type FleetPlayerHealth, type RecoveryKind } from "../lib/player-diagnostics";
import "./fleet-diagnostics.css";

export const recoveryLabels: Record<RecoveryKind, string> = { refresh_content: "Refresh content", reload_player: "Reload kiosk page", rebuild_cache: "Rebuild media cache" };
const errorLabels: Record<string, string> = { media_unavailable: "Media could not be loaded", connection_lost: "Connection lost", manifest_expired: "Content lease expired", storage_unavailable: "Browser storage unavailable" };
const commandLabels = { queued: "Queued", received: "Received by player", succeeded: "Reported complete", failed: "Recovery failed", expired: "Expired" };
const playbackLabels = { starting: "Starting", playing: "Content playing", waiting: "Waiting for next loop", empty: "No eligible content", hidden: "Player tab hidden", storage_paused: "Browser storage unavailable", emergency: "Emergency override", unpublished: "Screen unpublished", media_error: "Media could not be loaded" };
const wakeLabels = { active: "Active", requesting: "Requesting", released: "Released", unavailable: "Unavailable", insecure: "Insecure origin", not_requested: "Not requested" };
export default function FleetDiagnostics({ players, names, canRecover, enabled = true, selected = [], staleMs, onRefresh }: { players: FleetPlayerHealth[]; names: Record<string, string>; canRecover: boolean; enabled?: boolean; selected?: string[]; staleMs?: number; onRefresh: () => void }) {
  const { t, formatDate } = useI18n();
  const [attention, setAttention] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [results, setResults] = useState<Array<{ id: string; ok: boolean; error?: string }>>([]);
  const [now, setNow] = useState(Date.now());
  const pending = useRef<{ key: string; fingerprint: string } | null>(null);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const scope = selected.length ? players.filter(player => selected.includes(player.inventoryId)) : players;
  const visible = scope.filter(player => !attention || diagnosticIssues(player, now, staleMs).length);
  async function recover(kind: RecoveryKind, targets: FleetPlayerHealth[]) {
    if (busy || !targets.length) return;
    setBusy(true); setError(""); setResults([]);
    const fingerprint = JSON.stringify({ kind, targets: targets.map(player => ({ id: player.inventoryId, playerId: player.playerId })) });
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const single = targets.length === 1 ? targets[0] : null;
      const response = await fetch(single ? `/api/inventory/${encodeURIComponent(single.inventoryId)}/player/recovery` : "/api/institution/fleet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(single ? { kind, requestKey: pending.current.key, playerId: single.playerId } : { action: "recover_players", kind, requestKey: pending.current.key, targets: targets.map(player => ({ id: player.inventoryId, playerId: player.playerId })) }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Recovery request failed.");
      setResults(single ? [{ id: single.inventoryId, ok: true }] : payload.results); pending.current = null; onRefresh();
    } catch(failure) { setError(failure instanceof Error ? failure.message : "Recovery result uncertain. Refresh before retrying."); }
    finally { setBusy(false); }
  }
  const date = (value: string | null) => value ? formatDate(value, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : t("Not reported");
  return <section className="fleet-diagnostics" aria-label={t("Kiosk diagnostics and recovery")}>
    <h3>{t("Kiosk diagnostics and recovery")}</h3>
    <p>{t("Browser reports describe the kiosk page. They do not confirm the panel is powered on.")}</p>
    <label className="diagnostics-attention"><input type="checkbox" checked={attention} onChange={event => setAttention(event.target.checked)} />{t("Show screens needing attention")}</label>
    {canRecover && enabled && selected.length ? <div className="diagnostics-actions">{Object.entries(recoveryLabels).map(([kind, label]) => <button type="button" disabled={busy || scope.length > 100 || !scope.length} key={kind} onClick={() => void recover(kind as RecoveryKind, scope)}>{t("{action} on selected screens", { action: t(label) })}</button>)}</div> : null}
    <p>{t("Commands expire after 15 minutes. Offline or closed browsers must reconnect before they can receive a command.")}</p>
    {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
    <ul className="diagnostics-results" aria-live="polite">{results.map(result => <li key={result.id}>{names[result.id] ?? result.id}: {t(result.ok ? "Queued for player" : result.error ?? "Recovery request failed.")}</li>)}</ul>
    {visible.map(player => {
      const issues = diagnosticIssues(player, now, staleMs), d = player.diagnostics;
      const pendingCommand = player.commands.some(command => ["queued", "received"].includes(command.status) && Date.parse(command.expiresAt) > now);
      return <article className="diagnostics-card" key={player.inventoryId} aria-label={names[player.inventoryId] ?? player.inventoryId}>
        <div className="diagnostics-heading"><strong>{names[player.inventoryId] ?? player.inventoryId}</strong><span className={`status ${issues.length ? "warn" : "good"}`}>{t(!player.playerId ? "Not paired" : issues.length ? "Needs attention" : "Healthy browser")}</span></div>
        <ul>{issues.map(issue => <li key={issue}>{t(errorLabels[issue] ?? issue)}</li>)}</ul>
        <dl className="diagnostics-grid">
          <div><dt>{t("Last contact")}</dt><dd>{date(player.lastSeenAt)}</dd></div>
          <div><dt>{t("Server / applied revision")}</dt><dd>{player.expectedRevision} / {player.appliedRevision}</dd></div>
          <div><dt>{t("Browser report time")}</dt><dd>{date(player.diagnosticsAt)}</dd></div>
          <div><dt>{t("Clock difference")}</dt><dd>{player.clockSkewMs === null ? t("Not reported") : t("{seconds} seconds", { seconds: Math.round(player.clockSkewMs / 1000) })}</dd></div>
          {d ? <>
            <div><dt>{t("Browser")}</dt><dd>{d.browser} {d.browserVersion} · {d.platform}</dd></div>
            <div><dt>{t("Viewport")}</dt><dd>{d.width} × {d.height}</dd></div>
            <div><dt>{t("Kiosk / visible / fullscreen API")}</dt><dd>{[d.kiosk, d.visible, d.fullscreen].map(value => t(value ? "Yes" : "No")).join(" / ")}</dd></div>
            <div><dt>{t("Wake lock")}</dt><dd>{t(wakeLabels[d.wakeLock])}</dd></div>
            <div><dt>{t("Playback state")}</dt><dd>{t(playbackLabels[d.playback])}</dd></div>
            <div><dt>{t("Cached media")}</dt><dd>{d.assetCount} · {(d.cacheBytes / 1048576).toFixed(1)} MiB</dd></div>
            <div><dt>{t("Stored playback reports")}</dt><dd>{d.storedReports}</dd></div>
            <div><dt>{t("Offline shell ready")}</dt><dd>{t(d.shellReady ? "Yes" : "No")}</dd></div>
            <div><dt>{t("Browser storage used / quota")}</dt><dd>{d.usageBytes === null || d.quotaBytes === null ? t("Not reported") : `${Math.round(d.usageBytes / 1048576)} / ${Math.round(d.quotaBytes / 1048576)} MiB`}</dd></div>
            <div><dt>{t("Automatic recovery attempts")}</dt><dd>{d.autoRecoveries}</dd></div>
          </> : null}
        </dl>
        {canRecover && enabled && player.playerId ? <div className="diagnostics-actions">{Object.entries(recoveryLabels).map(([kind, label]) => <button type="button" key={kind} disabled={busy || pendingCommand} onClick={() => void recover(kind as RecoveryKind, [player])}>{t(label)}</button>)}</div> : null}
        {player.commands.length ? <ul className="diagnostics-history" aria-label={t("Recovery history")}>{player.commands.map(command => <li key={command.id}><strong>{t(recoveryLabels[command.kind])}</strong> · {t(commandLabels[command.status])} · {date(command.requestedAt)}</li>)}</ul> : null}
      </article>;
    })}
    {!visible.length ? <p>{t("No screens match these diagnostics filters.")}</p> : null}
    <p>{t("Rebuilding downloads fresh media before replacing the cache. Pairing and stored playback reports are preserved.")}</p>
    <p>{t("If Chrome is closed or the device is offline, check power, network, the kiosk launcher, and the dedicated browser profile on site.")}</p>
  </section>;
}
