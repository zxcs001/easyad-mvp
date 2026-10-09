import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPublishedInventory: vi.fn(), listInventoryCommitments: vi.fn() }));
vi.mock("../app/lib/db", () => mocks);

import { GET } from "../app/api/inventory/[id]/availability/route";

const screen = { id: "INV-CAL", format: "digital", deliveryMode: "digital", advertisingOptIn: true, imageInterval: 6, maxLoopSeconds: 60, reservedSeconds: 12, availableFrom: "2026-01-01", availableTo: "2026-12-31" };
const call = (id = "INV-CAL") => GET(new NextRequest(`http://localhost/api/inventory/${id}/availability`, { headers: { "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` } }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublishedInventory.mockResolvedValue(screen);
  mocks.listInventoryCommitments.mockResolvedValue([{ start: "2026-07-01", end: "2026-07-05", seconds: 6, dayparts: ["morning"] }]);
});

test("the calendar receives confirmed loop time after the owner's reserve, with no advertiser details", async () => {
  const response = await call();
  const body = await response.json();

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(body).toMatchObject({ inventoryId: "INV-CAL", deliveryMode: "digital", timeZone: "America/Toronto", loopSeconds: 60, capacitySeconds: 48 });
  expect(body.commitments).toEqual([{ start: "2026-07-01", end: "2026-07-05", seconds: 6, dayparts: ["morning"] }]);
});

test("a screen that is not open to advertising has no booking calendar", async () => {
  mocks.getPublishedInventory.mockResolvedValue({ ...screen, advertisingOptIn: false });
  expect((await call()).status).toBe(404);
  mocks.getPublishedInventory.mockResolvedValue(null);
  expect((await call()).status).toBe(404);
  expect(mocks.listInventoryCommitments).not.toHaveBeenCalled();
});

test("a billboard returns its sale window and no loop commitments", async () => {
  mocks.getPublishedInventory.mockResolvedValue({ ...screen, format: "static", deliveryMode: "static" });
  const body = await (await call()).json();
  expect(body).toMatchObject({ deliveryMode: "static", availableFrom: "2026-01-01", availableTo: "2026-12-31", commitments: [] });
  expect(mocks.listInventoryCommitments).not.toHaveBeenCalled();
});
