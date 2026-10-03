import { NextRequest } from "next/server";
import { ingestPlayback } from "../../../lib/players";
import { playerBody, playerFailure, playerResponse, playerToken, requirePlayerControl } from "../../../lib/player-http";
export async function POST(request: NextRequest) {
    try {
        requirePlayerControl();
        return playerResponse(await ingestPlayback(playerToken(request), await playerBody(request)));
    }
    catch (error) {
        return playerFailure(error);
    }
}
