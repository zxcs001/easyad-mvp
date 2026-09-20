import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Booking, Creative, FormatKey, formats } from "../../data";
import { canBuyAds, getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { createBookingRecord, createBookingWithCreativeRecord, getInventory, listBookings, listBookingsCreatedBy, listBookingsForInstitution } from "../../lib/db";
import { estimateSpend, exceedsLoopCapacity, truncateFileName } from "../../utils";
import { isInventoryAvailableForDates } from "../../lib/inventory-availability";
import { isDigitalInventory, isStaticInventory } from "../../lib/inventory-delivery";
import { deleteStoredMedia, storeMedia } from "../../lib/media-storage";
import { inspectMediaUpload } from "../../lib/uploads";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const institutionId = getInstitutionScope(user);
  if (user.role === "operator" && !institutionId) return NextResponse.json({ error: "Operator must belong to an institution" }, { status: 403 });
  const bookings = user.role === "advertiser" ? await listBookingsCreatedBy(user.id) : institutionId ? await listBookingsForInstitution(institutionId) : await listBookings();
  return NextResponse.json({ bookings: bookings.filter(b=>user.role!=="operator"||!Array.isArray(user.screenScope)||user.screenScope.includes(b.inventoryId)) });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canBuyAds(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (!(request.headers.get("content-type") ?? "").includes("multipart/form-data")) return NextResponse.json({ error: "Submit booking details as form data" }, { status: 400 });
  const submission = await readBookingSubmission(request);
  if ("error" in submission) return NextResponse.json({ error: submission.error }, { status: submission.status });
  const { body, upload } = submission;
  const inventoryId = String(body.inventoryId ?? "");
  const item = await getInventory(inventoryId);
  if (!item) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if(item.contentVisibility==="private"||item.advertisingOptIn===false)return NextResponse.json({error:"The owner has not enabled marketplace advertising"},{status:409});
  if((item.restrictedCategories??[]).includes("general"))return NextResponse.json({error:"This screen requires a categorized campaign plan"},{status:409});
  if (upload?.extension === "gif" && !isDigitalInventory(item)) {
    return NextResponse.json({ error: "Animated GIF creative is available for digital inventory only" }, { status: 422 });
  }

  const start = String(body.start ?? "");
  const end = String(body.end ?? "");
  if (!start || !end) return NextResponse.json({ error: "Start and end dates are required" }, { status: 400 });
  const adSlots = cleanAdSlots(body.adSlots);

  if (isStaticInventory(item) && !isInventoryAvailableForDates(item, start, end)) {
    return NextResponse.json({ error: "Physical billboard is unavailable for those dates" }, { status: 409 });
  }

  if (isDigitalInventory(item) && exceedsLoopCapacity(item, await listBookings(), start, end, adSlots)) {
    return NextResponse.json({ error: "Device loop capacity is full for those dates" }, { status: 409 });
  }

  const booking: Booking = {
    id: `BK-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    advertiser: user.role === "advertiser" ? user.name : String(body.advertiser ?? user.name ?? "Advertiser"),
    inventoryId,
    campaign: String(body.campaign ?? "Launch Campaign"),
    start,
    end,
    adSlots,
    creativeStatus: upload ? "pending review" : "not submitted",
    status: upload ? "creative review" : "pending approval",
    spend: estimateSpend(item, start, end, adSlots),
    paid: false,
    pop: 0,
  };

  if (!upload) {
    const created = await createBookingRecord(booking, user.id);
    return NextResponse.json({ booking: created, creative: null }, { status: 201 });
  }

  const creativeId = `CRV-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
  const storagePath = await storeMedia(`creatives/${creativeId}.${upload.extension}`, upload.bytes, upload.mimeType);
  const dimensions = creativeDimensions(item.format);
  const creative: Omit<Creative, "createdAt"> & { storagePath: string } = {
    id: creativeId,
    bookingId: booking.id,
    source: "upload",
    template: "retail",
    format: item.format,
    width: dimensions.width,
    height: dimensions.height,
    fileType: upload.extension === "jpg" ? "jpg" : upload.extension === "gif" ? "gif" : "png",
    fileSize: Math.max(1, Math.ceil(upload.bytes.byteLength / 1048576)),
    safeZone: formats[item.format].safeZone,
    distortion: 0,
    originalName: truncateFileName(upload.originalName),
    mimeType: upload.mimeType,
    publicUrl: `/media/${creativeId}`,
    storagePath,
    status: "pending review",
  };

  try {
    const created = await createBookingWithCreativeRecord(booking, user.id, creative);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    await deleteStoredMedia(storagePath).catch(() => undefined);
    throw error;
  }
}

function cleanAdSlots(value: unknown) {
  const parsed = Number(value);
  return Math.min(100, Math.max(1, Math.round(Number.isFinite(parsed) ? parsed : 1)));
}

async function readBookingSubmission(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  const inspected = file instanceof File && file.size ? await inspectMediaUpload(file, ["png", "jpg", "gif"]) : null;
  if (file instanceof File && file.size && !inspected) return { error: "Booking images must be valid PNG, JPEG, or GIF files up to 50 MB", status: 400 as const };
  return {
    body: {
      inventoryId: String(form.get("inventoryId") ?? ""),
      advertiser: String(form.get("advertiser") ?? ""),
      campaign: String(form.get("campaign") ?? ""),
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      adSlots: String(form.get("adSlots") ?? "1"),
    },
    upload: inspected && file instanceof File ? { ...inspected, originalName: file.name } : null,
  };
}

function creativeDimensions(format: FormatKey) {
  if (format === "static") return { width: 5760, height: 1440 };
  if (format === "transit") return { width: 3000, height: 1000 };
  return { width: 1920, height: 1080 };
}
