import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAllowedRole } from "../../../../lib/auth";
import { deleteManagedUser, getUserById, updateManagedUser } from "../../../../lib/db";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const role = isAllowedRole(body.role) && body.role !== "admin" ? body.role : undefined;
  const status = body.status === "active" || body.status === "banned" ? body.status : undefined;
  const institutionId = typeof body.institutionId === "string" ? body.institutionId : body.institutionId === null ? null : undefined;
  const operatorLimit = Number.isFinite(Number(body.operatorLimit)) ? Number(body.operatorLimit) : undefined;
  if (!role && !status && institutionId === undefined && operatorLimit === undefined) return NextResponse.json({ error: "Choose a valid account update" }, { status: 400 });
  const current = await getUserById(id);
  if (role === "operator") {
    const resolvedInstitutionId = institutionId ?? current?.institutionId;
    const institution = resolvedInstitutionId ? await getUserById(resolvedInstitutionId) : null;
    if (!institution || institution.role !== "institutional") return NextResponse.json({ error: "Operators must be assigned to an institutional account" }, { status: 400 });
  }

  const user = await updateManagedUser(id, { role, status, institutionId, operatorLimit });
  if (!user) return NextResponse.json({ error: "Non-admin account not found" }, { status: 404 });
  return NextResponse.json({ user });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await context.params;
  if (!(await deleteManagedUser(id))) return NextResponse.json({ error: "Non-admin account not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
