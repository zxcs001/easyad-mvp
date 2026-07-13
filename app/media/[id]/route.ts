import { NextRequest, NextResponse } from "next/server";
import { getPublicMediaResource } from "../../lib/db";
import { readStoredMedia } from "../../lib/media-storage";
import { isSafeMediaMimeType } from "../../lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const entry = await getPublicMediaResource(id);
  if (!entry) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  let stored;
  try {
    stored = await readStoredMedia(entry.storagePath);
  } catch {
    return NextResponse.json({ error: "Resource file not found" }, { status: 404 });
  }
  return new NextResponse(stored.bytes, {
    headers: {
      "Content-Type": isSafeMediaMimeType(entry.mimeType) ? entry.mimeType : "application/octet-stream",
      "Content-Length": String(stored.size),
      "Content-Disposition": `${isSafeMediaMimeType(entry.mimeType) ? "inline" : "attachment"}; filename="${entry.originalName.replace(/[\\"\r\n]/g, "")}"`,
      "Cache-Control": entry.cacheable ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
