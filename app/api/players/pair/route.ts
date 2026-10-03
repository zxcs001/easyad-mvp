import { NextRequest } from "next/server";
import { playerCookie, redeemPairingCode } from "../../../lib/players";
import { playerBody, playerFailure, playerResponse, requirePlayerControl } from "../../../lib/player-http";

export async function POST(request: NextRequest) {
  try {
    requirePlayerControl();
    const body = await playerBody(request);
    const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const paired = await redeemPairingCode(body.code, client);
    const response = playerResponse({ playerId: paired.playerId });
    response.cookies.set(playerCookie, paired.token, {
      httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
      path: "/api/player", maxAge: 60 * 60 * 24 * 365, priority: "high",
    });
    return response;
  } catch (error) { return playerFailure(error); }
}
