import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, requestUrl } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(requestUrl(request, "/"), { status: 303 });
  await clearSessionCookie(request, response);
  return response;
}
