import { NextRequest } from "next/server";
import { playerAsset } from "../../../../lib/players";
import { playerFailure, playerToken, requirePlayerControl } from "../../../../lib/player-http";
import { readStoredMedia } from "../../../../lib/media-storage";
export async function GET(request: NextRequest, context: {
    params: Promise<{
        id: string;
    }>;
}) {
    try {
        requirePlayerControl();
        const asset = await playerAsset(playerToken(request), (await context.params).id);
        const media = await readStoredMedia(asset.storage_path);
        return new Response(new Uint8Array(media.bytes), { headers: { "Content-Type": asset.mime_type, "Content-Length": String(media.bytes.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    catch (error) {
        return playerFailure(error);
    }
}
