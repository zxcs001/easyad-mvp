import * as assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { test, vi } from "vitest";

const imageItem = {
  id: "MED-API-IMAGE",
  position: 2,
  deviceId: "INV-API-1",
  source: "device" as const,
  mediaType: "image" as const,
  mimeType: "image/png",
  title: "API image",
  originalName: "api.png",
  publicUrl: "/media/MED-API-IMAGE",
  createdAt: "2026-07-09T00:00:00.000Z",
  advertiser: null,
  campaign: null,
  startsOn: null,
  endsOn: null,
};

const videoItem = {
  ...imageItem,
  id: "CRV-API-VIDEO",
  position: 1,
  source: "advertiser" as const,
  mediaType: "video" as const,
  mimeType: "video/mp4",
  title: "API campaign",
  originalName: "api.mp4",
  publicUrl: "/media/CRV-API-VIDEO",
  advertiser: "API Advertiser",
  campaign: "API Campaign",
  startsOn: "2026-07-01",
  endsOn: "2026-07-31",
};

const activeDevice = {
  inventory: {
    id: "INV-API-1",
    name: "API Test Device",
    operator: "Test Operator",
    format: "digital" as const,
    x: 48.4,
    y: -89.2,
    address: "Thunder Bay, ON",
    price: 500,
    impressions: 100000,
    traffic: 60000,
    income: 80000,
    audience: "Commuters",
    competitor: "Low" as const,
    occupancy: 20,
    imageInterval: 8,
    maxLoopSeconds: 120,
    availableFrom: "2026-01-01",
    availableTo: "2026-12-31",
    approvalStatus: "approved" as const,
  },
  items: [videoItem, imageItem],
};

vi.mock("../app/lib/public-device-media", () => ({
  getActiveDeviceMedia: async (id: string) => id === activeDevice.inventory.id ? activeDevice : null,
  resolveDeviceMediaItem: (items: typeof activeDevice.items, selector: string) => /^[1-9]\d*$/.test(selector)
    ? items[Number(selector) - 1] ?? null
    : items.find((item) => item.id === selector) ?? null,
}));

vi.mock("../app/lib/db", () => ({
  getPublicMediaResource: async (id: string) => id === imageItem.id ? {
    originalName: imageItem.originalName,
    mimeType: imageItem.mimeType,
    storagePath: `${process.cwd()}/tests/fixtures/public-api-image.bin`,
    cacheable: false,
  } : null,
}));

vi.mock("../app/lib/media-storage", () => ({
  storedMediaSize: async () => Buffer.from("public-api-image\n").byteLength,
  readStoredMedia: async () => {
    const bytes = Buffer.from("public-api-image\n");
    return { bytes, size: bytes.byteLength };
  },
}));

import { GET as getCollection } from "../app/api/public/devices/[id]/media/route";
import { GET as getItem } from "../app/api/public/devices/[id]/media/[media]/route";

test("public device collection returns totals and stable item links", async () => {
  const response = await getCollection(new NextRequest("http://localhost:3000/api/public/devices/INV-API-1/media"), {
    params: Promise.resolve({ id: "INV-API-1" }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.deepEqual(body.summary, { total: 2, images: 1, videos: 1 });
  assert.equal(body.items[0].positionApiUrl, "http://localhost:3000/api/public/devices/INV-API-1/media/1");
  assert.equal(body.items[1].apiUrl, "http://localhost:3000/api/public/devices/INV-API-1/media/MED-API-IMAGE");
});

test("public device item returns Base64 for images and URLs for video", async () => {
  const imageResponse = await getItem(new NextRequest("http://localhost:3000/api/public/devices/INV-API-1/media/MED-API-IMAGE"), {
    params: Promise.resolve({ id: "INV-API-1", media: "MED-API-IMAGE" }),
  });
  const imageBody = await imageResponse.json();
  assert.equal(imageBody.content.encoding, "base64");
  assert.equal(Buffer.from(imageBody.content.data, "base64").toString("utf8").trim(), "public-api-image");

  const videoResponse = await getItem(new NextRequest("http://localhost:3000/api/public/devices/INV-API-1/media/1"), {
    params: Promise.resolve({ id: "INV-API-1", media: "1" }),
  });
  const videoBody = await videoResponse.json();
  assert.deepEqual(videoBody.content, { encoding: "url", url: "http://localhost:3000/media/CRV-API-VIDEO" });
});
