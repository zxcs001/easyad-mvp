import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "../../../lib/auth";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  await clearSessionCookie(request, response);
  return response;
}
