import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "../../lib/db";
import { mediaStorageStatus } from "../../lib/media-storage";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  try {
    await checkDatabaseHealth();
    const storage = mediaStorageStatus();
    if (!storage.configured) throw new Error("Media storage is not configured");
    return NextResponse.json({
      status: "ok",
      database: "connected",
      mediaStorage: storage.provider,
      responseTimeMs: Date.now() - startedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
