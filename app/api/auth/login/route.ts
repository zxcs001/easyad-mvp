import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail } from "../../../lib/db";
import { verifyPassword } from "../../../lib/password";
import { isRateLimited } from "../../../lib/rate-limit";
import { requestUrl, safeLocalReturnPath, setSessionCookie } from "../../../lib/auth";
import { canAccessInstitutionWorkspace } from "../../../roles";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const returnTo = String(form.get("returnTo") ?? "");
  const audience = String(form.get("audience") ?? "marketplace");
  const loginPath = audience === "government" ? "/government/login" : "/login";
  if (isRateLimited(request, "login", email || "blank", 10, 15 * 60 * 1000)) {
    return NextResponse.redirect(requestUrl(request, `${loginPath}?error=invalid`), { status: 303 });
  }
  const user = email ? await getUserByEmail(email) : null;

  if (!user || user.status === "banned" || !verifyPassword(password, user.password_hash)) {
    return NextResponse.redirect(requestUrl(request, `${loginPath}?error=invalid`), { status: 303 });
  }

  if (audience === "government" && !canAccessInstitutionWorkspace(user.role)) {
    return NextResponse.redirect(requestUrl(request, "/government/login?error=access"), { status: 303 });
  }

  const safeReturnTo = safeLocalReturnPath(returnTo, audience === "government" ? "/government" : undefined);
  const destination = safeReturnTo
    ? safeReturnTo
    : audience === "government" || user.role === "institutional"
      ? "/government"
      : `/?role=${user.role}&view=${user.role === "operator" ? "inventory" : "portal"}`;
  const response = NextResponse.redirect(requestUrl(request, destination), { status: 303 });
  await setSessionCookie(response, user.id);
  return response;
}
