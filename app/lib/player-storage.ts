import type { PlaybackEvent, PlayerManifest } from "../player-types";
import { preparePlayerManifest, playerPost, PlayerRequestError } from "./player-client";
export const PLAYER_STORAGE_BUDGET = 256 * 1024 * 1024;
export const PLAYER_OUTBOX_LIMIT = 50000;
type Asset = {
    key: string;
    blob: Blob;
    checksum: string;
    invalid?: boolean;
};
type Pending = {
    eventId: string;
    playerId: string;
    event: PlaybackEvent;
    rejected?: number;
};
function request<T>(value: IDBRequest<T>): Promise<T> { return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); }); }
function complete(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error ?? new Error("storage_unavailable")); }); }
async function database() {
    const open = indexedDB.open("easyad-player-v2", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("state"); open.result.createObjectStore("assets", { keyPath: "key" }); open.result.createObjectStore("outbox", { keyPath: "eventId" }); };
    return request(open);
}
async function hash(blob: Blob) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join(""); }
export async function clearPlayerCache() {
    const db = await database();
    try {
        const tx = db.transaction(["state", "assets"], "readwrite");
        const done = complete(tx);
        tx.objectStore("state").clear();
        tx.objectStore("assets").clear();
        await done;
    }
    finally {
        db.close();
    }
}
async function stored() {
    const db = await database();
    try {
        const tx = db.transaction(["state", "assets"]);
        const done = complete(tx);
        const [manifest, assets, observedAt] = await Promise.all([request(tx.objectStore("state").get("active")) as Promise<PlayerManifest | undefined>, request(tx.objectStore("assets").getAll()) as Promise<Asset[]>, request(tx.objectStore("state").get("observedAt")) as Promise<number | undefined>]);
        await done;
        return { manifest, assets, observedAt };
    }
    finally {
        db.close();
    }
}
export type PreparedPlayer = {
    manifest: PlayerManifest;
    release: () => void;
};
async function hydrate(manifest: PlayerManifest, assets: Asset[], signal: AbortSignal): Promise<PreparedPlayer> {
    const urls: string[] = [];
    try {
        const slides = [];
        for (const slide of manifest.slides) {
            const asset = assets.find(item => item.key === slide.assetVersion);
            if (!asset || await hash(asset.blob) !== asset.checksum)
                throw new Error("cache_corrupt");
            if (asset.invalid) {
                slides.push({ ...slide, publicUrl: "" });
                continue;
            }
            const url = URL.createObjectURL(asset.blob);
            urls.push(url);
            try {
                await preparePlayerManifest({ ...manifest, activeAlert: null, slides: [{ ...slide, publicUrl: url }] }, signal);
                slides.push({ ...slide, publicUrl: url });
            }
            catch (error) {
                if (signal.aborted)
                    throw error;
                asset.invalid = true;
                slides.push({ ...slide, publicUrl: "" });
            }
        }
        let activeAlert = manifest.activeAlert;
        if (activeAlert?.image) {
            const asset = assets.find(item => item.key === `emergency:${activeAlert!.id}`);
            if (!asset || asset.invalid || await hash(asset.blob) !== asset.checksum) throw new Error("cache_corrupt");
            const url = URL.createObjectURL(asset.blob);
            urls.push(url);
            activeAlert = { ...activeAlert, image: { ...activeAlert.image, url } };
            await preparePlayerManifest({ ...manifest, slides: [], activeAlert }, signal);
        }
        const hydrated = { ...manifest, slides, activeAlert };
        return { manifest: hydrated, release: () => urls.forEach(url => URL.revokeObjectURL(url)) };
    }
    catch (error) {
        urls.forEach(url => URL.revokeObjectURL(url));
        throw error;
    }
}
export async function restorePlayerCache(signal: AbortSignal) {
    const { manifest, assets, observedAt } = await stored();
    if ((observedAt && Date.now() < observedAt - 120000) || !manifest || Date.parse(manifest.validUntil) <= Date.now() || Date.parse(manifest.generatedAt) > Date.now() + 120000)
        return null;
    return hydrate(manifest.activeAlert ? { ...manifest, slides: [] } : manifest, assets, signal);
}
async function download(url: string, signal: AbortSignal, budget: number) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal });
    if ([404, 410].includes(response.status))
        return new Blob();
    if (!response.ok || !response.body)
        throw new Error("media_unavailable");
    if (Number(response.headers.get("content-length")) > budget) {
        await response.body.cancel();
        throw new Error("storage_full");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done)
                break;
            size += next.value.byteLength;
            if (size > budget)
                throw new Error("storage_full");
            chunks.push(new Uint8Array(next.value));
        }
    }
    finally {
        await reader.cancel();
    }
    return new Blob(chunks, { type: response.headers.get("content-type") ?? "application/octet-stream" });
}
export async function cachePlayerManifest(manifest: PlayerManifest, signal: AbortSignal): Promise<PreparedPlayer> {
    // An emergency only caches its own photo. Ordinary media must never delay it.
    if (manifest.activeAlert) manifest = { ...manifest, slides: [] };
    const old = await stored();
    const assets: Asset[] = [];
    let bytes = 0;
    if (manifest.activeAlert?.image) {
        const key = `emergency:${manifest.activeAlert.id}`;
        const cached = old.assets.find(asset => asset.key === key);
        const blob = cached && !cached.invalid && await hash(cached.blob) === cached.checksum ? cached.blob : await download(manifest.activeAlert.image.url, AbortSignal.any([signal, AbortSignal.timeout(12000)]), 5 * 1024 * 1024);
        if (!blob.size) throw new Error("media_unavailable");
        bytes = blob.size;
        assets.push({ key, blob, checksum: await hash(blob) });
    }
    for (const slide of manifest.slides) {
        if (assets.some(asset => asset.key === slide.assetVersion))
            continue;
        const cached = old.assets.find(asset => asset.key === slide.assetVersion);
        const blob = cached && !cached.invalid && await hash(cached.blob) === cached.checksum ? cached.blob : await download(slide.publicUrl, AbortSignal.any([signal, AbortSignal.timeout(60000)]), PLAYER_STORAGE_BUDGET - bytes);
        bytes += blob.size;
        if (bytes > PLAYER_STORAGE_BUDGET)
            throw new Error("storage_full");
        const checksum = await hash(blob);
        const invalid = !blob.size || Boolean(slide.creativeVersionId && checksum !== slide.assetVersion);
        assets.push({ key: slide.assetVersion, blob, checksum, invalid });
    }
    const prepared = await hydrate(manifest, assets, signal);
    const db = await database();
    try {
        if (signal.aborted)
            throw new DOMException("Aborted", "AbortError");
        const tx = db.transaction(["state", "assets"], "readwrite");
        const done = complete(tx);
        try {
            tx.objectStore("assets").clear();
            for (const asset of assets)
                tx.objectStore("assets").put(asset);
            tx.objectStore("state").put(manifest, "active");
            tx.objectStore("state").put(Date.now(), "observedAt");
        }
        catch (error) {
            tx.abort();
            await done.catch(() => { });
            throw error;
        }
        await done;
        return prepared;
    }
    catch (error) {
        prepared.release();
        throw error;
    }
    finally {
        db.close();
    }
}
export async function queuePlayback(playerId: string, event: PlaybackEvent) {
    const db = await database();
    try {
        const tx = db.transaction(["outbox", "state"], "readwrite");
        const done = complete(tx);
        const store = tx.objectStore("outbox");
        const count = await request(store.count());
        if (count >= PLAYER_OUTBOX_LIMIT) {
            tx.abort();
            await done.catch(() => { });
            throw new Error("outbox_full");
        }
        try {
            store.put({ eventId: event.eventId, playerId, event } satisfies Pending);
            tx.objectStore("state").put(Date.now(), "observedAt");
        }
        catch (error) {
            tx.abort();
            await done.catch(() => { });
            throw error;
        }
        await done;
    }
    finally {
        db.close();
    }
}
export async function flushPlayback(playerId: string, signal: AbortSignal) {
    const db = await database();
    try {
        const tx = db.transaction("outbox");
        const done = complete(tx);
        const rows = await request(tx.objectStore("outbox").getAll()) as Pending[];
        await done;
        for (const row of rows.filter(row => row.playerId === playerId && !row.rejected).slice(0, 100)) {
            try {
                const response = await playerPost("/api/player/events", row.event, AbortSignal.any([signal, AbortSignal.timeout(12000)]));
                if ((await response.json()).eventId !== row.eventId)
                    throw new Error("invalid_acknowledgment");
                const remove = db.transaction("outbox", "readwrite");
                const removed = complete(remove);
                remove.objectStore("outbox").delete(row.eventId);
                await removed;
            }
            catch (error) {
                if (error instanceof PlayerRequestError && [409, 422].includes(error.status)) {
                    const mark = db.transaction("outbox", "readwrite");
                    const marked = complete(mark);
                    mark.objectStore("outbox").put({ ...row, rejected: error.status });
                    await marked;
                }
                else
                    throw error;
            }
        }
    }
    finally {
        db.close();
    }
}
