import { NextRequest, NextResponse } from "next/server";
import { PlayerError, playerCookie, playersEnabled } from "./players";
export function requirePlayerControl() {
    if (!playersEnabled())
        throw new PlayerError(404, "Player control is not enabled.");
}
export function playerToken(request: NextRequest) {
    // A website login or a public media request never grants player authority.
    return request.cookies.get(playerCookie)?.value ?? "";
}
export async function playerBody(request: NextRequest): Promise<Record<string, unknown>> {
    if (Number(request.headers.get("content-length")) > 4096)
        throw new PlayerError(413, "Request is too large.");
    const reader = request.body?.getReader();
    let text = "", size = 0;
    const decoder = new TextDecoder();
    if (reader) {
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done)
                    break;
                size += chunk.value.byteLength;
                if (size > 4096)
                    throw new PlayerError(413, "Request is too large.");
                text += decoder.decode(chunk.value, { stream: true });
            }
            text += decoder.decode();
        }
        finally {
            await reader.cancel();
        }
    }
    try {
        const body: unknown = JSON.parse(text);
        if (!body || typeof body !== "object" || Array.isArray(body))
            throw new Error();
        return body as Record<string, unknown>;
    }
    catch {
        throw new PlayerError(422, "Enter valid player details.");
    }
}
export function playerResponse(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function playerFailure(error: unknown) {
    return playerResponse({ error: error instanceof PlayerError ? error.message : "Player service is unavailable. Try again." }, error instanceof PlayerError ? error.status : 500);
}
