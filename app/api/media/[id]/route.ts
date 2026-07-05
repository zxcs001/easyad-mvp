import { unlinkSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { deleteMediaResource } from "../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Only super admins can delete resources" }, { status: 403 });
  const { id } = await context.params;
  const deleted = await deleteMediaResource(id);
  if (!deleted) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  try {
    unlinkSync(deleted.storagePath);
  } catch {
    // The database record is the source of truth; missing files should not block cleanup.
  }
  return NextResponse.json({ ok: true });
}
