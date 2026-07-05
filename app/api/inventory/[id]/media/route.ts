import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { canManageInventory, canManageInventoryRecord, getCurrentUser } from "../../../../lib/auth";
import { createMediaResource, getInventory, listMediaResources, uploadsDir } from "../../../../lib/db";
import { inspectMediaUpload } from "../../../../lib/uploads";
import { truncateFileName } from "../../../../utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory || !canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ resources: await listMediaResources(id) });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user || !canManageInventory(user)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const inventory = await getInventory(id);
  if (!inventory) return NextResponse.json({ error: "Inventory not found" }, { status: 404 });
  if (!canManageInventoryRecord(user, inventory)) return NextResponse.json({ error: "This device belongs to another institution" }, { status: 403 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "A file is required" }, { status: 400 });
  const upload = await inspectMediaUpload(file, ["png", "jpg", "webp", "mp4", "webm"]);
  if (!upload) return NextResponse.json({ error: "Upload a valid PNG, JPEG, WebP, MP4, or WebM file up to 50 MB" }, { status: 400 });

  const resourceId = `MED-${Date.now().toString(36).toUpperCase()}`;
  const originalName = truncateFileName(file.name || "upload");
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "-");
  const inventoryDir = path.join(uploadsDir, id);
  mkdirSync(inventoryDir, { recursive: true });
  const storagePath = path.join(inventoryDir, `${resourceId}-${safeName}`);
  writeFileSync(storagePath, upload.bytes);

  const resource = await createMediaResource({
    id: resourceId,
    inventoryId: id,
    ownerId: user.id,
    title: String(form.get("title") ?? originalName),
    originalName,
    mimeType: upload.mimeType,
    mediaType: upload.mediaType,
    sizeBytes: upload.bytes.byteLength,
    publicUrl: `/media/${resourceId}`,
    createdAt: new Date().toISOString(),
    storagePath,
  });

  return NextResponse.json({ resource }, { status: 201 });
}
