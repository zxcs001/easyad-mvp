import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, requestUrl } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const returnTo = String(form.get("returnTo") ?? "");
  const destination = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  const response = NextResponse.redirect(requestUrl(request, destination), { status: 303 });
  await clearSessionCookie(request, response);
  return response;
}
