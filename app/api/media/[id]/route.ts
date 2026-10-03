import {fleetEnabled,fleetAudit} from "../../../lib/fleet";
import { NextRequest, NextResponse } from "next/server";
import { canPublishInventoryRecord, canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { getDb, deleteMediaResource, getInventory, getMediaResource, updateMediaApprovalStatus } from "../../../lib/db";
import { deleteStoredMedia } from "../../../lib/media-storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const existing = await getMediaResource(id);
  if (!existing) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  const inventory = await getInventory(existing.resource.inventoryId);
  if (!inventory || !canPublishInventoryRecord(user, inventory)) {
    return NextResponse.json({ error: "Only the owning institution or a super admin can review this content" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (body.approvalStatus !== "approved" && body.approvalStatus !== "rejected") {
    return NextResponse.json({ error: "Choose approve or reject" }, { status: 400 });
  }
  const resource = await updateMediaApprovalStatus(id, body.approvalStatus,user.id);
  if (!resource) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  return NextResponse.json({ resource });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const existing = await getMediaResource(id);
  if (!existing) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  const inventory = await getInventory(existing.resource.inventoryId);
  const canDelete = user.role === "admin" || (inventory && canManageInventoryRecord(user, inventory));
  if (!canDelete) return NextResponse.json({ error: "This resource belongs to another account" }, { status: 403 });
  const deleted = await deleteMediaResource(id);
  if (!deleted) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  try {
    if(!(await getDb().query("SELECT id FROM media_resources WHERE storage_path=$1 LIMIT 1",[deleted.storagePath])).rowCount)await deleteStoredMedia(deleted.storagePath);
  } catch {
    // The database record is the source of truth; missing files should not block cleanup.
  }
  return NextResponse.json({ ok: true });
}
