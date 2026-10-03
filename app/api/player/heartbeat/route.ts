import { NextRequest } from "next/server";
import { heartbeatPlayer } from "../../../lib/players";
import { playerBody, playerFailure, playerResponse, playerToken, requirePlayerControl } from "../../../lib/player-http";

export async function POST(request: NextRequest) {
  try {
    requirePlayerControl();
    return playerResponse(await heartbeatPlayer(playerToken(request), await playerBody(request)));
  } catch (error) { return playerFailure(error); }
}
