import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import { ScheduleError } from "../app/lib/digital-schedule";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), canSubmitCreative: vi.fn(), getBooking: vi.fn(), getBookingOwnerId: vi.fn(), updateBookingRecord: vi.fn() }));
vi.mock("../app/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser, canSubmitCreative: mocks.canSubmitCreative }));
vi.mock("../app/lib/db", () => ({ getBooking: mocks.getBooking, getBookingOwnerId: mocks.getBookingOwnerId, updateBookingRecord: mocks.updateBookingRecord }));
import { POST } from "../app/api/bookings/[id]/cancel/route";

const booking = { id: "BK-CANCEL", status: "pending approval", paid: false };
const request = () => new NextRequest("http://localhost/api/bookings/BK-CANCEL/cancel", { method: "POST" });
const context = { params: Promise.resolve({ id: booking.id }) };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getCurrentUser.mockResolvedValue({ id: "USR-OWNER", role: "advertiser" });
  mocks.canSubmitCreative.mockReturnValue(true);
  mocks.getBooking.mockResolvedValue(booking);
  mocks.getBookingOwnerId.mockResolvedValue("USR-OWNER");
  mocks.updateBookingRecord.mockResolvedValue({ ...booking, status: "cancelled" });
});

test("cancels the owner's pending campaign without deleting its record", async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect((await response.json()).booking.status).toBe("cancelled");
  expect(mocks.canSubmitCreative).toHaveBeenCalledWith({ id: "USR-OWNER", role: "advertiser" }, "USR-OWNER");
  expect(mocks.updateBookingRecord).toHaveBeenCalledWith(booking.id, { status: "cancelled" });
});

test("requires a signed-in owner", async () => {
  mocks.getCurrentUser.mockResolvedValueOnce(null);
  expect((await POST(request(), context)).status).toBe(401);
  mocks.canSubmitCreative.mockReturnValueOnce(false);
  expect((await POST(request(), context)).status).toBe(403);
  expect(mocks.updateBookingRecord).not.toHaveBeenCalled();
});

test.each(["approved", "scheduled", "live", "completed", "rejected"])("does not cancel a %s campaign", async (status) => {
  mocks.getBooking.mockResolvedValue({ ...booking, status });
  expect((await POST(request(), context)).status).toBe(409);
  expect(mocks.updateBookingRecord).not.toHaveBeenCalled();
});

test("does not cancel a paid campaign", async () => {
  mocks.getBooking.mockResolvedValue({ ...booking, paid: true });
  expect((await POST(request(), context)).status).toBe(409);
  expect(mocks.updateBookingRecord).not.toHaveBeenCalled();
});

test("repeated cancellation is idempotent", async () => {
  mocks.getBooking.mockResolvedValue({ ...booking, status: "cancelled" });
  expect((await POST(request(), context)).status).toBe(200);
  expect(mocks.updateBookingRecord).not.toHaveBeenCalled();
});

test("reports approval races caught by the database lock", async () => {
  mocks.updateBookingRecord.mockRejectedValueOnce(new ScheduleError("Only unpaid pending campaigns can be cancelled."));
  const response = await POST(request(), context);
  expect(response.status).toBe(409);
  expect((await response.json()).error).toBe("Only unpaid pending campaigns can be cancelled.");
});

test("does not expose database internals when cancellation fails", async () => {
  mocks.updateBookingRecord.mockRejectedValueOnce(new Error("database password or internal hostname"));
  const response = await POST(request(), context);
  expect(response.status).toBe(500);
  expect((await response.json()).error).toBe("Could not cancel this campaign. Your campaign is still here; please retry.");
});
