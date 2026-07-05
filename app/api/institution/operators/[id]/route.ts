import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { deleteManagedUser, getUserById } from "../../../../lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const institution = await getCurrentUser();
  if (institution?.role !== "institutional") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  const operator = await getUserById(id);
  if (!operator || operator.role !== "operator" || operator.institutionId !== institution.id) {
    return NextResponse.json({ error: "Operator not found in this institution" }, { status: 404 });
  }
  await deleteManagedUser(id);
  return NextResponse.json({ ok: true });
}
