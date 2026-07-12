import { unlinkSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { deleteMediaResource, getInventory, getMediaResource } from "../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const existing = await getMediaResource(id);
  if (!existing) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  const inventory = await getInventory(existing.resource.inventoryId);
  const canDelete = user.role === "admin" || existing.resource.ownerId === user.id || (inventory && canManageInventoryRecord(user, inventory));
  if (!canDelete) return NextResponse.json({ error: "This resource belongs to another account" }, { status: 403 });
  const deleted = await deleteMediaResource(id);
  if (!deleted) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  try {
    unlinkSync(deleted.storagePath);
  } catch {
    // The database record is the source of truth; missing files should not block cleanup.
  }
  return NextResponse.json({ ok: true });
}
