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
import type { RecoveryCommand } from "../lib/player-diagnostics";
import { browserDiagnostics, playbackWatchdogOverdue, reportPlaybackActivity, reserveAutomaticRecovery } from "../lib/kiosk-diagnostics";
import { mustClearPreviousContent, pausePlayer, playerPost, playerRequest, PlayerRequestError } from "../lib/player-client";
export default function PlayerRuntime({ enabled }: {
    enabled: boolean;
}) {
    const { t } = useI18n();
    const [manifest, setManifest] = useState<PlayerManifest | null>(null);
    const manifestRef = useRef<PlayerManifest | null>(null);
    const [needsPairing, setNeedsPairing] = useState(false);
    const [generation, setGeneration] = useState(0);
    const [rotationGeneration, setRotationGeneration] = useState(0);
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
        let pollWake: AbortController | null = null;
        let heartbeatWake: AbortController | null = null;
        const wakePoll = () => { etag = ""; pollWake?.abort(); };
        function clear() { restorationController.abort(); manifestRef.current = null; setManifest(null); prepared?.release(); prepared = null; }
        function denied(error: unknown) {
            if (error instanceof PlayerRequestError && [401, 404].includes(error.status)) {
                stopped = true;
                preparationController?.abort();
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
        async function prepareUpdate(next: PlayerManifest, nextEtag: string, updateController: AbortController, redownload = false) {
            const updateSignal = AbortSignal.any([signal, updateController.signal]);
            const requestSignal = () => AbortSignal.any([updateSignal, AbortSignal.timeout(12000)]);
            let replacement: PreparedPlayer | null = null;
            let emergencyTextCache: Promise<void> | undefined;
            try {
                const clearing = mustClearPreviousContent(manifestRef.current, next);
                if (next.activeAlert && next.published) {
                    // Render the self-contained emergency text immediately. Receipt,
                    // preparation and render evidence are acknowledged separately.
                    display({ manifest: { ...next, slides: [] }, release: () => {} });
                    // Persist text independently of network acknowledgments or
                    // photo downloads, retaining the ordinary cache for expiry.
                    emergencyTextCache = cachePlayerManifest({ ...next, slides: [], activeAlert: { ...next.activeAlert, image: undefined } }, updateSignal)
                        .then(cached => cached.release()).catch(() => {});
                } else if (clearing) {
                    clear();
                    await clearPlayerCache();
                }
                await playerPost("/api/player/acknowledgments", { revision: next.revision, stage: "received" }, requestSignal());
                // Serialize the text/photo snapshots so a late text write cannot
                // overwrite a completed emergency photo cache.
                await emergencyTextCache;
                replacement = next.activeAlert?.image
                    ? await cachePlayerManifest({ ...next, slides: [] }, updateSignal, redownload)
                    : next.activeAlert
                    ? { manifest: { ...next, slides: [] }, release: () => {} }
                    : await cachePlayerManifest(next, updateSignal, redownload);
                await playerPost("/api/player/acknowledgments", { revision: next.revision, stage: "validated" }, requestSignal());
                if (updateSignal.aborted) return;
                const unchanged = !redownload && manifestRef.current?.revision === next.revision && manifestRef.current.activeAlert?.image?.url === replacement.manifest.activeAlert?.image?.url && manifestRef.current.slides.every((slide, index) => Boolean(slide.publicUrl) === Boolean(replacement!.manifest.slides[index]?.publicUrl));
                if (!unchanged) { display(replacement); replacement = null; }
                const applied = manifestRef.current!;
                etag = applied.slides.some(slide => !slide.publicUrl) ? "" : nextEtag;
                health = applied.slides.some(slide => !slide.publicUrl) ? "media_unavailable" : null;
                setError("");
                return health !== "media_unavailable";
            } catch (error) {
                if (updateSignal.aborted || stopped || denied(error)) return;
                health = next.activeAlert && !next.activeAlert.image ? "connection_lost" : "media_unavailable";
                etag = "";
                setError(next.activeAlert?.image ? "Emergency photo could not be loaded. Instructions remain on screen; retrying automatically." : next.activeAlert ? "Alert acknowledgment pending. Retrying automatically." : "Content could not be loaded. Retrying automatically.");
                return false;
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
                        if (timing.heartbeatMs !== body.timing.heartbeatMs) heartbeatWake?.abort();
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
                    if (health === "connection_lost") { health = null; setError(""); }
                } catch (error) {
                    if (signal.aborted || denied(error)) break;
                    failures += 1;
                    if (health !== "media_unavailable") health = "connection_lost";
                    setError(health === "media_unavailable" ? "Content could not be loaded. Retrying automatically." : "Connection lost. Retrying automatically.");
                    etag = "";
                }
                pollWake = new AbortController();
                await pausePlayer(Math.min(60000, Math.min(10000, timing.pollMs) * 2 ** Math.min(failures, 3)), AbortSignal.any([signal, pollWake.signal])).catch(() => {});
            }
        }
        let executingRecovery = false;
        const resultSignal = () => AbortSignal.any([signal, AbortSignal.timeout(12000)]);
        async function executeRecovery(command: RecoveryCommand) {
            if (executingRecovery || stopped || signal.aborted || Date.parse(command.expiresAt) <= Date.now()) return;
            executingRecovery = true;
            let recoveryDeadline: ReturnType<typeof setTimeout> | undefined;
            try {
                await playerPost("/api/player/recovery", { commandId: command.id, status: "received" }, resultSignal());
                if (command.kind === "reload_player") {
                    // The receipt survives a document reload. Only the next running player completes it.
                    sessionStorage.setItem("easyad-player-reload", JSON.stringify({ id: command.id, at: Date.now() }));
                    window.location.reload();
                    return;
                }
                const response = await playerRequest("/api/player/manifest", { signal: resultSignal() });
                const body = await response.json() as { manifest: PlayerManifest };
                if ((manifestRef.current?.revision ?? 0) > body.manifest.revision || (processingRevision ?? 0) > body.manifest.revision) throw new Error("newer_content_pending");
                preparationController?.abort();
                preparationController = new AbortController();
                const recoveryPreparation = preparationController;
                recoveryDeadline = setTimeout(() => recoveryPreparation.abort(), Math.max(1, Date.parse(command.expiresAt) - Date.now()));
                processingRevision = body.manifest.revision;
                const success = await prepareUpdate(body.manifest, response.headers.get("ETag") ?? "", preparationController, command.kind === "rebuild_cache");
                if (!success) throw new Error("recovery_failed");
                storageFailure.current = false;
                setRotationGeneration(value => value + 1);
                await playerPost("/api/player/recovery", { commandId: command.id, status: "succeeded", result: command.kind === "rebuild_cache" ? "cache_rebuilt" : "content_refreshed" }, resultSignal());
            } catch(error) {
                if (denied(error) || signal.aborted) return;
                await playerPost("/api/player/recovery", { commandId: command.id, status: "failed", result: "recovery_failed" }, resultSignal()).catch(() => {});
            } finally { clearTimeout(recoveryDeadline); executingRecovery = false; }
        }
        async function completeReload() {
            let raw;
            try { raw = sessionStorage.getItem("easyad-player-reload"); } catch { return; }
            if (!raw || !manifestRef.current) return;
            let receipt;
            try { receipt = JSON.parse(raw); } catch { sessionStorage.removeItem("easyad-player-reload"); return; }
            if (typeof receipt.id !== "string" || !/^REC-[0-9a-f-]{36}$/i.test(receipt.id) || !Number.isFinite(receipt.at) || Date.now() - receipt.at > 900000) { sessionStorage.removeItem("easyad-player-reload"); return; }
            try {
                await playerPost("/api/player/recovery", { commandId: receipt.id, status: "succeeded", result: "player_reloaded" }, resultSignal());
                sessionStorage.removeItem("easyad-player-reload");
            } catch(error) { if (error instanceof PlayerRequestError && [404, 409].includes(error.status)) sessionStorage.removeItem("easyad-player-reload"); }
        }
        let flushingReports = false;
        async function drainReports() {
            if (flushingReports || !manifestRef.current || stopped || signal.aborted) return;
            flushingReports = true;
            try { await flushPlayback(manifestRef.current.playerId, signal); }
            catch (error) { denied(error); }
            finally { flushingReports = false; }
        }
        async function heartbeat() {
            while (!signal.aborted && !stopped) {
                try {
                    const current = manifestRef.current;
                    const diagnostics = await browserDiagnostics(current?.revision ?? 0, storageFailure.current ? "storage_paused" : current?.activeAlert ? "emergency" : current && !current.published ? "unpublished" : undefined);
                    const response = await playerPost("/api/player/heartbeat", { error: storageFailure.current ? "storage_unavailable" : health, diagnostics }, resultSignal());
                    const reply = await response.json() as { recoveryCommand?: RecoveryCommand | null };
                    await completeReload();
                    // Media downloads must not stop fleet contact and diagnostics.
                    if (reply.recoveryCommand) void executeRecovery(reply.recoveryCommand);
                }
                catch (error) {
                    if (signal.aborted || denied(error))
                        break;
                }
                // One outbox drain at a time; slow evidence uploads cannot starve health reports.
                void drainReports();
                heartbeatWake = new AbortController();
                await pausePlayer(timing.heartbeatMs, AbortSignal.any([signal, heartbeatWake.signal])).catch(() => {});
            }
        }
        const watchdog = setInterval(() => {
            if (!manifestRef.current?.published || manifestRef.current.activeAlert || executingRecovery || !playbackWatchdogOverdue()) return;
            let permitted = false;
            try { permitted = reserveAutomaticRecovery(sessionStorage); } catch { /* Local budget unavailable: wait for owner recovery. */ }
            if (permitted) {
                reportPlaybackActivity("starting");
                setRotationGeneration(value => value + 1);
                wakePoll();
            }
        }, 1000);
        let resumingRevision: number | null = null;
        const expiry = setInterval(() => {
            const current = manifestRef.current;
            if (current?.activeAlert && Date.parse(current.activeAlert.expiresAt) <= Date.now() && resumingRevision !== current.revision) {
                resumingRevision = current.revision;
                preparationController?.abort();
                // Restore the ordinary snapshot using its original lease and
                // revision, so queued evidence still refers to its authorization.
                void restorePlayerCache(signal).then(cached => {
                    if (!cached) return;
                    if (signal.aborted || stopped || manifestRef.current !== current || cached.manifest.activeAlert) { cached.release(); return; }
                    display(cached);
                    etag = "";
                    health = null;
                    setError("");
                }).catch(() => {});
            }
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
        return () => { controller.abort(); preparationController?.abort(); clearInterval(expiry); clearInterval(watchdog); prepared?.release(); };
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
        return <><PlayerAlertReporter manifest={manifest}/><DeviceScreen key={`${manifest.playerId}:${manifest.revision}`} inventoryName={manifest.inventoryName} city={manifest.city} imageInterval={manifest.imageInterval} template={manifest.template} displayLanguage={manifest.displayLanguage} slides={manifest.slides} activeAlert={manifest.activeAlert} mediaContent={<PlayerRotation key={rotationGeneration} manifest={manifest} onError={storageError}/>}/></>;
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
