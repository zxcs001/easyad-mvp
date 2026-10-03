import { NextRequest, NextResponse } from "next/server";
import { fetchPlayerManifest, playerTiming } from "../../../lib/players";
import { playerFailure, playerResponse, playerToken, requirePlayerControl } from "../../../lib/player-http";

export async function GET(request: NextRequest) {
  try {
    requirePlayerControl();
    const manifest = await fetchPlayerManifest(playerToken(request));
    const etag = `"${manifest.playerId}:${manifest.revision}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-store" };
    if (request.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers });
    const response = playerResponse({ manifest, timing: playerTiming() });
    response.headers.set("ETag", etag);
    return response;
  } catch (error) { return playerFailure(error); }
}
