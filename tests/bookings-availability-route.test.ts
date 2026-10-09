import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";

const mocks = vi.hoisted(() => ({
  createBookingRecord: vi.fn(async (booking: unknown) => booking),
  createBookingWithCreativeRecord: vi.fn(async (booking: unknown, _userId: string, creative: unknown) => ({ booking, creative })),
  getInventory: vi.fn(),
  listBookings: vi.fn(async () => []),
  storeMedia: vi.fn(async () => "/tmp/booking-creative.png"),
  deleteStoredMedia: vi.fn(async (_storagePath: string) => undefined),
}));

vi.mock("../app/lib/auth", () => ({
  canBuyAds: () => true,
  getCurrentUser: async () => ({ id: "USR-ADVERTISER", name: "Advertiser", role: "advertiser" }),
  getInstitutionScope: () => null,
}));

vi.mock("../app/lib/db", () => ({
  createBookingRecord: mocks.createBookingRecord,
  createBookingWithCreativeRecord: mocks.createBookingWithCreativeRecord,
  getInventory: mocks.getInventory,
  listBookings: mocks.listBookings,
  listBookingsCreatedBy: vi.fn(),
  listBookingsForInstitution: vi.fn(),
}));

vi.mock("../app/lib/media-storage", () => ({
  storeMedia: mocks.storeMedia,
  deleteStoredMedia: mocks.deleteStoredMedia,
}));

import { POST } from "../app/api/bookings/route";

const staticBillboard: InventoryItem = {
  id: "INV-STATIC-BOOKING",
  name: "Physical Billboard",
  operator: "Billboard Owner",
  format: "static",
  deliveryMode: "static",
  x: 50,
  y: 50,
  address: "1 Billboard Way",
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

beforeEach(() => {
  // These availability fixtures must not expire as the CI calendar advances.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-01T12:00:00.000Z"));
  vi.clearAllMocks();
  mocks.getInventory.mockResolvedValue(staticBillboard);
  mocks.createBookingWithCreativeRecord.mockImplementation(async (booking: unknown, _userId: string, creative: unknown) => ({ booking, creative }));
  mocks.storeMedia.mockResolvedValue("/tmp/booking-creative.png");
});

afterEach(() => vi.useRealTimers());

test("static booking is rejected when its dates fall outside the owner-defined availability window", async () => {
  const response = await POST(bookingRequest("2026-08-20", "2026-09-01"));
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.error, "Physical billboard is unavailable for those dates");
  assert.equal(mocks.createBookingWithCreativeRecord.mock.calls.length, 0);
  assert.equal(mocks.listBookings.mock.calls.length, 0);
});

test("static booking inside the availability window does not use digital loop capacity", async () => {
  const response = await POST(bookingRequest("2026-08-10", "2026-08-20"));

  assert.equal(response.status, 201);
  assert.equal(mocks.createBookingWithCreativeRecord.mock.calls.length, 1);
  assert.equal(mocks.listBookings.mock.calls.length, 0);
  const created = mocks.createBookingWithCreativeRecord.mock.calls[0][2] as { originalName: string; status: string; source: string };
  assert.equal(created.originalName, "booking.png");
  assert.equal(created.status, "pending review");
  assert.equal(created.source, "upload");
  const booking = mocks.createBookingWithCreativeRecord.mock.calls[0][0] as { status: string; creativeStatus: string };
  assert.equal(booking.status, "creative review");
  assert.equal(booking.creativeStatus, "pending review");
});

test("booking submission without an image creates a date request for later creative", async () => {
  const response = await POST(bookingRequestWithoutCreative("2026-08-10", "2026-08-20"));
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(mocks.getInventory.mock.calls.length, 1);
  assert.equal(mocks.createBookingWithCreativeRecord.mock.calls.length, 0);
  assert.equal(mocks.createBookingRecord.mock.calls.length, 1);
  assert.equal(body.booking.status, "pending approval");
  assert.equal(body.booking.creativeStatus, "not submitted");
  assert.equal(body.creative, null);
});

test("stored booking image is removed when the atomic database commit fails", async () => {
  mocks.createBookingWithCreativeRecord.mockRejectedValueOnce(new Error("database unavailable"));

  await assert.rejects(() => POST(bookingRequest("2026-08-10", "2026-08-20")), /database unavailable/);

  assert.equal(mocks.deleteStoredMedia.mock.calls.length, 1);
  assert.equal(mocks.deleteStoredMedia.mock.calls[0][0], "/tmp/booking-creative.png");
});

test("digital booking accepts a signature-validated animated GIF", async () => {
  mocks.getInventory.mockResolvedValue({ ...staticBillboard, format: "digital", deliveryMode: "digital" });
  const gif = new File([Buffer.from("GIF89a", "ascii")], "animated.gif", { type: "image/gif" });

  const response = await POST(bookingRequest("2026-08-10", "2026-08-20", gif));

  assert.equal(response.status, 201);
  const creative = mocks.createBookingWithCreativeRecord.mock.calls[0][2] as { fileType: string; mimeType: string; originalName: string };
  assert.equal(creative.fileType, "gif");
  assert.equal(creative.mimeType, "image/gif");
  assert.equal(creative.originalName, "animated.gif");
});

test("animated GIF is rejected for physical billboard inventory", async () => {
  const gif = new File([Buffer.from("GIF89a", "ascii")], "animated.gif", { type: "image/gif" });

  const response = await POST(bookingRequest("2026-08-10", "2026-08-20", gif));

  assert.equal(response.status, 422);
  assert.equal(mocks.storeMedia.mock.calls.length, 0);
  assert.equal(mocks.createBookingWithCreativeRecord.mock.calls.length, 0);
});

test("booking dates in the past are rejected before creating a record or storing media", async () => {
  vi.setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
  const response = await POST(bookingRequest("2026-08-10", "2026-08-20"));

  assert.equal(response.status, 422);
  assert.equal((await response.json()).error, "Choose a start date today or later. Campaigns cannot start in the past.");
  assert.equal(mocks.createBookingRecord.mock.calls.length, 0);
  assert.equal(mocks.createBookingWithCreativeRecord.mock.calls.length, 0);
  assert.equal(mocks.storeMedia.mock.calls.length, 0);
});

test("a booking can start today", async () => {
  const response = await POST(bookingRequestWithoutCreative("2026-08-01", "2026-08-20"));

  assert.equal(response.status, 201);
  assert.equal((await response.json()).booking.start, "2026-08-01");
  assert.equal(mocks.createBookingRecord.mock.calls.length, 1);
});

function bookingRequest(start: string, end: string, creative?: File) {
  const form = new FormData();
  form.set("file", creative ?? new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "booking.png", { type: "image/png" }));
  form.set("inventoryId", staticBillboard.id);
  form.set("campaign", "Static Campaign");
  form.set("start", start);
  form.set("end", end);
  form.set("adSlots", "1");
  return new NextRequest("http://localhost/api/bookings", {
    method: "POST",
    body: form,
  });
}

function bookingRequestWithoutCreative(start: string, end: string) {
  const form = new FormData();
  form.set("inventoryId", staticBillboard.id);
  form.set("campaign", "Static Campaign");
  form.set("start", start);
  form.set("end", end);
  form.set("adSlots", "1");
  return new NextRequest("http://localhost/api/bookings", { method: "POST", body: form });
}

function daypartRequest(dayparts: string, start = "2026-08-10", end = "2026-08-11") {
  const form = new FormData();
  form.set("inventoryId", staticBillboard.id);
  form.set("campaign", "Evening Campaign");
  form.set("start", start);
  form.set("end", end);
  form.set("adSlots", "1");
  form.set("dayparts", dayparts);
  return new NextRequest("http://localhost/api/bookings", { method: "POST", body: form });
}

test("a digital booking stores its time-of-day slots and pays only their share of the daily rate", async () => {
  mocks.getInventory.mockResolvedValue({ ...staticBillboard, format: "digital", deliveryMode: "digital" });

  const response = await POST(daypartRequest("evening,morning"));

  assert.equal(response.status, 201);
  const booking = mocks.createBookingRecord.mock.calls[0][0] as { dayparts: string[]; spend: number };
  assert.deepEqual(booking.dayparts, ["morning", "evening"]);
  // 500 a day x 1.25 digital multiplier x 2 days x (0.25 + 0.15).
  assert.equal(booking.spend, 500);
});

test("every slot is stored as all day at the full rate", async () => {
  mocks.getInventory.mockResolvedValue({ ...staticBillboard, format: "digital", deliveryMode: "digital" });

  const response = await POST(daypartRequest("morning,midday,afternoon,evening,overnight"));

  assert.equal(response.status, 201);
  const booking = mocks.createBookingRecord.mock.calls[0][0] as { dayparts?: string[]; spend: number };
  assert.equal(booking.dayparts, undefined);
  assert.equal(booking.spend, 1250);
});

test("an unknown time-of-day slot is refused", async () => {
  mocks.getInventory.mockResolvedValue({ ...staticBillboard, format: "digital", deliveryMode: "digital" });

  const response = await POST(daypartRequest("brunch"));

  assert.equal(response.status, 400);
  assert.equal(mocks.createBookingRecord.mock.calls.length, 0);
});

test("a billboard refuses time-of-day slots because it shows the ad all day", async () => {
  const response = await POST(daypartRequest("morning"));

  assert.equal(response.status, 422);
  assert.equal(mocks.createBookingRecord.mock.calls.length, 0);
});

test("a full evening does not block a morning booking on the same screen", async () => {
  mocks.getInventory.mockResolvedValue({ ...staticBillboard, format: "digital", deliveryMode: "digital", imageInterval: 6, maxLoopSeconds: 6 });
  mocks.listBookings.mockResolvedValue([{ id: "BK-EVENING", advertiser: "Other", inventoryId: staticBillboard.id, campaign: "Evening", start: "2026-08-01", end: "2026-08-31", adSlots: 1, dayparts: ["evening"], creativeStatus: "approved", status: "approved", spend: 1, paid: false, pop: 0 }] as never);

  assert.equal((await POST(daypartRequest("evening"))).status, 409);
  assert.equal((await POST(daypartRequest("morning"))).status, 201);
});
