import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { DisplayTemplate, FormatKey, InventoryItem, displayTemplates, formats } from "../../data";
import { canManageInventory, getCurrentUser, getInstitutionScope } from "../../lib/auth";
import { createInventory, listInventory, listInventoryByInstitution, listPublishedInventory } from "../../lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (user.role === "admin") return NextResponse.json({ inventory: await listInventory() });
  const institutionId = getInstitutionScope(user);
  return NextResponse.json({ inventory: institutionId ? await listInventoryByInstitution(institutionId) : await listPublishedInventory() });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const institutionId = getInstitutionScope(user);
  if (user.role !== "admin" && !institutionId) {
    return NextResponse.json({ error: "Operators must belong to an institution before creating devices" }, { status: 403 });
  }
  const format = isFormat(body.format) ? body.format : "digital";
  const item: InventoryItem = {
    id: `INV-${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
    name: cleanString(body.name, "New Inventory Unit"),
    operator: cleanString(body.operator, user?.role === "operator" || user?.role === "institutional" ? user.name : "Platform Media"),
    format,
    x: cleanNumber(body.x, 50),
    y: cleanNumber(body.y, 50),
    address: cleanString(body.address, "New market location"),
    price: cleanNumber(body.price, 500),
    impressions: cleanNumber(body.impressions, 80000),
    traffic: cleanNumber(body.traffic, 50000),
    income: cleanNumber(body.income, 90000),
    audience: cleanString(body.audience, "Commuters"),
    competitor: ["Low", "Medium", "High"].includes(body.competitor) ? body.competitor : "Medium",
    occupancy: cleanNumber(body.occupancy, 0),
    imageInterval: cleanImageInterval(body.imageInterval),
    maxLoopSeconds: cleanLoopCapacity(body.maxLoopSeconds),
    availableFrom: cleanString(body.availableFrom, "2026-07-01"),
    availableTo: cleanString(body.availableTo, "2026-09-01"),
    approvalStatus: user.role === "operator" || user.role === "institutional" ? "pending approval" : "approved",
    tags: cleanTags(body.tags),
    displayTemplate: cleanTemplate(body.displayTemplate),
    commentsEnabled: body.commentsEnabled !== false,
  };

  const created = await createInventory(item, user.id, institutionId);
  return NextResponse.json({ item: created }, { status: 201 });
}

function isFormat(value: unknown): value is FormatKey {
  return typeof value === "string" && Object.keys(formats).includes(value);
}

function cleanTemplate(value: unknown): DisplayTemplate {
  return typeof value === "string" && (displayTemplates as string[]).includes(value) ? (value as DisplayTemplate) : "fullscreen";
}

function cleanString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanImageInterval(value: unknown) {
  const parsed = Number(value);
  return Math.min(60, Math.max(2, Math.round(Number.isFinite(parsed) ? parsed : 6)));
}

function cleanLoopCapacity(value: unknown) {
  const parsed = Number(value);
  return Math.min(3600, Math.max(2, Math.round(Number.isFinite(parsed) ? parsed : 120)));
}

function cleanTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .map((tag) => tag.slice(0, 40)))]
    .slice(0, 30);
}
