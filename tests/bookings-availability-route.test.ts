import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { beforeEach, test, vi } from "vitest";
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
  vi.clearAllMocks();
  mocks.getInventory.mockResolvedValue(staticBillboard);
  mocks.createBookingWithCreativeRecord.mockImplementation(async (booking: unknown, _userId: string, creative: unknown) => ({ booking, creative }));
  mocks.storeMedia.mockResolvedValue("/tmp/booking-creative.png");
});

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
