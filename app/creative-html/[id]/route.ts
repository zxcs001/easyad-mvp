import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryRecord, canSubmitCreative, getCurrentUser } from "../../lib/auth";
import { getBooking, getBookingOwnerId, getCreativeStoredMedia, getInventory, getLegacyTemplateCreative, getPublicMediaResource } from "../../lib/db";
import { readStoredMedia } from "../../lib/media-storage";
import { creativeHtmlResponseCsp, defaultCreativeHtml, isCreativeTemplateTopic } from "../../creative-templates";
import { renderCreativeDocument, sanitizeCreativeHtml } from "../../lib/creative-template";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  let entry = await getPublicMediaResource(id);
  let generated: Buffer | null = null;
  if (!entry) {
    const [user, creative, legacy] = await Promise.all([getCurrentUser(), getCreativeStoredMedia(id), getLegacyTemplateCreative(id)]);
    if (legacy && isCreativeTemplateTopic(legacy.template)) {
      const isPublic = legacy.creative_status === "approved"
        && ["approved", "scheduled", "live"].includes(legacy.booking_status)
        && legacy.content_visibility === "public"
        && legacy.start_date <= legacy.today && legacy.end_date >= legacy.today;
      const booking = !isPublic && user ? await getBooking(legacy.booking_id) : null;
      const inventory = booking ? await getInventory(booking.inventoryId) : null;
      if (!isPublic && (!user || !booking || !inventory || !(canSubmitCreative(user, await getBookingOwnerId(booking.id)) || canManageInventoryRecord(user, inventory)))) {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
      generated = Buffer.from(renderCreativeDocument(legacy.template, sanitizeCreativeHtml(defaultCreativeHtml[legacy.template])), "utf8");
      entry = { originalName: `${legacy.template}-template.html`, mimeType: "text/html", storagePath: "", cacheable: false };
    } else if (!user || !creative || creative.mime_type !== "text/html") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    } else {
      const booking = await getBooking(creative.booking_id);
      const inventory = booking ? await getInventory(booking.inventoryId) : null;
      if (!booking || !inventory || !(canSubmitCreative(user, await getBookingOwnerId(booking.id)) || canManageInventoryRecord(user, inventory))) {
        return NextResponse.json({ error: "Resource not found" }, { status: 404 });
      }
      entry = { originalName: creative.original_name ?? "template.html", mimeType: "text/html", storagePath: creative.storage_path, cacheable: false };
    }
  }
  if (entry.mimeType !== "text/html") return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  try {
    const bytes = generated ?? (await readStoredMedia(entry.storagePath)).bytes;
    return new NextResponse(bytes, { headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="${entry.originalName.replace(/[\\"\r\n]/g, "")}"`,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": creativeHtmlResponseCsp,
      "X-Frame-Options": "SAMEORIGIN",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch {
    return NextResponse.json({ error: "Resource file not found" }, { status: 404 });
  }
}
