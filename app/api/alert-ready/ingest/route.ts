import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { CapError, MAX_CAP_BYTES } from "../../../lib/alert-ready/cap";
import { alertReadyEnabled, ingestCapMessage } from "../../../lib/alert-ready/relay";

// Machine endpoint for scripts/naad-listener.cjs. It takes one raw CAP-CP
// message per request. The bearer token is the only credential, so it must be
// long and random; the proxy exempts this path from the browser Origin check.
export async function POST(request: NextRequest) {
  if (!alertReadyEnabled()) return NextResponse.json({ error: "Alert Ready relay is switched off." }, { status: 404 });
  const expected = process.env.ALERT_READY_INGEST_TOKEN ?? "";
  if (expected.length < 32) return NextResponse.json({ error: "ALERT_READY_INGEST_TOKEN is not configured." }, { status: 503 });
  const supplied = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!sameSecret(supplied, expected)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_CAP_BYTES) return NextResponse.json({ error: "CAP message is too large." }, { status: 413 });
  const xml = await request.text();
  try {
    const result = await ingestCapMessage(xml, request.headers.get("x-received-via") ?? "unknown");
    return NextResponse.json(result, { status: result.kind === "alert" ? 201 : 200 });
  } catch (error) {
    if (error instanceof CapError) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

function sameSecret(supplied: string, expected: string) {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
