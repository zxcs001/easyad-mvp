import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../../lib/auth";
import { queuePlayerRecovery, PlayerError } from "../../../../../lib/players";
import { playerBody, playerFailure, playerResponse, requirePlayerControl } from "../../../../../lib/player-http";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    requirePlayerControl();
    const user = await getCurrentUser();
    if (!user) throw new PlayerError(401, "Sign in to manage this screen.");
    return playerResponse(await queuePlayerRecovery(user, (await context.params).id, await playerBody(request)), 202);
  } catch(error) { return playerFailure(error); }
}
