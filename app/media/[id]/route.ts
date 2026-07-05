import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getPublicMediaResource, uploadsDir } from "../../lib/db";
import { isSafeMediaMimeType } from "../../lib/uploads";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const entry = await getPublicMediaResource(id);
  if (!entry) return NextResponse.json({ error: "Resource not found" }, { status: 404 });

  const resolved = path.resolve(entry.storagePath);
  const root = path.resolve(uploadsDir);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return NextResponse.json({ error: "Invalid resource path" }, { status: 403 });

  const file = readFileSync(resolved);
  const stat = statSync(resolved);
  return new NextResponse(file, {
    headers: {
      "Content-Type": isSafeMediaMimeType(entry.mimeType) ? entry.mimeType : "application/octet-stream",
      "Content-Length": String(stat.size),
      "Content-Disposition": `${isSafeMediaMimeType(entry.mimeType) ? "inline" : "attachment"}; filename="${entry.originalName.replace(/[\\"\r\n]/g, "")}"`,
      "Cache-Control": entry.cacheable ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
