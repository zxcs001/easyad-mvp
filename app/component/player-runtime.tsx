"use client";
import "./player-control.css";
import "./shared-ui.css";
import PlayerAlertReporter from "./player-alert-reporter";
import { useCallback, useEffect, useRef, useState } from "react";
import PlayerRotation from "./player-rotation";
import { cachePlayerManifest, clearPlayerCache, flushPlayback, restorePlayerCache, type PreparedPlayer } from "../lib/player-storage";
import DeviceScreen from "./device-screen";
import SecretInput from "./secret-input";
import { useI18n } from "../i18n/client";
import type { PlayerManifest, PlayerTiming } from "../player-types";
import { mustClearPreviousContent, pausePlayer, playerPost, playerRequest, PlayerRequestError } from "../lib/player-client";
export default function PlayerRuntime({ enabled }: {
    enabled: boolean;
}) {
    const { t } = useI18n();
    const [manifest, setManifest] = useState<PlayerManifest | null>(null);
    const manifestRef = useRef<PlayerManifest | null>(null);
    const [needsPairing, setNeedsPairing] = useState(false);
    const [generation, setGeneration] = useState(0);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const storageFailure = useRef(false);
    const codeRef = useRef<HTMLInputElement>(null);
    const storageError = useCallback(() => { storageFailure.current = true; setError("Player storage is unavailable. Playback is paused."); }, []);
    useEffect(() => {
        if (!enabled)
            return;
        const controller = new AbortController();
        const signal = controller.signal;
        const restorationController = new AbortController();
        let prepared: PreparedPlayer | null = null;
        let deadline = Infinity;
        let etag = "";
        let failures = 0;
        let stopped = false;
        let health: string | null = null;
        let timing: PlayerTiming = { pollMs: 10000, heartbeatMs: 30000, staleMs: 90000 };
        function clear() { restorationController.abort(); manifestRef.current = null; setManifest(null); prepared?.release(); prepared = null; }
        function denied(error: unknown) {
            if (error instanceof PlayerRequestError && [401, 404].includes(error.status)) {
                stopped = true;
                clear();
                void clearPlayerCache().catch(() => { });
                setNeedsPairing(error.status === 401);
                setError(error.status === 401 ? "" : error.message);
                return true;
            }
            return false;
        }
        let preparationController: AbortController | null = null;
        let processingRevision: number | null = null;
        function display(replacement: PreparedPlayer) {
            restorationController.abort();
            prepared?.release();
            prepared = replacement;
            manifestRef.current = replacement.manifest;
            deadline = performance.now() + Date.parse(replacement.manifest.validUntil) - Date.now();
            setManifest(replacement.manifest);
        }
        async function prepareUpdate(next: PlayerManifest, nextEtag: string, updateController: AbortController) {
            const updateSignal = AbortSignal.any([signal, updateController.signal]);
            const requestSignal = () => AbortSignal.any([updateSignal, AbortSignal.timeout(12000)]);
            let replacement: PreparedPlayer | null = null;
            try {
                const clearing = mustClearPreviousContent(manifestRef.current, next);
                if (next.activeAlert && next.published) {
                    // Render the self-contained emergency text immediately. Receipt,
                    // preparation and render evidence are acknowledged separately.
                    display({ manifest: { ...next, slides: [] }, release: () => {} });
                    await clearPlayerCache().catch(() => {});
                } else if (clearing) {
                    clear();
                    await clearPlayerCache();
                }
                await playerPost("/api/player/acknowledgments", { revision: next.revision, stage: "received" }, requestSignal());
                replacement = next.activeAlert?.image
                    ? await cachePlayerManifest({ ...next, slides: [] }, updateSignal)
                    : next.activeAlert
                    ? { manifest: { ...next, slides: [] }, release: () => {} }
                    : await cachePlayerManifest(next, updateSignal);
                await playerPost("/api/player/acknowledgments", { revision: next.revision, stage: "validated" }, requestSignal());
                if (updateSignal.aborted) return;
                const unchanged = manifestRef.current?.revision === next.revision && manifestRef.current.activeAlert?.image?.url === replacement.manifest.activeAlert?.image?.url && manifestRef.current.slides.every((slide, index) => Boolean(slide.publicUrl) === Boolean(replacement!.manifest.slides[index]?.publicUrl));
                if (!unchanged) { display(replacement); replacement = null; }
                const applied = manifestRef.current!;
                etag = applied.slides.some(slide => !slide.publicUrl) ? "" : nextEtag;
                health = applied.slides.some(slide => !slide.publicUrl) ? "media_unavailable" : null;
                setError("");
                // Persist emergency text only after rendering, and tolerate storage
                // failure: it must never prevent a connected screen showing an alert.
                if (next.activeAlert && !next.activeAlert.image) void cachePlayerManifest({ ...next, slides: [] }, updateSignal).then(cached => cached.release()).catch(() => {});
            } catch (error) {
                if (updateSignal.aborted || stopped || denied(error)) return;
                health = next.activeAlert && !next.activeAlert.image ? "connection_lost" : "media_unavailable";
                etag = "";
                setError(next.activeAlert?.image ? "Emergency photo could not be loaded. Instructions remain on screen; retrying automatically." : next.activeAlert ? "Alert acknowledgment pending. Retrying automatically." : "Content could not be loaded. Retrying automatically.");
            } finally {
                replacement?.release();
                if (preparationController === updateController) processingRevision = null;
            }
        }
        async function poll() {
            while (!signal.aborted && !stopped) {
                try {
                    const response = await playerRequest("/api/player/manifest", { headers: etag ? { "If-None-Match": etag } : {}, signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]) });
                    if (response.status !== 304) {
                        const body = await response.json() as { manifest: PlayerManifest; timing: PlayerTiming };
                        timing = body.timing;
                        setNeedsPairing(false);
                        if (processingRevision !== body.manifest.revision) {
                            preparationController?.abort();
                            preparationController = new AbortController();
                            processingRevision = body.manifest.revision;
                            etag = response.headers.get("ETag") ?? "";
                            // Keep checking for new revisions during media downloads.
                            void prepareUpdate(body.manifest, etag, preparationController);
                        }
                    }
                    failures = 0;
                } catch (error) {
                    if (signal.aborted || denied(error)) break;
                    failures += 1;
                    if (health !== "media_unavailable") health = "connection_lost";
                    setError(health === "media_unavailable" ? "Content could not be loaded. Retrying automatically." : "Connection lost. Retrying automatically.");
                    etag = "";
                }
                await pausePlayer(Math.min(60000, Math.min(10000, timing.pollMs) * 2 ** Math.min(failures, 3)), signal);
            }
        }
        async function heartbeat() {
            while (!signal.aborted && !stopped) {
                try {
                    await playerPost("/api/player/heartbeat", { error: storageFailure.current ? "storage_unavailable" : health }, AbortSignal.any([signal, AbortSignal.timeout(12000)]));
                }
                catch (error) {
                    if (signal.aborted || denied(error))
                        break;
                }
                try {
                    if (manifestRef.current)
                        await flushPlayback(manifestRef.current.playerId, signal);
                }
                catch (error) {
                    if (denied(error))
                        break;
                }
                await pausePlayer(timing.heartbeatMs, signal);
            }
        }
        const expiry = setInterval(() => {
            if (manifestRef.current && (Date.parse(manifestRef.current.validUntil) <= Date.now() || performance.now() >= deadline)) {
                health = "manifest_expired";
                clear();
                etag = "";
                setError("Content expired. Waiting for a fresh update.");
            }
        }, 500);
        async function run() {
            async function restore() {
                const restoreSignal = AbortSignal.any([signal, restorationController.signal]);
                try {
                    const cached = await restorePlayerCache(restoreSignal);
                    if (restoreSignal.aborted || manifestRef.current || stopped) {
                        cached?.release();
                        return;
                    }
                    if (cached) display(cached);
                } catch {
                    if (!restoreSignal.aborted) await clearPlayerCache().catch(() => {});
                }
            }
            // A large cached video must not delay fetching a new emergency on startup.
            await Promise.all([restore(), poll().catch(() => {}), heartbeat().catch(() => {})]);
        }
        if (navigator.locks)
            void navigator.locks.request("easyad-player-runtime", { signal }, run).catch(() => { });
        else
            setError("This browser does not support the player runtime.");
        if ("serviceWorker" in navigator)
            void navigator.serviceWorker.register("/player-worker.js", { scope: "/player" }).then(async () => {
                const registration = await navigator.serviceWorker.ready;
                registration.active?.postMessage({ type: "warm-player", urls: [...performance.getEntriesByType("resource").map(entry => entry.name), ...Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>("script[src], link[rel=stylesheet], link[as=style]")).map(element=>element instanceof HTMLScriptElement ? element.src : element.href)] });
            }).catch(() => { });
        return () => { controller.abort(); preparationController?.abort(); clearInterval(expiry); prepared?.release(); };
    }, [enabled, generation]);
    useEffect(() => {
        if (!manifest)
            return;
        const controller = new AbortController();
        const signal = controller.signal;
        // React has committed this revision to the display surface. This acknowledgment
        // intentionally does not claim a completed play or a physically illuminated panel.
        async function acknowledgeApplied() {
            while (!signal.aborted && Date.parse(manifest!.validUntil) > Date.now()) {
                try {
                    await playerPost("/api/player/acknowledgments", { revision: manifest!.revision, stage: "applied" }, AbortSignal.any([signal, AbortSignal.timeout(12000)]));
                    return;
                }
                catch (error) {
                    if (signal.aborted || error instanceof PlayerRequestError && [401, 404].includes(error.status))
                        return;
                    await pausePlayer(3000, signal);
                }
            }
        }
        void acknowledgeApplied().catch(() => { });
        return () => controller.abort();
    }, [manifest]);
    async function pair(event: React.FormEvent) {
        event.preventDefault();
        if (busy)
            return;
        setError("");
        if (!/^[A-Fa-f0-9\s-]{12,20}$/.test(code)) {
            setError("Enter a valid, unexpired pairing code.");
            codeRef.current?.focus();
            return;
        }
        setBusy(true);
        try {
            await playerPost("/api/players/pair", { code }, AbortSignal.timeout(12000));
            setCode("");
            setNeedsPairing(false);
            setGeneration((value) => value + 1);
        }
        catch (error) {
            setError(error instanceof PlayerRequestError ? error.message : "Pairing could not be confirmed. Retry the connection before requesting a new code.");
            codeRef.current?.focus();
        }
        finally {
            setBusy(false);
        }
    }
    if (manifest?.published)
        return <><PlayerAlertReporter manifest={manifest}/><DeviceScreen key={`${manifest.playerId}:${manifest.revision}`} inventoryName={manifest.inventoryName} city={manifest.city} imageInterval={manifest.imageInterval} template={manifest.template} displayLanguage={manifest.displayLanguage} slides={manifest.slides} activeAlert={manifest.activeAlert} mediaContent={<PlayerRotation manifest={manifest} onError={storageError}/>}/></>;
    return <main className="player-setup"><section className="panel player-setup-panel">
    <span className="eyebrow">{t("EasyAD Platform")}</span>
    <h1>{t("Screen player")}</h1>
    {!enabled ? <p>{t("Player control is not enabled.")}</p> : needsPairing ? <form noValidate onSubmit={pair}>
      <p>{t("Get a pairing code from Screen control, then enter it on this screen.")}</p>
      <SecretInput ref={codeRef} label="Pairing code" secretName="pairing code" autoComplete="off" value={code} maxLength={20} onChange={(event) => setCode(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "player-error" : undefined}/>
      <button type="submit" className="primary-button" disabled={busy}>{t(busy ? "Pairing…" : "Pair this screen")}</button>
    </form> : <p role="status">{t(manifest && !manifest.published ? "This screen is unpublished. Waiting for approved content." : "Connecting to screen control…")}</p>}
    {error ? <p id="player-error" className="form-error" role="alert">{t(error)}</p> : null}
    {enabled && error ? <button className="ghost-button" type="button" disabled={busy} onClick={() => { setError(""); setGeneration((value) => value + 1); }}>{t("Retry connection")}</button> : null}
  </section></main>;
}
