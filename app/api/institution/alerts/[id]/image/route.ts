import { NextRequest, NextResponse } from "next/server";
import { canManageInstitutionAlerts, getCurrentUser } from "../../../../../lib/auth";
import { getDb, getDeviceAlert, getPublishedInventory } from "../../../../../lib/db";
import { readStoredMedia } from "../../../../../lib/media-storage";
import { playerToken } from "../../../../../lib/player-http";
import { fetchPlayerManifest } from "../../../../../lib/players";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const alert = await getDeviceAlert(id);
  const unavailable = () => NextResponse.json({ error: "Emergency photo is unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  if (!alert?.image) return unavailable();
  const user = await getCurrentUser();
  const owner = user && canManageInstitutionAlerts(user) && (user.role === "admin" || user.id === alert.institutionId);
  if (!owner) {
    if (alert.status !== "active" || Date.parse(alert.expiresAt) <= Date.now()) return unavailable();
    let paired = false;
    if (playerToken(request)) {
      try { const manifest = await fetchPlayerManifest(playerToken(request)); paired = manifest.published && manifest.activeAlert?.id === id; } catch { /* Try the public screen boundary below. */ }
    }
    if (!paired) {
      const targets = await Promise.all(alert.targetDeviceIds.map(target => getPublishedInventory(target)));
      if (!targets.some(target => target?.institutionId === alert.institutionId)) return unavailable();
    }
  }
  const result = await getDb().query<{ image_storage_path: string | null }>("SELECT image_storage_path FROM device_alerts WHERE id=$1", [id]);
  const path = result.rows[0]?.image_storage_path;
  if (!path) return unavailable();
  try {
    const media = await readStoredMedia(path);
    return new NextResponse(new Uint8Array(media.bytes), { headers: { "Content-Type": alert.image.mimeType, "Content-Length": String(media.size), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return unavailable(); }
}
