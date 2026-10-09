import { once } from "node:events";
import { createServer, type Server } from "node:net";
import { createRequire } from "node:module";
import { afterEach, expect, test, vi } from "vitest";
import { capXml, heartbeatXml } from "./helpers/cap-fixtures";

const require = createRequire(import.meta.url);
const listener = require("../scripts/naad-listener.cjs") as {
  extractMessages: (buffer: string) => { messages: string[]; rest: string };
  archiveUrl: (site: string, reference: { sender: string; identifier: string; sent: string }) => string;
  createListener: (options: Record<string, unknown>) => { start(): void; stop(): void };
};

let server: Server | null = null;
afterEach(() => { server?.close(); server = null; });

test("the stream splits into whole CAP messages, even across chunks", () => {
  const one = capXml({ identifier: "urn:oid:A" });
  const two = capXml({ identifier: "urn:oid:B" });
  const stream = `${one}\n${two}`;
  const first = listener.extractMessages(stream.slice(0, one.length + 40));
  expect(first.messages).toEqual([one]);
  const second = listener.extractMessages(first.rest + stream.slice(one.length + 40));
  expect(second.messages).toEqual([two]);
  expect(second.rest).toBe("");
});

test("a missed alert's archive address follows the LMD guide's encoding", () => {
  expect(listener.archiveUrl("capcp1.naad-adna.pelmorex.com", { sender: "s", identifier: "urn:oid:2.49.0.1.124.1234.2026", sent: "2026-10-09T18:00:00-04:00" }))
    .toBe("http://capcp1.naad-adna.pelmorex.com/2026-10-09/2026_10_09T18_00_00_04_00Iurn_oid_2.49.0.1.124.1234.2026.xml");
  expect(listener.archiveUrl("capcp2", { sender: "s", identifier: "x", sent: "2026-10-09T18:00:00+00:00" })).toContain("/2026-10-09/2026_10_09T18_00_00p00_00Ix.xml");
});

test("the listener posts each alert once from two streams and recovers alerts a heartbeat names", async () => {
  const alert = capXml({ identifier: "urn:oid:LIVE" });
  const missed = capXml({ identifier: "urn:oid:MISSED", sent: "2026-10-09T18:05:00-00:00" });
  server = createServer((socket) => { socket.on("error", () => undefined); socket.write(alert.slice(0, 200)); setTimeout(() => socket.write(alert.slice(200) + heartbeatXml(["cap-pac@canada.ca,urn:oid:MISSED,2026-10-09T18:05:00-00:00"])), 20); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const posted: string[] = [];
  const fetchImpl = vi.fn(async (url: string, init?: { body?: string; headers?: Record<string, string> }) => {
    if (url.startsWith("http://archive")) return new Response(missed, { status: 200 });
    expect(init?.headers?.authorization).toBe(`Bearer ${"k".repeat(32)}`);
    posted.push(init?.body ?? "");
    const isHeartbeat = (init?.body ?? "").includes("NAADS-Heartbeat");
    return Response.json(isHeartbeat ? { kind: "heartbeat", missing: [{ sender: "cap-pac@canada.ca", identifier: "urn:oid:MISSED", sent: "2026-10-09T18:05:00-00:00" }] } : { kind: "alert", matchedScreens: 1, shownAlertIds: [], endedAlertIds: [] });
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const instance = listener.createListener({ ingestUrl: "http://app/ingest", token: "k".repeat(32), streams: [{ host: "127.0.0.1", port }, { host: "127.0.0.1", port }], archives: ["archive"], fetchImpl });
  instance.start();
  await vi.waitFor(() => expect(posted.filter((body) => body.includes("urn:oid:MISSED") && !body.includes("Heartbeat"))).toHaveLength(1), { timeout: 3000 });
  instance.stop();
  log.mockRestore();
  expect(posted.filter((body) => body.includes("urn:oid:LIVE"))).toHaveLength(1);
});
