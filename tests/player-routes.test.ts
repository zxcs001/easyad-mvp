import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ pair: vi.fn(), fetch: vi.fn(), acknowledge: vi.fn() }));
vi.mock("../app/lib/players", async (original) => ({ ...await original<typeof import("../app/lib/players")>(), redeemPairingCode: mocks.pair, fetchPlayerManifest: mocks.fetch, acknowledgePlayer: mocks.acknowledge }));
import { POST as pair } from "../app/api/players/pair/route";
import { GET as manifest } from "../app/api/player/manifest/route";
import { POST as ack } from "../app/api/player/acknowledgments/route";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("FEATURE_PLAYER_CONTROL", "true"); });
test("pairing returns only the player ID and sets a scoped HTTP-only credential", async () => {
  mocks.pair.mockResolvedValue({ token: "secret-device-token", playerId: "P1" });
  const response = await pair(new NextRequest("http://localhost/api/players/pair", { method: "POST", body: JSON.stringify({ code: "123456789ABC" }) }));
  expect(await response.json()).toEqual({ playerId: "P1" });
  expect(response.cookies.get("easyad_player")).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/api/player" });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});
test("disabled player routes cannot create pairing or delivery authority", async () => {
  vi.stubEnv("FEATURE_PLAYER_CONTROL", "false");
  expect((await pair(new NextRequest("http://localhost/api/players/pair", { method: "POST", body: "{}" }))).status).toBe(404);
  expect((await manifest(new NextRequest("http://localhost/api/player/manifest"))).status).toBe(404);
  expect(mocks.pair).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});
test("conditional manifests authenticate before returning 304", async () => {
  mocks.fetch.mockResolvedValue({ playerId: "P1", revision: 4 });
  const response = await manifest(new NextRequest("http://localhost/api/player/manifest", { headers: { cookie: "easyad_player=token", "if-none-match": '"P1:4"' } }));
  expect(mocks.fetch).toHaveBeenCalledWith("token"); expect(response.status).toBe(304); expect(await response.text()).toBe("");
});
test("website login alone does not grant player authority and malformed bodies fail", async () => {
  mocks.acknowledge.mockResolvedValue({ accepted: true });
  await ack(new NextRequest("http://localhost/api/player/acknowledgments", { method: "POST", headers: { cookie: "ooh_session=account" }, body: '{"revision":1,"stage":"applied"}' }));
  expect(mocks.acknowledge).toHaveBeenCalledWith("", { revision: 1, stage: "applied" });
  expect((await ack(new NextRequest("http://localhost/api/player/acknowledgments", { method: "POST", body: "[]" }))).status).toBe(422);
});
