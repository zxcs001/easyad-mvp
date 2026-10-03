import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), schemaQuery: vi.fn(async () => ({ rows: [] })) }));
vi.mock("pg", () => ({ Pool: class {
  query = mocks.schemaQuery;
  async connect() { return { query: mocks.query, release: mocks.release }; }
} }));
import { updateBookingRecord } from "../app/lib/db";

const row = { id: "BK-CANCEL", inventory_id: "INV-CANCEL", advertiser: "Owner", campaign: "Draft", start_date: "2099-01-01", end_date: "2099-01-02", ad_slots: 1, creative_status: "not submitted", status: "pending approval", spend: 100, paid: false, pop: 0 };
let current = row;
beforeEach(() => {
  vi.clearAllMocks(); current = { ...row };
  mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("SELECT * FROM bookings") ? [current] : [] }));
});

test("cancellation archives the compatibility campaign and cancels its placement in the same transaction", async () => {
  expect((await updateBookingRecord(row.id, { status: "cancelled" }))?.status).toBe("cancelled");
  expect(mocks.query).toHaveBeenCalledWith("SELECT * FROM bookings WHERE id=$1 FOR UPDATE", [row.id]);
  const calls = mocks.query.mock.calls as [string, unknown[]][];
  expect(calls.find(([sql]) => sql.startsWith("UPDATE campaigns SET"))?.[1][3]).toBe("archived");
  expect(calls.find(([sql]) => sql.startsWith("UPDATE placements SET inventory_id"))?.[1][3]).toBe("cancelled");
  expect(calls.at(-1)?.[0]).toBe("COMMIT");
});

test("rechecks approval and payment under the row lock before cancelling", async () => {
  for (const changed of [{ status: "approved" }, { paid: true }]) {
    current = { ...row, ...changed };
    await expect(updateBookingRecord(row.id, { status: "cancelled" })).rejects.toThrow("Only unpaid pending campaigns can be cancelled.");
  }
  expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE bookings"))).toBe(false);
});

test("a concurrent creative or approval request cannot revive a cancelled campaign", async () => {
  current = { ...row, status: "cancelled" };
  await expect(updateBookingRecord(row.id, { status: "creative review" })).rejects.toThrow("Cancelled campaigns cannot be changed.");
  expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  expect(mocks.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE bookings"))).toBe(false);
});
