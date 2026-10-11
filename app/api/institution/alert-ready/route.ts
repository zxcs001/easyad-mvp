import { NextRequest, NextResponse } from "next/server";
import { alertReadySnapshot, RelayError, setAlertReadyMode, type AlertReadyMode } from "../../../lib/alert-ready/relay";
import { institutionScope } from "../../../lib/alert-ready/scope";

// Settings and recent official alerts for one institution. Super Admin names
// the institution with ?institutionId=.
export async function GET(request: NextRequest) {
  const scope = await institutionScope(request.nextUrl.searchParams.get("institutionId"));
  if ("error" in scope) return scope.error;
  return NextResponse.json(await alertReadySnapshot(scope.institutionId), { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const scope = await institutionScope(typeof body.institutionId === "string" ? body.institutionId : null);
  if ("error" in scope) return scope.error;
  try {
    const mode = await setAlertReadyMode(scope.institutionId, body.mode as AlertReadyMode, scope.actorId);
    return NextResponse.json({ mode });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
