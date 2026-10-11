import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { responseQrSvg, responseSummaries } from "../../../../../lib/responses";
import { responseAccess } from "../../../../../lib/responses-access";

type RouteContext = { params: Promise<{ id: string }> };

// The QR code as an SVG file, to place in uploaded artwork or print material.
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const access = await responseAccess(await getCurrentUser(), id);
  if (!access) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const [summary] = await responseSummaries([id]);
  if (!summary) return NextResponse.json({ error: "Set up a link first" }, { status: 404 });
  return new NextResponse(await responseQrSvg(summary.shortUrl), { headers: {
    "Content-Type": "image/svg+xml",
    "Content-Disposition": `attachment; filename="qr-${summary.code}.svg"`,
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
  } });
}
