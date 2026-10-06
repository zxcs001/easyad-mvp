"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Maximize, Settings } from "lucide-react";
import { useI18n } from "../i18n/client";
import "./player-kiosk.css";

type AwakeStatus = "requesting" | "active" | "released" | "unavailable" | "insecure";
const awakeMessages: Record<AwakeStatus, string> = {
  requesting: "Requesting screen wake lock…",
  active: "Screen wake lock active.",
  released: "Screen wake lock released. Check device power settings.",
  unavailable: "Screen wake lock unavailable. Keep the screen awake in device settings.",
  insecure: "Use HTTPS to enable screen wake lock and offline recovery.",
};

export default function PlayerKiosk({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const { t } = useI18n();
  const [active, setActive] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [awake, setAwake] = useState<AwakeStatus>("requesting");
  const [wakeAttempt, setWakeAttempt] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Read the actual address on the client: offline navigation restores the
    // cached /player shell, which intentionally contains no query-specific state.
    const sync = () => setActive(enabled && new URL(window.location.href).searchParams.get("kiosk") === "1");
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [enabled]);

  useEffect(() => {
    const sync = () => {
      setFullscreen(Boolean(document.fullscreenElement));
      if (!document.fullscreenElement) setControlsOpen(true);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    if (!active) return;
    if (!window.isSecureContext) { setAwake("insecure"); return; }
    if (!navigator.wakeLock) { setAwake("unavailable"); return; }
    let cancelled = false;
    let pending = false;
    let lock: WakeLockSentinel | null = null;
    async function acquire() {
      if (cancelled || pending || document.hidden || lock && !lock.released) return;
      pending = true;
      setAwake("requesting");
      try {
        const next = await navigator.wakeLock.request("screen");
        if (cancelled || document.hidden) { await next.release(); return; }
        lock = next;
        setAwake("active");
        next.addEventListener("release", () => {
          if (lock === next) {
            lock = null;
            if (!cancelled) setAwake("released");
          }
        });
      } catch { if (!cancelled) setAwake("unavailable"); }
      finally { pending = false; }
    }
    const visibility = () => {
      if (!document.hidden) void acquire();
      else if (lock) void lock.release().catch(() => {});
    };
    void acquire();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibility);
      if (lock) void lock.release().catch(() => {});
    };
  }, [active, wakeAttempt]);

  useEffect(() => {
    if (!active || !controlsOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        // Keyboard users keep their controls until they move focus away.
        if (controlsRef.current?.contains(document.activeElement)) schedule();
        else setControlsOpen(false);
      }, 6000);
    }
    schedule();
    const controls = controlsRef.current;
    controls?.addEventListener("pointerdown", schedule);
    controls?.addEventListener("keydown", schedule);
    return () => {
      clearTimeout(timer);
      controls?.removeEventListener("pointerdown", schedule);
      controls?.removeEventListener("keydown", schedule);
    };
  }, [active, controlsOpen]);

  function setMode(next: boolean) {
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("kiosk", "1");
    else url.searchParams.delete("kiosk");
    window.history.replaceState(window.history.state, "", url);
    setActive(next);
    setControlsOpen(true);
    setFullscreenError("");
  }

  function hideControls() {
    surfaceRef.current?.focus({ preventScroll: true });
    setControlsOpen(false);
  }

  async function enterFullscreen() {
    setFullscreenError("");
    setWakeAttempt(value => value + 1);
    try {
      // Call directly from the click gesture; fullscreen cannot be requested on
      // page load, after pairing, or after a browser restart without activation.
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      hideControls();
    } catch {
      setControlsOpen(true);
      setFullscreenError("Fullscreen unavailable. Use the browser kiosk launcher or try again.");
    }
  }

  async function exitMode() {
    setMode(false);
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  }

  return <div ref={surfaceRef} tabIndex={-1} className="player-kiosk" data-kiosk={active ? "on" : "off"} data-controls={controlsOpen ? "visible" : "hidden"}>
    {children}
    {enabled && !active ? <button type="button" className="ghost-button player-kiosk-start" onClick={() => { setMode(true); void enterFullscreen(); }}><Maximize size={16} aria-hidden="true" />{t("Start kiosk mode")}</button> : null}
    {active ? <>
      <button ref={triggerRef} type="button" className="player-kiosk-trigger" aria-label={t("Show kiosk controls")} aria-controls="player-kiosk-controls" aria-expanded={controlsOpen} onClick={() => setControlsOpen(value => !value)}><Settings size={20} aria-hidden="true" /></button>
      {controlsOpen ? <section ref={controlsRef} id="player-kiosk-controls" className="player-kiosk-controls" aria-label={t("Kiosk controls")} onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); setControlsOpen(false); triggerRef.current?.focus(); }
      }}>
        <strong>{t("Chromium kiosk mode")}</strong>
        <p role="status">{t(awakeMessages[awake])}</p>
        <p>{t("Tap the top-right corner or press Tab to show controls. Use device settings to lock this app and start it after reboot.")}</p>
        {fullscreenError ? <p role="alert">{t(fullscreenError)}</p> : null}
        <div className="player-kiosk-actions">
          {!fullscreen ? <button type="button" className="primary-button" onClick={() => void enterFullscreen()}>{t("Enter fullscreen")}</button> : null}
          {awake !== "active" ? <button type="button" className="ghost-button" onClick={() => setWakeAttempt(value => value + 1)}>{t("Retry wake lock")}</button> : null}
          <button type="button" className="ghost-button" onClick={hideControls}>{t("Hide controls")}</button>
          <button type="button" className="ghost-button" onClick={() => void exitMode()}>{t("Exit kiosk mode")}</button>
        </div>
      </section> : null}
    </> : null}
  </div>;
}
