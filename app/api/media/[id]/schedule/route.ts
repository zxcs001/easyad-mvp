import { NextRequest, NextResponse } from "next/server";
import { canManageInventoryRecord, canPublishInventoryRecord, getCurrentUser } from "../../../../lib/auth";
import { getInventory, getMediaResource, updateMediaSchedule } from "../../../../lib/db";
import { parseContentSchedule } from "../../../../lib/content-schedule";
import { isDigitalInventory } from "../../../../lib/inventory-delivery";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const existing = await getMediaResource(id);
  if (!existing) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  const inventory = await getInventory(existing.resource.inventoryId);
  if (!inventory || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "This resource belongs to another account" }, { status: 403 });
  if (!isDigitalInventory(inventory)) return NextResponse.json({ error: "Recurring content requires a digital screen." }, { status: 422 });
  const body = await request.json().catch(() => null);
  if (!body || !Number.isSafeInteger(body.revision) || body.revision < 1) return NextResponse.json({ error: "Reload this resource before editing its schedule." }, { status: 422 });
  let schedule;
  try { schedule = parseContentSchedule(body.schedule); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Choose a valid recurring schedule." }, { status: 422 }); }
  const resource = await updateMediaSchedule(id, schedule, body.revision, user.id, !canPublishInventoryRecord(user, inventory));
  if (!resource) return NextResponse.json({ error: "This content changed. Reload before saving its schedule." }, { status: 409 });
  return NextResponse.json({ resource });
}
