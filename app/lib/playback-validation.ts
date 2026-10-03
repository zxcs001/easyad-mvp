import type { PlaybackEvent, PlayerManifest, PlayerSlide } from "../player-types";
export function slideEligible(slide: PlayerSlide, now: number) {
    const date = new Date(now).toISOString().slice(0, 10);
    return (!slide.startsOn || (slide.startsOn.length>10?Date.parse(slide.startsOn)<=now:slide.startsOn<=date)) && (!slide.endsOn || (slide.endsOn.length>10?Date.parse(slide.endsOn)>now:slide.endsOn>=date));
}
export function rotationSlides(manifest: PlayerManifest, now: number) {
    return rotationPlan(manifest, now).slides;
}
export function rotationPlan(manifest: PlayerManifest, now: number) {
    const eligible = manifest.slides.filter(slide => slideEligible(slide, now));
    const commercial = eligible.filter(slide => slide.placementId || slide.legacyBookingId).sort((a, b) => a.id.localeCompare(b.id));
    if (!commercial.length)
        return { slides: eligible, issue: null };
    const loopSeconds = commercial[0]?.allocation?.loopSeconds ?? manifest.loopSeconds ?? 120;
    if (commercial.some(slide => slide.allocation && slide.allocation.loopSeconds !== loopSeconds))
        return { slides: [], issue: "Screen bookings use conflicting loop settings. Ask the screen manager to correct the schedule." };
    let remaining = loopSeconds - commercial.reduce((sum, slide) => sum + (slide.durationSeconds ?? manifest.imageInterval), 0);
    // Overcommitted historical records fail closed; confirmation now prevents new overselling.
    if (remaining < 0)
        return { slides: [], issue: "Screen bookings exceed loop capacity. Ask the screen manager to correct the schedule." };
    return { slides: [...commercial, ...eligible.filter(slide => !slide.placementId && !slide.legacyBookingId).filter(slide => {
            const duration = slide.durationSeconds ?? manifest.imageInterval;
            if (duration > remaining)
                return false;
            remaining -= duration;
            return true;
        })], issue: null };
}
export function validatePlayback(body: Record<string, unknown>, manifest: PlayerManifest, now = Date.now()): {
    event: PlaybackEvent;
    slide: PlayerSlide;
    late: boolean;
} {
    const event = body as unknown as PlaybackEvent;
    if (![event.eventId, event.sessionId].every(value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value)) || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || !Number.isSafeInteger(event.revision) || event.revision !== manifest.revision)
        throw new Error("Invalid playback identity");
    const slide = manifest.slides.find(item => item.id === event.slideId && item.assetVersion === event.assetVersion);
    if (![event.startedAt,event.occurredAt].every(value=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)))throw new Error("Use UTC ISO playback timestamps");
    const start = Date.parse(event.startedAt), end = Date.parse(event.occurredAt);
    if (!slide || !manifest.published || !Number.isFinite(start) || !Number.isFinite(end) || end < start || start < Date.parse(manifest.generatedAt) - 2000 || end > Date.parse(manifest.validUntil) || end > now + 120000 || start < now - 7 * 86400000 || !slideEligible(slide, start) || !slideEligible(slide, Math.max(start, end - 1)))
        throw new Error("Playback is outside its authorized schedule");
    if (manifest.activeAlert && start < Date.parse(manifest.activeAlert.expiresAt))
        throw new Error("Playback overlaps an emergency override");
    const duration = event.durationMs;
    const expected = (slide.durationSeconds ?? manifest.imageInterval) * 1000;
    if (!["completed", "failed", "interrupted"].includes(event.outcome) || !Number.isFinite(duration) || duration < 0 || duration > expected + 2000 || Math.abs(end - start - duration) > 2000 || (event.outcome === "completed" && (slide.mediaType === "image" || slide.mediaType === "html") && duration < expected - 250) || (event.outcome === "completed" && duration < 100))
        throw new Error("Invalid playback duration or outcome");
    return { event, slide, late: now - end > 120000 };
}
