import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ ingestCapMessage: vi.fn(async () => ({ kind: "duplicate", key: "k" })) }));
vi.mock("../app/lib/alert-ready/relay", async (original) => ({ ...(await original<typeof import("../app/lib/alert-ready/relay")>()), ingestCapMessage: mocks.ingestCapMessage }));

import { POST } from "../app/api/alert-ready/ingest/route";
import { proxy } from "../proxy";
import { capXml } from "./helpers/cap-fixtures";

const token = "t".repeat(40);
const request = (authorization?: string, body = capXml()) => new NextRequest("http://localhost/api/alert-ready/ingest", { method: "POST", body, headers: { "content-type": "application/xml", ...(authorization ? { authorization } : {}), "x-received-via": "stream:test" } });

beforeEach(() => { vi.stubEnv("FEATURE_ALERT_READY", "true"); vi.stubEnv("ALERT_READY_INGEST_TOKEN", token); mocks.ingestCapMessage.mockClear(); });
afterEach(() => vi.unstubAllEnvs());

test("the ingest route needs the flag, a configured token and the right bearer token", async () => {
  expect((await POST(request(`Bearer ${token}`))).status).toBe(200);
  expect(mocks.ingestCapMessage).toHaveBeenCalledWith(capXml(), "stream:test");
  expect((await POST(request(`Bearer ${"x".repeat(40)}`))).status).toBe(401);
  expect((await POST(request())).status).toBe(401);
  vi.stubEnv("ALERT_READY_INGEST_TOKEN", "short");
  expect((await POST(request("Bearer short"))).status).toBe(503);
  vi.stubEnv("FEATURE_ALERT_READY", "false");
  expect((await POST(request(`Bearer ${token}`))).status).toBe(404);
});

test("a malformed CAP message is refused with 422", async () => {
  mocks.ingestCapMessage.mockImplementationOnce(async () => { const { CapError } = await import("../app/lib/alert-ready/cap"); throw new CapError("Not a CAP alert."); });
  const response = await POST(request(`Bearer ${token}`, "<nope/>"));
  expect(response.status).toBe(422);
});

test("the proxy lets the token-checked ingest route through without a browser Origin, and nothing else", () => {
  const ingest = proxy(new NextRequest("http://localhost/api/alert-ready/ingest", { method: "POST" }));
  expect(ingest.status).not.toBe(403);
  const other = proxy(new NextRequest("http://localhost/api/institution/alert-ready", { method: "PUT" }));
  expect(other.status).toBe(403);
});
