import { NextRequest, NextResponse } from "next/server";
import { countUsers, createUser, getUserByEmail } from "../../../lib/db";
import { requestUrl, setSessionCookie } from "../../../lib/auth";
import { constantTimeEquals, hashPassword, isAcceptablePassword } from "../../../lib/password";
import { isRateLimited } from "../../../lib/rate-limit";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const hasUsers = await countUsers() > 0;
  const bootstrapToken = String(form.get("bootstrapToken") ?? "");
  if (isRateLimited(request, "signup", email || "blank", 5, 60 * 60 * 1000)) {
    return NextResponse.redirect(requestUrl(request, "/signup?error=invalid"), { status: 303 });
  }
  const configuredBootstrapToken = process.env.BOOTSTRAP_ADMIN_TOKEN;
  if (!hasUsers && (!configuredBootstrapToken || !constantTimeEquals(bootstrapToken, configuredBootstrapToken))) {
    return NextResponse.redirect(requestUrl(request, "/signup?error=setup"), { status: 303 });
  }
  const role = !hasUsers ? "admin" : "advertiser";

  if (!name || !email || !isAcceptablePassword(password)) {
    return NextResponse.redirect(requestUrl(request, "/signup?error=invalid"), { status: 303 });
  }

  if (await getUserByEmail(email)) {
    return NextResponse.redirect(requestUrl(request, "/signup?error=invalid"), { status: 303 });
  }

  const user = await createUser(name, email, hashPassword(password), role);
  const response = NextResponse.redirect(requestUrl(request, `/?role=${user.role}&view=${user.role === "operator" ? "inventory" : "portal"}`), { status: 303 });
  await setSessionCookie(response, user.id);
  return response;
}
