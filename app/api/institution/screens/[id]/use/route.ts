import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { ScreenUseError, setScreenUse } from "../../../../../lib/screen-use";

type RouteContext = { params: Promise<{ id: string }> };

// Owner choice per screen: reserved for institution use, or open to
// private-sector advertising. Available without FEATURE_FLEET_OPERATIONS.
export async function PUT(request: NextRequest, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "institutional" && user.role !== "admin") return NextResponse.json({ error: "Only the owning institution can change screen use" }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    const result = await setScreenUse(user, id, body?.use, body?.version);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ScreenUseError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Screen use could not be changed" }, { status: 500 });
  }
}
