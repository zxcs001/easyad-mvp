import {fleetEnabled,fleetAudit} from "../../../lib/fleet";
import { NextRequest, NextResponse } from "next/server";
import { canManageInventory, canManageInventoryRecord, canPublishInventoryRecord, getCurrentUser } from "../../../lib/auth";
import { deleteInventoryRecord, getInventory, updateInventoryRecord } from "../../../lib/db";
import { isValidAvailabilityWindow } from "../../../lib/inventory-availability";

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
  if(["institutionId","ownerOrganizationId","contentVisibility","advertisingOptIn","reservedSeconds","restrictedCategories","building","department"].some(key=>key in body && JSON.stringify(body[key])!==JSON.stringify(current[key as keyof typeof current])))return NextResponse.json({error:"Use the owner fleet policy controls"},{status:422});
  const availabilityWindow = {
    availableFrom: "availableFrom" in body ? body.availableFrom : current.availableFrom,
    availableTo: "availableTo" in body ? body.availableTo : current.availableTo,
  };
  if (!isValidAvailabilityWindow(availabilityWindow)) {
    return NextResponse.json({ error: "Choose a valid availability start and end date" }, { status: 400 });
  }
  if ("approvalStatus" in body) {
    if (!["pending approval", "approved", "rejected"].includes(body.approvalStatus)) {
      return NextResponse.json({ error: "Choose a valid device publish state" }, { status: 400 });
    }
    if (!canPublishInventoryRecord(user, current)) {
      return NextResponse.json({ error: "Only the owning institution or a super admin can change device publishing" }, { status: 403 });
    }
    if (user.role === "institutional" && body.approvalStatus === "rejected") {
      return NextResponse.json({ error: "Institutions can publish or unpublish their devices; rejection is reserved for super admins" }, { status: 403 });
    }
  }
  const item = await updateInventoryRecord(id, body, user);
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
