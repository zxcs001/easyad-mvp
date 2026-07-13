import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Creative, FormatKey, formats } from "../../../../data";
import { canSubmitCreative, getCurrentUser } from "../../../../lib/auth";
import { createCreative, getBooking, getBookingOwnerId, listCreatives, updateBookingRecord } from "../../../../lib/db";
import { deleteStoredMedia, storeMedia } from "../../../../lib/media-storage";
import { inspectMediaUpload } from "../../../../lib/uploads";
import { isCreativeSubmissionAllowed, truncateFileName, validateCreative } from "../../../../utils";

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

  const contentType = request.headers.get("content-type") ?? "";
  const upload = contentType.includes("multipart/form-data") ? await readUploadSubmission(request) : null;
  if (upload && "error" in upload) return NextResponse.json({ error: upload.error }, { status: upload.status });

  const body = upload ? upload.fields : await request.json().catch(() => ({}));
  const draft = {
    template: ["retail", "finance", "event"].includes(body.template) ? (body.template as Creative["template"]) : "retail",
    format: isFormat(body.format) ? body.format : "digital",
    width: cleanNumber(body.width, 1920),
    height: cleanNumber(body.height, 1080),
    fileType: upload ? upload.fileType : isFileType(body.fileType) ? body.fileType : "png",
    fileSize: upload ? upload.fileSize : cleanNumber(body.fileSize, 80),
    safeZone: cleanNumber(body.safeZone, 10),
    distortion: cleanNumber(body.distortion, 1),
  };

  const checks = validateCreative(draft);
  if (!checks.every((check) => check.ok)) {
    return NextResponse.json({ error: "Creative failed validation", checks }, { status: 422 });
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

function isFormat(value: unknown): value is FormatKey {
  return typeof value === "string" && Object.keys(formats).includes(value);
}

function isFileType(value: unknown): value is Creative["fileType"] {
  return typeof value === "string" && ["png", "jpg", "pdf", "mp4"].includes(value);
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function readUploadSubmission(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "A creative image or video file is required", status: 400 as const };
  const upload = await inspectMediaUpload(file, ["png", "jpg", "mp4"]);
  if (!upload) return { error: "Creative uploads support valid PNG, JPEG, or MP4 files up to 50 MB", status: 400 as const };
  return {
    ...upload,
    originalName: file.name,
    fileType: upload.extension === "jpg" ? "jpg" : upload.extension,
    fileSize: Math.max(1, Math.ceil(upload.bytes.byteLength / 1048576)),
    fields: {
      template: String(form.get("template") ?? "retail"),
      format: String(form.get("format") ?? "digital"),
      width: String(form.get("width") ?? ""),
      height: String(form.get("height") ?? ""),
      safeZone: String(form.get("safeZone") ?? ""),
      distortion: String(form.get("distortion") ?? ""),
    },
  };
}
