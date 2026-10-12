import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";

const mocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  getBooking: vi.fn(),
  createCreative: vi.fn(async (creative: unknown) => creative),
  updateBookingRecord: vi.fn(),
  storeMedia: vi.fn(async () => "/tmp/artwork"),
  deleteStoredMedia: vi.fn(async () => undefined),
}));

vi.mock("../app/lib/auth", () => ({
  getCurrentUser: async () => ({ id: "USR-ADVERTISER", role: "advertiser" }),
  canSubmitCreative: () => true,
}));
vi.mock("../app/lib/db", () => ({
  ...mocks,
  getBookingOwnerId: async () => "USR-ADVERTISER",
  listCreatives: async () => [],
}));
vi.mock("../app/lib/media-storage", () => ({ storeMedia: mocks.storeMedia, deleteStoredMedia: mocks.deleteStoredMedia }));

import { POST } from "../app/api/bookings/[id]/creative/route";
import { POST as preview } from "../app/api/creative/template-preview/route";
import sharp from "sharp";

const booking = { id: "BK-CREATIVE", inventoryId: "INV-STATIC", start: "2099-01-01", end: "2099-02-01", status: "pending approval", creativeStatus: "not submitted" } as Booking;
const item = { id: "INV-STATIC", format: "static", deliveryMode: "static" } as InventoryItem;
const context = { params: Promise.resolve({ id: booking.id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBooking.mockResolvedValue(booking);
  mocks.getInventory.mockResolvedValue(item);
  mocks.updateBookingRecord.mockResolvedValue({ ...booking, creativeStatus: "pending review", status: "creative review" });
});

function templateRequest(format = "static") {
  return new NextRequest("http://localhost/api/bookings/BK-CREATIVE/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: "retail", format, width: 5760, height: 1440, safeZone: 10, distortion: 1 }) });
}

function uploadRequest(file: File | null, fields: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.set("file", file);
  for (const [key, value] of Object.entries({ template: "retail", format: "static", width: "5760", height: "1440", safeZone: "10", distortion: "1", ...fields })) form.set(key, value);
  return new NextRequest("http://localhost/api/bookings/BK-CREATIVE/creative", { method: "POST", body: form });
}

const png = () => new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "artwork.png", { type: "image/png" });

test.each(["static", "digital"])("static billboards reject templates even when the client claims %s", async (format) => {
  const response = await POST(templateRequest(format), context);
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("Static billboards require uploaded artwork");
  expect(mocks.storeMedia).not.toHaveBeenCalled();
  expect(mocks.createCreative).not.toHaveBeenCalled();
});

test.each([png(), new File([Buffer.from([0xff, 0xd8, 0xff])], "artwork.jpg", { type: "image/jpeg" }), new File(["%PDF-1.7 artwork"], "print.pdf", { type: "application/pdf" })])("accepts signature-validated static artwork: $name", async (file) => {
  const response = await POST(uploadRequest(file), context);
  expect(response.status).toBe(201);
  expect((await response.json()).creative).toMatchObject({ source: "upload", format: "static", mimeType: file.type, originalName: file.name });
});

test("static artwork rejects video and disguised invalid image files", async () => {
  for (const file of [new File(["video"], "ad.mp4", { type: "video/mp4" }), new File(["not a png"], "artwork.png", { type: "image/png" })]) {
    const response = await POST(uploadRequest(file), context);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("must be a valid PNG, JPG, or PDF");
  }
  expect(mocks.storeMedia).not.toHaveBeenCalled();
});

test("missing artwork explains the required next step", async () => {
  const response = await POST(uploadRequest(null), context);
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("Choose a media file before submitting your creative.");
});

test("the booked format is canonical even for multipart submissions", async () => {
  const response = await POST(uploadRequest(png(), { format: "digital" }), context);
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("This campaign requires Static Billboard artwork");
  expect(mocks.createCreative).not.toHaveBeenCalled();
});

test("reports all failed requirements before storing the artwork", async () => {
  const response = await POST(uploadRequest(png(), { safeZone: "0", distortion: "4" }), context);
  expect(response.status).toBe(422);
  const result = await response.json();
  expect(result.error).toContain("Distortion: Artwork scaling must stay under 3% distortion.");
  expect(result.error).toContain("Safe zone: Requires at least 6% margin");
  expect(mocks.storeMedia).not.toHaveBeenCalled();
});

test("client-provided dimensions cannot override the booked billboard specifications", async () => {
  const response = await POST(uploadRequest(png(), { width: "1920", height: "1080" }), context);
  expect(response.status).toBe(201);
  expect((await response.json()).creative).toMatchObject({ format: "static", width: 5760, height: 1440 });
});

test("digital bookings still accept fixed HTML templates", async () => {
  mocks.getInventory.mockResolvedValue({ ...item, format: "digital", deliveryMode: "digital" });
  const request = new NextRequest("http://localhost/api/bookings/BK-CREATIVE/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: "retail", format: "digital", width: 1920, height: 1080, safeZone: 10, distortion: 1 }) });
  const response = await POST(request, context);
  expect(response.status).toBe(201);
  expect((await response.json()).creative).toMatchObject({ source: "template", format: "digital", fileType: "html" });
});

test("preview and submitted HTML use the same colours, layout, font and normalized logo", async () => {
  mocks.getInventory.mockResolvedValue({ ...item, format: "digital", deliveryMode: "digital" });
  const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: "#1456A0" } }).png().toBuffer();
  const body = { template: "retail", format: "digital", safeZone: 10, distortion: 0, html: '<section class="retail-copy"><h1>Local offer</h1></section>', design: { palette: "custom", background: "#EAF4FF", foreground: "#142C47", accent: "#1456A0", font: "serif", layout: "centered", logoDataUrl: `data:image/png;base64,${bytes.toString("base64")}` } };
  const makeRequest = (path: string) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const previewResponse = await preview(makeRequest("/api/creative/template-preview"));
  expect(previewResponse.status).toBe(200);
  const response = await POST(makeRequest(`/api/bookings/${booking.id}/creative`), context);
  expect(response.status).toBe(201);
  const document = (await previewResponse.json()).document;
  expect(mocks.storeMedia).toHaveBeenCalledWith(expect.stringMatching(/\.html$/), Buffer.from(document), "text/html");
  expect(mocks.updateBookingRecord).toHaveBeenCalledWith(booking.id, { creativeStatus: "pending review", status: "creative review" });
});

test.each([{ background: "red;display:none" }, { logoDataUrl: "https://bad.example/logo.png" }, { logoDataUrl: "data:image/png;base64,bm90IGFuIGltYWdl" }])("invalid design settings fail before storage: %j", async design => {
  mocks.getInventory.mockResolvedValue({ ...item, format: "digital", deliveryMode: "digital" });
  const response = await POST(new NextRequest("http://localhost/api/bookings/BK-CREATIVE/creative", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: "retail", format: "digital", safeZone: 10, distortion: 0, design }) }), context);
  expect(response.status).toBe(422);
  expect(mocks.storeMedia).not.toHaveBeenCalled();
  expect(mocks.createCreative).not.toHaveBeenCalled();
});
