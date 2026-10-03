import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryRecord, getCurrentUser } from "../../../../lib/auth";
import { createInventorySpecification, getInventory, listInventorySpecifications } from "../../../../lib/db";
import { isFeatureEnabled } from "../../../../lib/feature-flags";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (inventory.approvalStatus !== "approved" || inventory.contentVisibility === "private") {
    const user = await getCurrentUser();
    if (!user || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ specifications: await listInventorySpecifications(id) });
}

export async function POST(request: NextRequest, context: Context) {
  if (!isFeatureEnabled("static_fulfillment")) return NextResponse.json({ error: "Static fulfillment is not available" }, { status: 404 });
  const user = await getCurrentUser();
  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (!user || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (inventory.deliveryMode !== "static") return NextResponse.json({ error: "Production specifications apply only to static inventory" }, { status: 422 });
  const body = await request.json().catch(() => ({}));
  const acceptedFileTypes = Array.isArray(body.acceptedFileTypes) ? body.acceptedFileTypes.filter((value: unknown): value is string => typeof value === "string").map((value: string) => value.toLowerCase()) : [];
  if (!acceptedFileTypes.length) return NextResponse.json({ error: "At least one accepted file type is required" }, { status: 422 });
  const specification = await createInventorySpecification(id, {
    trimWidthMm: positiveOrNull(body.trimWidthMm), trimHeightMm: positiveOrNull(body.trimHeightMm),
    visibleWidthMm: positiveOrNull(body.visibleWidthMm), visibleHeightMm: positiveOrNull(body.visibleHeightMm),
    bleedMm: positiveOrNull(body.bleedMm), safeAreaMm: positiveOrNull(body.safeAreaMm), scaleRatio: textOrNull(body.scaleRatio),
    minimumDpi: positiveOrNull(body.minimumDpi), colourSpace: textOrNull(body.colourSpace), acceptedFileTypes,
    maximumFileBytes: positiveOrNull(body.maximumFileBytes), substrate: textOrNull(body.substrate), finishing: textOrNull(body.finishing),
    templateUrl: textOrNull(body.templateUrl), notes: textOrNull(body.notes),
  }, user.id);
  return NextResponse.json({ specification }, { status: 201 });
}

function positiveOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) && number >= 0 ? number : null; }
function textOrNull(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
