"use client";
import { useEffect, useRef, useState } from "react";
import type { PlaybackEvent, PlayerManifest } from "../player-types";
import { rotationPlan } from "../lib/playback-validation";
import { queuePlayback } from "../lib/player-storage";
import { useI18n } from "../i18n/client";
import "./device-media-carousel.css";
// One mounted media element owns playback. Preloads and public previews cannot emit events.
export default function PlayerRotation({ manifest, onError }: {
    manifest: PlayerManifest;
    onError: () => void;
}) {
    const { t } = useI18n();
    const [turn, setTurn] = useState(0);
    const [hidden, setHidden] = useState(document.hidden);
    const [halted, setHalted] = useState(false);
    const [blank, setBlank] = useState(false);
    const [clock, setClock] = useState(Date.now());
    const session = useRef(crypto.randomUUID());
    const sequence = useRef(0);
    const image = useRef<HTMLImageElement>(null);
    const video = useRef<HTMLVideoElement>(null);
    const { slides: eligible, issue: scheduleIssue } = rotationPlan(manifest, clock);
    const slide = eligible[turn % Math.max(1, eligible.length)];
    const current = useRef<{
        start: () => void;
        finish: (outcome: PlaybackEvent["outcome"]) => void;
    } | null>(null);
    const cycleStart = useRef(performance.now());
    useEffect(() => { const change = () => setHidden(document.hidden); document.addEventListener("visibilitychange", change); const tick = setInterval(() => setClock(Date.now()), 500); return () => { document.removeEventListener("visibilitychange", change); clearInterval(tick); }; }, []);
    useEffect(() => {
        if (!slide || hidden || halted || Date.parse(manifest.validUntil) <= Date.now())
            return;
        setBlank(false);
        let started: number | null = null;
        let wall = 0, finished = false, disposed = false;
        let timer: ReturnType<typeof setTimeout>;
        let nextTimer: ReturnType<typeof setTimeout>;
        const duration = (slide.durationSeconds ?? manifest.imageInterval) * 1000;
        const advance = () => {
            if (disposed)
                return;
            const last = (turn + 1) % eligible.length === 0;
            const remainder = last && eligible.some(s => s.placementId || s.legacyBookingId) ? Math.max(0, (eligible.find(s => s.allocation)?.allocation?.loopSeconds ?? manifest.loopSeconds ?? 0) * 1000 - (performance.now() - cycleStart.current)) : 0;
            nextTimer = setTimeout(() => { if (last)
                cycleStart.current = performance.now(); setTurn(value => value + 1); }, Math.max(50, remainder, duration - (started === null ? duration : performance.now() - started)));
        };
        const finish = async (outcome: PlaybackEvent["outcome"]) => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            const elapsed = started !== null ? Math.max(0, performance.now() - started) : 0;
            if (document.hidden && outcome === "completed")
                outcome = "interrupted";
            if (elapsed > duration + 2000 && outcome === "completed")
                outcome = "interrupted";
            video.current?.pause();
            if (!disposed)
                setBlank(true);
            const event: PlaybackEvent = { eventId: crypto.randomUUID(), sessionId: session.current, sequence: ++sequence.current, revision: manifest.revision, slideId: slide.id, assetVersion: slide.assetVersion, startedAt: new Date(wall || Date.now()).toISOString(), occurredAt: new Date().toISOString(), durationMs: Math.round(Math.min(elapsed, duration + 2000)), outcome };
            try {
                await queuePlayback(manifest.playerId, event);
                if (!disposed)
                    advance();
            }
            catch {
                if (!disposed)
                    setHalted(true);
                onError();
            }
        };
        const start = () => {
            if (started !== null || finished || disposed || document.hidden)
                return;
            started = performance.now();
            wall = Date.now();
            clearTimeout(timer);
            timer = setTimeout(() => void finish(slide.mediaType === "video" ? "interrupted" : "completed"), duration);
        };
        current.current = { start, finish: outcome => void finish(outcome) };
        timer = setTimeout(() => void finish("failed"), Math.min(8000, duration));
        if (slide.mediaType === "image" && image.current?.complete && image.current.naturalWidth)
            start();
        if (slide.mediaType === "video")
            void video.current?.play().catch(() => void finish("failed"));
        return () => { disposed = true; current.current = null; clearTimeout(timer); clearTimeout(nextTimer); if (started !== null && !finished)
            void finish("interrupted"); };
        // clock only filters schedule boundaries; ticking must never restart an active play.
    }, [slide?.id, turn, hidden, halted, manifest, onError, eligible.length]);
    if (!slide || hidden || halted || blank)
        return <div className="media-stage empty"><p>{t(halted ? "Player storage is unavailable. Playback is paused." : hidden ? "Playback paused while this tab is hidden." : scheduleIssue ?? (blank && slide ? "Waiting for the next playback loop." : "Waiting for eligible content."))}</p></div>;
    return <div className="media-stage device-carousel-slide" data-player-slide={slide.id}>
    {slide.mediaType === "image" ? <img key={`${slide.id}:${turn}`} ref={image} src={slide.publicUrl || undefined} alt="" onLoad={() => current.current?.start()} onError={() => current.current?.finish("failed")}/> : slide.mediaType === "html" ?
            <iframe key={`${slide.id}:${turn}`} src={slide.publicUrl || undefined} title={slide.title} sandbox="" referrerPolicy="no-referrer" onLoad={() => current.current?.start()} onError={() => current.current?.finish("failed")}/> :
            <video key={`${slide.id}:${turn}`} ref={video} src={slide.publicUrl || undefined} muted playsInline autoPlay onPlaying={() => current.current?.start()} onEnded={() => current.current?.finish("completed")} onError={() => current.current?.finish("failed")}/>}
  </div>;
}
