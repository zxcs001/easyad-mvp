import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Creative, formats } from "../../../../data";
import { canSubmitCreative, getCurrentUser } from "../../../../lib/auth";
import { createCreative, getBooking, getBookingOwnerId, getInventory, listCreatives, updateBookingRecord } from "../../../../lib/db";
import { deleteStoredMedia, storeMedia } from "../../../../lib/media-storage";
import { inspectCreativeUpload, inspectMediaUpload } from "../../../../lib/uploads";
import { isStaticInventory } from "../../../../lib/inventory-delivery";
import { creativeDimensions, isCreativeSubmissionAllowed, truncateFileName, validateCreative } from "../../../../utils";
import { defaultCreativeHtml } from "../../../../creative-templates";
import { renderCreativeDocument, sanitizeCreativeHtml } from "../../../../lib/creative-template";
import { ResponseLinkError, responseQrSvg, saveResponseLink, shortUrlFor } from "../../../../lib/responses";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!canSubmitCreative(user, await getBookingOwnerId(id))) {
    return NextResponse.json({ error: "You do not have access to this campaign creative" }, { status: 403 });
  }
  return NextResponse.json({ creatives: await listCreatives(id) });
}

// Persist a submitted creative against a booking. The creative spec is
// validated server-side before it is stored and the booking moves into the
// creative-review queue.
export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const booking = await getBooking(id);
  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  if (!canSubmitCreative(user, await getBookingOwnerId(id))) {
    return NextResponse.json({ error: "You can only submit creative for campaigns you own" }, { status: 403 });
  }
  if (!isCreativeSubmissionAllowed(booking)) {
    return NextResponse.json({ error: "Creative can only be submitted for active pending-approval or approved campaigns" }, { status: 409 });
  }

  const inventory = await getInventory(booking.inventoryId);
  if (!inventory) return NextResponse.json({ error: "The booked placement is no longer available. Refresh your campaign before submitting artwork." }, { status: 404 });
  const requiresUpload = isStaticInventory(inventory);

  const contentType = request.headers.get("content-type") ?? "";
  if (requiresUpload && !contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Static billboards require uploaded artwork. Choose a PNG, JPG, or PDF file." }, { status: 422 });
  }
  const upload = contentType.includes("multipart/form-data") ? await readUploadSubmission(request, requiresUpload) : null;
  if (upload && "error" in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const body = upload ? upload.fields : await request.json().catch(() => ({}));
  if (body.format !== inventory.format) {
    return NextResponse.json({ error: `This campaign requires ${formats[inventory.format].label} artwork. Submit artwork in the booked placement's format.` }, { status: 422 });
  }
  const template = ["retail", "finance", "event"].includes(body.template) ? (body.template as Creative["template"]) : "retail";
  const draft = {
    template,
    format: inventory.format,
    ...creativeDimensions(inventory.format),
    fileType: upload ? upload.fileType as Creative["fileType"] : "html" as const,
    fileSize: upload ? upload.fileSize : 1,
    safeZone: cleanNumber(body.safeZone, 10),
    distortion: cleanNumber(body.distortion, 1),
  };

  const checks = validateCreative(draft);
  if (!checks.every((check) => check.ok)) {
    return NextResponse.json({ error: checks.filter((check) => !check.ok).map((check) => `${check.label}: ${check.message}`).join("\n"), checks }, { status: 422 });
  }

  let templateDocument: string | null = null;
  if (!upload) {
    try {
      const sanitizedHtml = sanitizeCreativeHtml(body.html === undefined ? defaultCreativeHtml[template] : body.html);
      // An optional QR code: the booking's short link goes on the ad, so scans
      // count in the advertiser's results. The code stays the same on resubmission.
      let qrSvg: string | undefined;
      if (typeof body.responseUrl === "string" && body.responseUrl.trim()) {
        const code = await saveResponseLink(booking.id, user.id, { destinationUrl: body.responseUrl, onAd: true });
        qrSvg = await responseQrSvg(shortUrlFor(code, process.env.APP_ORIGIN || request.nextUrl.origin));
      }
      templateDocument = renderCreativeDocument(template, sanitizedHtml, { qrSvg });
    } catch (error) {
      if (error instanceof ResponseLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid template HTML" }, { status: 422 });
    }
  }

  const creativeId = `CRV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  let uploadMetadata: Pick<Creative, "source" | "originalName" | "mimeType" | "publicUrl"> & { storagePath?: string | null } = {
    source: "template",
    originalName: null,
    mimeType: null,
    publicUrl: null,
    storagePath: null,
  };

  if (upload) {
    const storagePath = await storeMedia(`creatives/${creativeId}.${upload.extension}`, upload.bytes, upload.mimeType);
    uploadMetadata = {
      source: "upload",
      originalName: truncateFileName(upload.originalName || "uploaded-creative"),
      mimeType: upload.mimeType,
      publicUrl: `/media/${creativeId}`,
      storagePath,
    };
  } else if (templateDocument) {
    const bytes = Buffer.from(templateDocument, "utf8");
    const storagePath = await storeMedia(`creatives/${creativeId}.html`, bytes, "text/html");
    uploadMetadata = {
      source: "template",
      originalName: `${template}-template.html`,
      mimeType: "text/html",
      publicUrl: `/creative-html/${creativeId}`,
      storagePath,
    };
  }

  let creative;
  try {
    creative = await createCreative({ id: creativeId, bookingId: id, ...draft, ...uploadMetadata, status: "pending review" });
  } catch (error) {
    if (uploadMetadata.storagePath) await deleteStoredMedia(uploadMetadata.storagePath).catch(() => undefined);
    throw error;
  }
  const updated = await updateBookingRecord(id, { creativeStatus: "pending review", status: "creative review" });
  return NextResponse.json({ creative, booking: updated }, { status: 201 });
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readUploadSubmission(request: NextRequest, requiresUpload: boolean) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a media file before submitting your creative.", status: 400 as const };
  if (file.size > 50 * 1024 * 1024) return { error: "The upload is too large. Choose a file up to 50 MB.", status: 400 as const };
  const upload = requiresUpload
    ? await inspectCreativeUpload(file, ["png", "jpg", "pdf"])
    : await inspectMediaUpload(file, ["png", "jpg", "gif", "mp4"]);
  if (!upload) return {
    error: requiresUpload
      ? "Static billboard artwork must be a valid PNG, JPG, or PDF file. The file contents and MIME type must match."
      : "Creative uploads support valid PNG, JPEG, GIF, or MP4 files up to 50 MB",
    status: 400 as const,
  };
  return {
    ...upload,
    originalName: file.name,
    fileType: upload.extension === "jpg" ? "jpg" : upload.extension,
    fileSize: Math.max(1, Math.ceil(upload.bytes.byteLength / 1048576)),
    fields: {
      template: String(form.get("template") ?? "retail"),
      format: String(form.get("format") ?? "digital"),
      safeZone: String(form.get("safeZone") ?? ""),
      distortion: String(form.get("distortion") ?? ""),
    },
  };
}
