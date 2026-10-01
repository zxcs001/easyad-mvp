import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { afterEach, test, vi } from "vitest";

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "USR-ADMIN", role: "admin" }),
  canManageInventory: () => true,
  canManageInventoryRecord: () => true,
}));

vi.mock("../app/lib/db", () => ({
  getBooking: vi.fn(),
  getInventory: vi.fn(),
  getTransactionByBooking: vi.fn(),
  updateBookingRecord: vi.fn(),
  upsertTransaction: vi.fn(),
}));

import { POST } from "../app/api/bookings/[id]/payment/route";
import { getBooking, upsertTransaction } from "../app/lib/db";
import type { Booking } from "../app/data";

afterEach(() => {
  delete process.env.FEATURE_PAYMENTS;
});

test("payment endpoint is unavailable when its flag is absent", async () => {
  delete process.env.FEATURE_PAYMENTS;
  const response = await POST(
    new NextRequest("http://localhost/api/bookings/BK-1/payment", { method: "POST", body: "{}" }),
    { params: Promise.resolve({ id: "BK-1" }) },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Payment collection is not available" });
});

test("cancelled campaigns cannot be charged even with demo payments enabled", async () => {
  process.env.FEATURE_PAYMENTS = "true";
  vi.mocked(getBooking).mockResolvedValueOnce({ id: "BK-1", status: "cancelled" } as Booking);
  const response = await POST(new NextRequest("http://localhost/api/bookings/BK-1/payment", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "BK-1" }) });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Cancelled campaigns cannot be charged." });
  assert.equal(vi.mocked(upsertTransaction).mock.calls.length, 0);
});
