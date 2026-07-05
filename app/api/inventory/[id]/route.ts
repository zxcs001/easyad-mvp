import { NextRequest, NextResponse } from "next/server";
import { canManageInventory, canManageInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { deleteInventoryRecord, getInventory, updateInventoryRecord } from "../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const current = await getInventory(id);
  if (!current) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (!canManageInventoryRecord(user, current)) return NextResponse.json({ error: "This device belongs to another institution" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  if ("approvalStatus" in body && user.role !== "admin") {
    return NextResponse.json({ error: "Only super admins can approve or reject inventory" }, { status: 403 });
  }
  const item = await updateInventoryRecord(id, body);
  if (!item) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Only super admins can delete inventory" }, { status: 403 });
  const { id } = await context.params;
  await deleteInventoryRecord(id);
  return NextResponse.json({ ok: true });
}
