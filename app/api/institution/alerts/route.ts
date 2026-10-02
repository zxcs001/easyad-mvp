import { NextRequest, NextResponse } from "next/server";
import type { DeviceAlertType } from "../../../data";
import { canManageInstitutionAlerts, canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { createDeviceAlertIfNoConflict, DeviceAlertTargetError, getInventory, listDeviceAlerts } from "../../../lib/db";
import { findEmergencyTargets, type EmergencyTargeting } from "../../../lib/emergency-updates";
import { isDigitalInventory } from "../../../lib/inventory-delivery";
import { playersEnabled } from "../../../lib/players";
import { randomUUID } from "node:crypto";
import { deleteStoredMedia, storeMedia } from "../../../lib/media-storage";
import { prepareEmergencyImage } from "../../../lib/emergency-image";
import { emergencyImageError, emergencyImageMaxBytes } from "../../../lib/emergency-image-limits";
import { emergencyPlaceholders } from "../../../emergency-templates";

const alertTypes: DeviceAlertType[] = ["amber", "weather", "evacuation", "public-safety"];
const maxTargets = 100;
const maxDurationMs = 24 * 60 * 60 * 1000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !canManageInstitutionAlerts(user)) return NextResponse.json({ error: "Institution account or Super Admin access required" }, { status: 403 });
  const alerts = await listDeviceAlerts(user.role === "institutional" ? user.id : undefined);
  return NextResponse.json({ alerts });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageInstitutionAlerts(user)) return NextResponse.json({ error: "Institution account or Super Admin access required" }, { status: 403 });

  if (Number(request.headers.get("content-length")) > emergencyImageMaxBytes + 64 * 1024) {
    return NextResponse.json({ error: emergencyImageError }, { status: 413 });
  }
  let body;
  let imageFile: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("draft") ?? "{}"));
      const file = form.get("image");
      if (file !== null && !(file instanceof File)) throw new Error();
      imageFile = file instanceof File ? file : null;
    } else body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch { return NextResponse.json({ error: "Enter valid emergency update details." }, { status: 400 }); }
  const alertType = alertTypes.includes(body.alertType) ? body.alertType as DeviceAlertType : null;
  const title = cleanText(body.title, 120);
  const message = cleanText(body.message, 600);
  const area = cleanText(body.area, 160);
  if (emergencyPlaceholders(title, message, area).length) {
    return NextResponse.json({ error: "Replace every template prompt with verified details before publishing." }, { status: 400 });
  }
  let targetDeviceIds = cleanDeviceIds(body.targetDeviceIds);
  if (body.targeting) {
    if (!playersEnabled()) return NextResponse.json({ error: "Device delivery is not enabled. Enable player control before publishing emergency updates." }, { status: 409 });
    try {
      const targets = await findEmergencyTargets(user, body.targeting as EmergencyTargeting);
      targetDeviceIds = targets.map(target => target.id);
      const reviewedIds = cleanDeviceIds(body.reviewedTargetDeviceIds).sort();
      if (JSON.stringify([...targetDeviceIds].sort()) !== JSON.stringify(reviewedIds)) {
        return NextResponse.json({ error: "Matching screens changed. Find screens again and review the targets before publishing." }, { status: 409 });
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to find target screens." }, { status: 400 });
    }
  }
  const expiresAtMs = Date.parse(typeof body.expiresAt === "string" ? body.expiresAt : "");
  const now = Date.now();

  if (!alertType || !title || !message || !area || !targetDeviceIds.length) {
    return NextResponse.json({ error: "Alert type, title, instructions, area, and at least one screen are required" }, { status: 400 });
  }
  if (targetDeviceIds.length > maxTargets) {
    return NextResponse.json({ error: `Choose no more than ${maxTargets} screens per override` }, { status: 400 });
  }
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now || expiresAtMs - now > maxDurationMs) {
    return NextResponse.json({ error: "Choose an expiry between now and 24 hours from now" }, { status: 400 });
  }

  const devices = await Promise.all(targetDeviceIds.map((id) => getInventory(id)));
  if (devices.some((device) => !device)) return NextResponse.json({ error: "One or more selected screens no longer exist" }, { status: 404 });
  const resolvedDevices = devices.filter((device): device is NonNullable<typeof device> => Boolean(device));
  if (resolvedDevices.some((device) => !canManageInventoryRecord(user, device))) {
    return NextResponse.json({ error: "One or more selected screens belong to another institution" }, { status: 403 });
  }
  if (resolvedDevices.some((device) => device.approvalStatus !== "approved")) {
    return NextResponse.json({ error: "Publish every selected screen before starting an emergency override" }, { status: 409 });
  }
  if (resolvedDevices.some((device) => !isDigitalInventory(device))) {
    return NextResponse.json({ error: "Emergency updates can only play on digital screens. Static billboards cannot receive alerts." }, { status: 422 });
  }

  const institutionIds = new Set(resolvedDevices.map((device) => device.institutionId).filter((id): id is string => Boolean(id)));
  if (institutionIds.size !== 1 || (user.role === "institutional" && !institutionIds.has(user.id))) {
    return NextResponse.json({ error: "Emergency overrides must target screens from one institution" }, { status: 403 });
  }
  const institutionId = Array.from(institutionIds)[0];
  const image = imageFile ? await prepareEmergencyImage(imageFile) : null;
  if (imageFile && !image) return NextResponse.json({ error: emergencyImageError }, { status: 400 });
  let imageStoragePath: string | undefined;
  if (image) {
    try { imageStoragePath = await storeMedia(`emergency/${institutionId}/${randomUUID()}.jpg`, image.bytes, image.mimeType); }
    catch { return NextResponse.json({ error: "The emergency photo could not be saved. Please retry." }, { status: 503 }); }
  }
  let result;
  try {
    result = await createDeviceAlertIfNoConflict({
    institutionId,
    alertType,
    title,
    message,
    area,
    targetDeviceIds,
    issuedBy: user.name,
    createdBy: user.id,
    expiresAt: new Date(expiresAtMs).toISOString(),
    image: image && imageFile ? { url: "", mimeType: image.mimeType, originalName: imageFile.name.slice(0, 160), sizeBytes: image.bytes.length } : null,
    }, imageStoragePath);
  } catch (error) {
    if (imageStoragePath) await deleteStoredMedia(imageStoragePath).catch(() => undefined);
    if (error instanceof DeviceAlertTargetError) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }

  if (!result.alert) {
    if (imageStoragePath) await deleteStoredMedia(imageStoragePath).catch(() => undefined);
    return NextResponse.json({ error: "End the active override on the selected screens before publishing another" }, { status: 409 });
  }

  return NextResponse.json({ alert: result.alert }, { status: 201 });
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, maxLength) : "";
}

function cleanDeviceIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)));
}
