import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "../../../lib/db";
import { verifyPassword } from "../../../lib/password";
import { isRateLimited } from "../../../lib/rate-limit";
import { setSessionCookie } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const returnTo = String(form.get("returnTo") ?? "");
  if (isRateLimited(request, "login", email || "blank", 10, 15 * 60 * 1000)) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }
  const user = email ? await getUserByEmail(email) : null;

  if (!user || user.status === "banned" || !verifyPassword(password, user.password_hash)) {
    return NextResponse.redirect(new URL("/login?error=invalid", request.url), { status: 303 });
  }

  const destination = returnTo.startsWith("/") && !returnTo.startsWith("//")
    ? returnTo
    : `/?role=${user.role}&view=${user.role === "operator" || user.role === "institutional" ? "inventory" : "portal"}`;
  const response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  await setSessionCookie(response, user.id);
  return response;
}
