"use client";

import "./player-control.css";
import { useEffect, useRef, useState } from "react";
import type { PlayerStatus } from "../player-types";
import { useI18n } from "../i18n/client";
import { playerRequest, PlayerRequestError } from "../lib/player-client";
import { PanelHeading } from "./shared-ui";
import SecretInput from "./secret-input";
import AppDialog from "./app-dialog";
import { toast } from "./toast";

export default function PlayerControl({ inventoryId, screenName }: { inventoryId: string; screenName: string }) {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<PlayerStatus | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: string } | null>(null);
  const [disconnect, setDisconnect] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const endpoint = `/api/inventory/${encodeURIComponent(inventoryId)}/player`;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const response = await playerRequest(endpoint, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]) });
        const next = await response.json() as PlayerStatus;
        if (controller.signal.aborted) return;
        setStatus(next);
        setLoadError("");
        if (next.player) setPairing(null);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof PlayerRequestError ? error.message : "Player status is unavailable. Retry to refresh it.");
      } finally { if (!controller.signal.aborted) timer = setTimeout(load, 10_000); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [endpoint, refresh]);

  async function mutate(method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await playerRequest(endpoint, { method, headers: { "Content-Type": "application/json" }, body: method === "DELETE" ? JSON.stringify({ playerId: status?.player?.id }) : "{}", signal: AbortSignal.timeout(12_000) });
      if (method === "POST") setPairing(await response.json());
      else { setDisconnect(false); setStatus({ enabled: true, player: null }); toast.success("Player disconnected."); }
      setRefresh((value) => value + 1);
    } catch (error) { setError(error instanceof PlayerRequestError ? error.message : "Player change could not be confirmed. Refresh its status before trying again."); }
    finally { setBusy(false); }
  }
  const player = status?.player;
  const date = (value: string | null) => value ? formatDate(value, { hour: "numeric", minute: "2-digit", second: "2-digit" }) : t("Not reported");
  if (status && !status.enabled) return null;

  return <section className="panel player-control" aria-label={t("Player connection")}>
    <PanelHeading eyebrow="Device delivery" title="Player connection" action={<span className="status">{t(!status ? "Loading…" : !player ? "Not paired" : player.connection === "online" ? "Connected" : player.connection === "stale" ? "Connection stale" : "Waiting for contact")}</span>} />
    <p className="player-boundary">{t("Content acknowledgment confirms the player received an update. It does not verify playback or physical screen visibility.")}</p>
    {player ? <>
      <dl className="player-status-grid">
        <div><dt>{t("Last contact")}</dt><dd>{date(player.lastSeenAt)}</dd></div>
        <div><dt>{t("Published revision")}</dt><dd>{player.expectedRevision}</dd></div>
        <div><dt>{t("Received / prepared / applied")}</dt><dd>{player.receivedRevision} / {player.validatedRevision} / {player.appliedRevision}</dd></div>
        <div><dt>{t("Last applied")}</dt><dd>{date(player.appliedAt)}</dd></div>
        <div><dt>{t("Last playback")}</dt><dd>{player.lastPlaybackAt ? date(player.lastPlaybackAt) : t("None reported")}</dd></div>
        <div><dt>{t("Last player error")}</dt><dd>{player.lastError ? t(player.lastError) : t("None reported")}{player.lastErrorAt ? ` · ${date(player.lastErrorAt)}` : ""}</dd></div>
      </dl>
      <button className="ghost-button" type="button" disabled={busy} onClick={() => { setError(""); setDisconnect(true); }}>{t("Disconnect player")}</button>
    </> : status ? <div className="player-pairing">
      <p>{t("Open /player?kiosk=1 on the Android or Windows display and enter a one-time pairing code.")}</p>
      <button className="primary-button" disabled={busy} type="button" onClick={() => void mutate("POST")}>{t(busy ? "Creating code…" : "Create pairing code")}</button>
      {pairing ? <div className="player-code"><SecretInput label="Pairing code" secretName="pairing code" readOnly value={pairing.code} /><p>{t("Code expires at {time}. Creating another code invalidates this one.", { time: date(pairing.expiresAt) })}</p></div> : null}
      <a className="ghost-button" href="/player" target="_blank" rel="noreferrer">{t("Open screen player")}</a>
    </div> : null}
    {status?.enabled ? <a className="ghost-button" href="/player?kiosk=1" target="_blank" rel="noreferrer">{t("Open kiosk player")}</a> : null}
    {(error || loadError) && !disconnect ? <p role="alert" className="form-error">{t(error || loadError)}</p> : null}
    <button className="ghost-button" type="button" disabled={busy} onClick={() => { setError(""); setRefresh((value) => value + 1); }}>{t("Refresh player status")}</button>
    <AppDialog open={disconnect} title="Disconnect player" description={t("Disconnect the player for {name}. Online content stops on its next check; disconnected content stops when its configured offline lease expires.", { name: screenName })} onClose={() => { if (!busy) setDisconnect(false); }} initialFocusRef={cancelRef} dismissible={!busy}>
      {error ? <p className="form-error" role="alert">{t(error)}</p> : null}
      <div className="dialog-actions"><button ref={cancelRef} type="button" className="ghost-button" disabled={busy} onClick={() => setDisconnect(false)}>{t("Cancel")}</button><button type="button" className="danger-button" disabled={busy} onClick={() => void mutate("DELETE")}>{t(busy ? "Disconnecting…" : "Disconnect player")}</button></div>
    </AppDialog>
  </section>;
}
