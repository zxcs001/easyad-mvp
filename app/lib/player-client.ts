import type { PlayerManifest } from "../player-types";

export class PlayerRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function playerRequest(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin" });
  if (!response.ok && response.status !== 304) {
    const body = await response.json().catch(() => ({}));
    throw new PlayerRequestError(response.status, body.error ?? "Player service is unavailable. Try again.");
  }
  return response;
}

export function playerPost(path: string, body: unknown, signal?: AbortSignal) {
  return playerRequest(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
}

export function pausePlayer(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, ms);
    if (signal.aborted) cancel(); else signal.addEventListener("abort", cancel, { once: true });
  });
}

// P1 preparation validates that each media element can load. This is not an offline cache
// and is not evidence of playback. P2 owns persistent caching and per-play events.
export async function preparePlayerManifest(manifest: PlayerManifest, signal: AbortSignal) {
  if (!manifest.published) return;
  const slides = manifest.activeAlert ? manifest.activeAlert.image ? [{ mediaType: "image", publicUrl: manifest.activeAlert.image.url }] : [] : manifest.slides;
  await Promise.all(slides.map((slide) => slide.mediaType === "html" ? fetch(slide.publicUrl, { signal, credentials: "same-origin" }).then((response) => {
    if (!response.ok || !response.headers.get("content-type")?.startsWith("text/html")) throw new Error("media_unavailable");
  }) : new Promise<void>((resolve, reject) => {
    const media = slide.mediaType === "image" ? new Image() : document.createElement("video");
    const event = slide.mediaType === "image" ? "load" : "loadeddata";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return; done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      media.removeEventListener(event, loaded);
      media.removeEventListener("error", failed);
      if (media instanceof HTMLVideoElement) { media.pause(); media.removeAttribute("src"); media.load(); }
      if (error) reject(error); else resolve();
    };
    const loaded = () => finish();
    const failed = () => finish(new Error("media_unavailable"));
    const abort = () => finish(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(failed, 8_000);
    media.addEventListener(event, loaded, { once: true });
    media.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); return; }
    if (media instanceof HTMLVideoElement) { media.muted = true; media.preload = "auto"; }
    media.src = slide.publicUrl;
  })));
}

export function mustClearPreviousContent(previous: PlayerManifest | null, next: PlayerManifest) {
  if (!next.published || next.activeAlert || previous?.activeAlert) return true;
  const permitted = new Set(next.slides.map((slide) => slide.assetVersion));
  return Boolean(previous?.slides.some((slide) => !permitted.has(slide.assetVersion)));
}
