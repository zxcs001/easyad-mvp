import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";

const state = vi.hoisted(() => ({
  updateInventoryRecord: vi.fn(),
}));

const staticBillboard: InventoryItem = {
  id: "INV-STATIC-OWNER",
  name: "Owner Billboard",
  operator: "Billboard Owner",
  format: "static",
  deliveryMode: "static",
  x: 50,
  y: 50,
  address: "1 Owner Way",
  price: 500,
  impressions: 100000,
  traffic: 80000,
  income: 90000,
  audience: "Commuters",
  competitor: "Low",
  occupancy: 0,
  imageInterval: 6,
  maxLoopSeconds: 120,
  availableFrom: "2026-08-01",
  availableTo: "2026-08-31",
};

vi.mock("../app/lib/auth", () => ({
  canManageInventory: () => true,
  canManageInventoryRecord: () => true,
  canPublishInventoryRecord: () => false,
  getCurrentUser: async () => ({ id: "USR-OWNER", name: "Billboard Owner", role: "operator" }),
}));

vi.mock("../app/lib/db", () => ({
  deleteInventoryRecord: vi.fn(),
  getInventory: async () => staticBillboard,
  updateInventoryRecord: state.updateInventoryRecord,
}));

import { PATCH } from "../app/api/inventory/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  state.updateInventoryRecord.mockImplementation(async (_id: string, updates: Partial<InventoryItem>) => ({ ...staticBillboard, ...updates }));
});

test("the billboard owner can change availability through the date window", async () => {
  const response = await PATCH(patchRequest({ availableFrom: "2026-09-01", availableTo: "2026-09-30" }), {
    params: Promise.resolve({ id: staticBillboard.id }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.item.availableFrom, "2026-09-01");
  assert.equal(body.item.availableTo, "2026-09-30");
  assert.deepEqual(state.updateInventoryRecord.mock.calls[0]?.[1], { availableFrom: "2026-09-01", availableTo: "2026-09-30" });
});

test("a reversed availability window is rejected before saving", async () => {
  const response = await PATCH(patchRequest({ availableFrom: "2026-09-30", availableTo: "2026-09-01" }), {
    params: Promise.resolve({ id: staticBillboard.id }),
  });

  assert.equal(response.status, 400);
  assert.equal(state.updateInventoryRecord.mock.calls.length, 0);
});

function patchRequest(body: Partial<InventoryItem>) {
  return new NextRequest(`http://localhost/api/inventory/${staticBillboard.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
