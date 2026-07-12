import * as assert from "node:assert/strict";
import { test } from "vitest";
import type { InventoryAdvertiserResource, InventoryItem, MediaResource } from "../app/data";
import { buildActiveDeviceMedia, resolveDeviceMediaItem } from "../app/lib/public-device-media";

const inventory: InventoryItem = {
  id: "INV-API-1",
  name: "API Test Device",
  operator: "Test Operator",
  format: "digital",
  x: 48.4,
  y: -89.2,
  address: "Thunder Bay, ON",
  price: 500,
  impressions: 100000,
  traffic: 60000,
  income: 80000,
  audience: "Commuters",
  competitor: "Low",
  occupancy: 20,
  imageInterval: 8,
  maxLoopSeconds: 120,
  availableFrom: "2026-01-01",
  availableTo: "2026-12-31",
  approvalStatus: "approved",
};

const deviceImage: MediaResource = {
  id: "MED-API-IMAGE",
  inventoryId: inventory.id,
  ownerId: "USR-1",
  title: "Operator image",
  originalName: "operator.png",
  mimeType: "image/png",
  mediaType: "image",
  sizeBytes: 1200,
  publicUrl: "/media/MED-API-IMAGE",
  createdAt: "2026-07-09T10:00:00.000Z",
};

function advertiserCreative(overrides: Partial<InventoryAdvertiserResource> = {}): InventoryAdvertiserResource {
  return {
    id: "CRV-API-VIDEO",
    bookingId: "BK-API-1",
    source: "upload",
    template: "retail",
    format: "digital",
    width: 1920,
    height: 1080,
    fileType: "mp4",
    fileSize: 20,
    safeZone: 10,
    distortion: 1,
    originalName: "campaign.mp4",
    mimeType: "video/mp4",
    publicUrl: "/media/CRV-API-VIDEO",
    status: "approved",
    createdAt: "2026-07-10T10:00:00.000Z",
    advertiser: "API Advertiser",
    campaign: "API Campaign",
    start: "2026-07-01",
    end: "2026-07-31",
    bookingStatus: "live",
    ...overrides,
  };
}

test("device media includes only approved content active on the requested date", () => {
  const result = buildActiveDeviceMedia(inventory, [deviceImage], [
    advertiserCreative(),
    advertiserCreative({ id: "CRV-PENDING", status: "pending review" }),
    advertiserCreative({ id: "CRV-FUTURE", start: "2026-08-01", end: "2026-08-31" }),
    advertiserCreative({ id: "CRV-EXPIRED", start: "2026-06-01", end: "2026-06-30" }),
    advertiserCreative({ id: "CRV-REJECTED", bookingStatus: "rejected" }),
  ], "2026-07-10");

  assert.deepEqual(result.items.map((item) => item.id), ["CRV-API-VIDEO", "MED-API-IMAGE"]);
  assert.deepEqual(result.items.map((item) => item.position), [1, 2]);
  assert.equal(resolveDeviceMediaItem(result.items, "1")?.id, "CRV-API-VIDEO");
  assert.equal(resolveDeviceMediaItem(result.items, "MED-API-IMAGE")?.position, 2);
  assert.equal(resolveDeviceMediaItem(result.items, "3"), null);
});
