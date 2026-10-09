import { NextRequest, NextResponse } from "next/server";
import { RelayError, showOfficialAlert } from "../../../../lib/alert-ready/relay";
import { institutionScope } from "../../../../lib/alert-ready/scope";

// "Show on screens" for an institution that asks first.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const scope = await institutionScope(typeof body.institutionId === "string" ? body.institutionId : null);
  if ("error" in scope) return scope.error;
  if (typeof body.key !== "string" || !body.key) return NextResponse.json({ error: "Choose an alert." }, { status: 400 });
  try {
    const alertIds = await showOfficialAlert(body.key, scope.institutionId, scope.actorId);
    return NextResponse.json({ alertIds }, { status: 201 });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}
