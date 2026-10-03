import { NextRequest } from "next/server";
import { getCurrentUser } from "../../../../lib/auth";
import { createPairingCode, PlayerError, playersEnabled, playerStatus, revokePlayer } from "../../../../lib/players";
import { playerBody, playerFailure, playerResponse, requirePlayerControl } from "../../../../lib/player-http";

type Context = { params: Promise<{ id: string }> };
async function owner() {
  const user = await getCurrentUser();
  if (!user) throw new PlayerError(401, "Sign in to manage this screen.");
  return user;
}
export async function GET(_request: NextRequest, context: Context) {
  try {
    const user = await owner();
    if (!playersEnabled()) return playerResponse({ enabled: false, player: null });
    return playerResponse(await playerStatus(user, (await context.params).id));
  } catch (error) { return playerFailure(error); }
}
export async function POST(_request: NextRequest, context: Context) {
  try {
    requirePlayerControl();
    return playerResponse(await createPairingCode(await owner(), (await context.params).id), 201);
  } catch (error) { return playerFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try {
    requirePlayerControl();
    return playerResponse(await revokePlayer(await owner(), (await context.params).id, (await playerBody(request)).playerId));
  } catch (error) { return playerFailure(error); }
}
