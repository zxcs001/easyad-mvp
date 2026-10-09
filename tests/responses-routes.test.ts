import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ followResponseLink: vi.fn(), user: null as null | { id: string; role: string }, booking: { id: "BK-1", inventoryId: "INV-1", spend: 100 }, ownerId: "USR-OWNER", inventory: { id: "INV-1", institutionId: "INST-1" } }));
vi.mock("../app/lib/responses", async (original) => ({ ...(await original<typeof import("../app/lib/responses")>()), followResponseLink: mocks.followResponseLink, responseSummaries: vi.fn(async () => []), saveResponseLink: vi.fn(async () => "ABCDEFGH") }));
vi.mock("../app/lib/auth", async (original) => ({ ...(await original<typeof import("../app/lib/auth")>()), getCurrentUser: async () => mocks.user }));
vi.mock("../app/lib/db", () => ({ getBooking: async () => mocks.booking, getBookingOwnerId: async () => mocks.ownerId, getInventory: async () => mocks.inventory }));

import { GET as follow } from "../app/go/[code]/route";
import { PUT } from "../app/api/bookings/[id]/responses/route";
import { isAutomatedRequest } from "../app/lib/responses";

beforeEach(() => { mocks.followResponseLink.mockReset(); });

test("a scan redirects to the advertiser's page and counts only a person's GET", async () => {
  mocks.followResponseLink.mockResolvedValue("https://northline.ca/offer");
  const phone = await follow(new NextRequest("http://localhost/go/abcdefgh", { headers: { "user-agent": "Mozilla/5.0 (iPhone)" } }), { params: Promise.resolve({ code: "abcdefgh" }) });
  expect(phone.status).toBe(302);
  expect(phone.headers.get("location")).toBe("https://northline.ca/offer");
  expect(mocks.followResponseLink).toHaveBeenLastCalledWith("ABCDEFGH", true);
  await follow(new NextRequest("http://localhost/go/ABCDEFGH", { headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } }), { params: Promise.resolve({ code: "ABCDEFGH" }) });
  expect(mocks.followResponseLink).toHaveBeenLastCalledWith("ABCDEFGH", false);
  expect(isAutomatedRequest("HEAD", "Mozilla/5.0")).toBe(true);
  expect(isAutomatedRequest("GET", null)).toBe(true);
  mocks.followResponseLink.mockResolvedValue(null);
  expect((await follow(new NextRequest("http://localhost/go/XXXX"), { params: Promise.resolve({ code: "XXXX" }) })).status).toBe(404);
});

test("only the advertiser who owns the booking changes its link; the screen owner can only read", async () => {
  const put = () => PUT(new NextRequest("http://localhost/api/bookings/BK-1/responses", { method: "PUT", body: JSON.stringify({ destinationUrl: "northline.ca" }) }), { params: Promise.resolve({ id: "BK-1" }) });
  mocks.user = { id: "USR-OWNER", role: "advertiser" };
  expect((await put()).status).toBe(200);
  mocks.user = { id: "USR-OTHER", role: "advertiser" };
  expect((await put()).status).toBe(404);
  mocks.user = { id: "INST-1", role: "institutional" };
  expect((await put()).status).toBe(403);
  mocks.user = null;
  expect((await put()).status).toBe(404);
});
