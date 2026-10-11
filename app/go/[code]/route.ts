import { NextRequest, NextResponse } from "next/server";
import { followResponseLink, isAutomatedRequest } from "../../lib/responses";

type RouteContext = { params: Promise<{ code: string }> };

// A QR code or short link on an ad. Counts one response (time only) and sends
// the person on. Link-preview bots and HEAD requests are redirected uncounted.
async function follow(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const destination = await followResponseLink(code.toUpperCase(), !isAutomatedRequest(request.method, request.headers.get("user-agent")));
  if (!destination) return new NextResponse("This link is not active.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.redirect(destination, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

export const GET = follow;
export const HEAD = follow;
