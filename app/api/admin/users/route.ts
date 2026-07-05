import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, isAllowedRole } from "../../../lib/auth";
import { countInstitutionOperators, createUser, getUserByEmail, getUserById, listNonAdminUsers } from "../../../lib/db";
import { hashPassword } from "../../../lib/password";
import { isAcceptablePassword } from "../../../lib/password";

export async function GET() {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ users: await listNonAdminUsers() });
}

export async function POST(request: NextRequest) {
  const admin = await getCurrentUser();
  if (admin?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = isAllowedRole(body.role) && body.role !== "admin" ? body.role : null;
  const institutionId = typeof body.institutionId === "string" ? body.institutionId : null;
  const operatorLimit = Number(body.operatorLimit);
  if (!name || !email || !isAcceptablePassword(password) || !role) {
    return NextResponse.json({ error: "Name, email, a strong password, and a non-admin role are required" }, { status: 400 });
  }
  if (await getUserByEmail(email)) return NextResponse.json({ error: "An account already uses this email" }, { status: 409 });
  if (role === "operator") {
    const institution = institutionId ? await getUserById(institutionId) : null;
    if (!institution || institution.role !== "institutional") {
      return NextResponse.json({ error: "Operators must be assigned to an institutional account" }, { status: 400 });
    }
    if (await countInstitutionOperators(institution.id) >= institution.operatorLimit) {
      return NextResponse.json({ error: "That institution has reached its operator seat limit" }, { status: 409 });
    }
  }

  const user = await createUser(name, email, hashPassword(password), role, { institutionId, operatorLimit });
  return NextResponse.json({ user }, { status: 201 });
}
