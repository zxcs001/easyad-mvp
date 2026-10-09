import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { responseSummaries, ResponseLinkError, saveResponseLink, setPromoRedemptions } from "../../../../lib/responses";
import { responseAccess } from "../../../../lib/responses-access";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const access = await responseAccess(await getCurrentUser(), id);
  if (!access) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const [summary] = await responseSummaries([id]);
  return NextResponse.json({ response: summary ?? null, canEdit: access.canEdit });
}

// The advertiser sets where the QR code and short link go, the promo code on
// the ad, and how many times customers used that code.
export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const user = await getCurrentUser();
  const access = await responseAccess(user, id);
  if (!access || !user) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (!access.canEdit) return NextResponse.json({ error: "Only the advertiser can change response tracking" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  try {
    if (body.destinationUrl !== undefined) await saveResponseLink(id, user.id, { destinationUrl: body.destinationUrl, promoCode: body.promoCode ?? "" });
    if (body.promoRedemptions !== undefined) await setPromoRedemptions(id, body.promoRedemptions);
  } catch (error) {
    if (error instanceof ResponseLinkError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const [summary] = await responseSummaries([id]);
  return NextResponse.json({ response: summary ?? null, canEdit: true });
}
