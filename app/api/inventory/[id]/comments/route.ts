import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { createInventoryComment, getInventory, listInventoryComments } from "../../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_COMMENT_LENGTH = 1000;

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  return NextResponse.json({
    comments: inventory.commentsEnabled === false ? [] : await listInventoryComments(id),
    commentsEnabled: inventory.commentsEnabled !== false,
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (inventory.commentsEnabled === false) {
    return NextResponse.json({ error: "Comments are turned off for this location" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) return NextResponse.json({ error: "A comment is required" }, { status: 400 });
  if (text.length > MAX_COMMENT_LENGTH) {
    return NextResponse.json({ error: `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer` }, { status: 400 });
  }

  const comment = await createInventoryComment({ inventoryId: id, authorId: user.id, authorName: user.name, body: text });
  return NextResponse.json({ comment }, { status: 201 });
}
