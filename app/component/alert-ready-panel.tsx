"use client";

import "./alert-ready-panel.css";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CircleSlash, Radio, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useI18n } from "../i18n/client";
import { PanelHeading } from "./shared-ui";
import type { AlertReadyMode, OfficialAlertSummary } from "../lib/alert-ready/relay";

type Snapshot = {
  enabled: boolean;
  mode: AlertReadyMode;
  signatureConfigured: boolean;
  feed: { lastHeartbeatAt: string | null; lastAlertAt: string | null; healthy: boolean };
  alerts: OfficialAlertSummary[];
};

const modes: { id: AlertReadyMode; label: string; description: string }[] = [
  { id: "off", label: "Off", description: "Official alerts are not shown or listed for your screens." },
  { id: "review", label: "Ask me first", description: "Alerts that cover your screens appear here. A person chooses Show on screens." },
  { id: "automatic", label: "Show automatically", description: "Alerts marked Broadcast Immediately go on your screens in their area at once. Other alerts wait here." },
];

const stateLabels: Record<OfficialAlertSummary["state"], string> = {
  showing: "Showing on screens",
  waiting: "Not on screens",
  ended: "Ended on screens",
  expired: "Expired",
  replaced: "Replaced or cancelled",
};

/**
 * Official Alert Ready messages relayed from the NAAD System. EasyAD shows
 * them on the institution's own screens inside the alert area; it never issues
 * an alert. Hidden entirely while the relay is switched off.
 */
export default function AlertReadyPanel({ institutionId, onScreensChanged, onEnd }: { institutionId: string; onScreensChanged: () => void; onEnd: (id: string) => Promise<{ error?: string }> }) {
  const { t, formatDate } = useI18n();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const query = institutionId ? `?institutionId=${encodeURIComponent(institutionId)}` : "";

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/institution/alert-ready${query}`, { signal, cache: "no-store" });
      if (response.status === 404) { setSnapshot(null); return "off"; }
      if (!response.ok) throw new Error();
      setSnapshot(await response.json());
      setError("");
    } catch {
      if (!signal?.aborted) setError("Alert Ready status could not be loaded. It will retry.");
    }
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    void load(controller.signal).then((state) => { if (state !== "off") timer = setInterval(() => void load(controller.signal), 15_000); });
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  async function changeMode(mode: AlertReadyMode) {
    setBusy("mode"); setError("");
    try {
      const response = await fetch("/api/institution/alert-ready", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, institutionId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The setting was not saved. Try again.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The setting was not saved. Try again."); }
    finally { setBusy(""); }
  }

  async function show(alert: OfficialAlertSummary) {
    setBusy(alert.key); setError("");
    try {
      const response = await fetch("/api/institution/alert-ready/show", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: alert.key, institutionId }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "The alert was not shown. Try again.");
      await load(); onScreensChanged();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The alert was not shown. Try again."); }
    finally { setBusy(""); }
  }

  async function end(alert: OfficialAlertSummary) {
    setBusy(alert.key); setError("");
    for (const id of alert.showingAlertIds) {
      const result = await onEnd(id);
      if (result.error) { setError(result.error); break; }
    }
    await load(); onScreensChanged(); setBusy("");
  }

  if (!snapshot) return error ? <p className="form-error" role="alert">{t(error)}</p> : null;
  const time = (value: string | null) => value ? formatDate(value, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : t("Not reported");
  const feedLabel = snapshot.feed.healthy ? "Feed connected" : snapshot.feed.lastHeartbeatAt ? "No signal from the feed" : "Waiting for the feed";

  return (
    <section className="panel alert-ready" aria-label={t("Alert Ready")}>
      <PanelHeading eyebrow="Official alerts" title="Alert Ready" action={<span className={`status ${snapshot.feed.healthy ? "good" : "bad"}`}><Radio aria-hidden="true" />{t(feedLabel)}</span>} />
      <p className="alert-ready-intro">{t("Alert Ready messages come from the NAAD System, run by Pelmorex for Canada's public alerting. EasyAD shows them on your screens inside the alert area. It does not issue alerts.")}</p>
      <small className="alert-ready-heartbeat">{t("Last heartbeat: {time}", { time: time(snapshot.feed.lastHeartbeatAt) })}</small>
      <fieldset className="alert-ready-modes" disabled={busy === "mode"}>
        <legend>{t("When an alert covers your screens")}</legend>
        {modes.map((mode) => (
          <label key={mode.id} className={snapshot.mode === mode.id ? "selected" : ""}>
            <input type="radio" name="alert-ready-mode" checked={snapshot.mode === mode.id} onChange={() => void changeMode(mode.id)} />
            <span><strong>{t(mode.label)}</strong><small>{t(mode.description)}</small></span>
          </label>
        ))}
      </fieldset>
      {snapshot.mode === "automatic" && !snapshot.signatureConfigured ? (
        <p className="alert-ready-caution" role="note"><ShieldQuestion aria-hidden="true" />{t("Automatic display needs the Pelmorex signing certificate (ALERT_READY_SIGNING_CERTS). Until it is set, every alert waits for a person to show it.")}</p>
      ) : null}
      {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
      {snapshot.mode === "off" ? null : !snapshot.alerts.length ? <p className="alert-ready-empty">{t("No official alerts have covered your screens yet.")}</p> : (
        <ul className="alert-ready-list">
          {snapshot.alerts.map((alert) => {
            const approximate = alert.screens.some((screen) => screen.match === "census-subdivision-approximate" || screen.match === "province");
            return (
              <li key={alert.key} className={`is-${alert.state}`}>
                <div className="alert-ready-item-head">
                  <span className="alert-ready-icon">{alert.state === "showing" ? <ShieldAlert aria-hidden="true" /> : <CircleSlash aria-hidden="true" />}</span>
                  <div>
                    <strong>{alert.headline}</strong>
                    <small>{alert.areaDescription} · {t("Sent {time}", { time: time(alert.sent) })}{alert.expiresAt ? ` · ${t("Expires {time}", { time: time(alert.expiresAt) })}` : ""}</small>
                  </div>
                  <span className={`status ${alert.state === "showing" ? "bad" : ""}`}>{t(stateLabels[alert.state])}</span>
                </div>
                <div className="alert-ready-tags">
                  {alert.broadcastImmediately ? <span>{t("Broadcast Immediately")}</span> : null}
                  <span className={alert.signature === "verified" ? "is-verified" : ""}>{alert.signature === "verified" ? <BadgeCheck aria-hidden="true" /> : <ShieldQuestion aria-hidden="true" />}{t(alert.signature === "verified" ? "Signature verified" : alert.signature === "unsigned" ? "Not signed" : "Signature not verified")}</span>
                  <span>{t(alert.screens.length === 1 ? "{count} of your screens is in the area" : "{count} of your screens are in the area", { count: alert.screens.length })}{approximate ? ` · ${t("approximate area")}` : ""}</span>
                </div>
                <details><summary>{t("Screens in the area")}</summary><ul>{alert.screens.map((screen) => <li key={screen.id}>{screen.name}<small>{t(screen.match === "polygon" ? "Inside the alert polygon" : screen.match === "census-division" ? "In the alert's census division" : screen.match === "province" ? "Province-wide alert" : "Census division of the named community (approximate)")}</small></li>)}</ul></details>
                <div className="alert-ready-actions">
                  {alert.state === "waiting" ? <button className="warning-button" type="button" disabled={Boolean(busy)} onClick={() => void show(alert)}>{t(alert.screens.length === 1 ? "Show on {count} screen" : "Show on {count} screens", { count: alert.screens.length })}</button> : null}
                  {alert.state === "showing" ? <button className="danger-button" type="button" disabled={Boolean(busy)} onClick={() => void end(alert)}>{t("End on my screens")}</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
