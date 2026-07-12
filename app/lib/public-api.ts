import { NextRequest, NextResponse } from "next/server";
import { requestUrl } from "./auth";

export function absoluteRequestUrl(request: NextRequest, path: string) {
  return requestUrl(request, path).href;
}

export function publicApiJson(body: unknown, init: { status?: number; cacheControl?: string } = {}) {
  return NextResponse.json(body, {
    status: init.status,
    headers: publicApiHeaders(init.cacheControl),
  });
}

export function publicApiOptions() {
  return new NextResponse(null, { status: 204, headers: publicApiHeaders("public, max-age=86400") });
}

export function publicApiHeaders(cacheControl = "public, max-age=30, stale-while-revalidate=60") {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Content-Type",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
  };
}
