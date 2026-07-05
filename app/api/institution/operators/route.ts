import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { countInstitutionOperators, createUser, getUserByEmail, listInstitutionOperators } from "../../../lib/db";
import { hashPassword } from "../../../lib/password";
import { isAcceptablePassword } from "../../../lib/password";

export async function GET() {
  const institution = await getCurrentUser();
  if (institution?.role !== "institutional") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  return NextResponse.json({ users: await listInstitutionOperators(institution.id), limit: institution.operatorLimit });
}

export async function POST(request: NextRequest) {
  const institution = await getCurrentUser();
  if (institution?.role !== "institutional") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (await countInstitutionOperators(institution.id) >= institution.operatorLimit) {
    return NextResponse.json({ error: "Your institution has reached its operator seat limit" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || !email || !isAcceptablePassword(password)) {
    return NextResponse.json({ error: "Name, email, and a strong password are required" }, { status: 400 });
  }
  if (await getUserByEmail(email)) return NextResponse.json({ error: "An account already uses this email" }, { status: 409 });

  const user = await createUser(name, email, hashPassword(password), "operator", { institutionId: institution.id });
  return NextResponse.json({ user }, { status: 201 });
}
