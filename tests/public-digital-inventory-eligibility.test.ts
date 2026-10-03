import { beforeEach, expect, test, vi } from "vitest";
import type { InventoryItem } from "../app/data";

const mocks = vi.hoisted(() => ({
  getPublishedInventory: vi.fn(),
  listInventoryAdvertiserResources: vi.fn(),
  listMediaResources: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../app/lib/db", () => ({
  getActiveDeviceAlertForDevice: vi.fn(),
  getPublishedInventory: mocks.getPublishedInventory,
  listInventoryAdvertiserResources: mocks.listInventoryAdvertiserResources,
  listMediaResources: mocks.listMediaResources,
}));
vi.mock("../app/i18n/server", () => ({
  getServerI18n: async () => ({
    formatDate: vi.fn(),
    formatNumber: vi.fn(),
    locale: "en",
    t: (message: string) => message,
  }),
}));

import DevicePublicPage from "../app/devices/[id]/page";
import { PublicInventoryProfile } from "../app/component/public-inventory-profile";
import { getActiveDeviceMedia } from "../app/lib/public-device-media";

const staticInventory: InventoryItem = {
  id: "INV-STATIC-1",
  name: "Physical Billboard",
  operator: "Test Operator",
  format: "static",
  deliveryMode: "static",
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublishedInventory.mockResolvedValue(staticInventory);
});

test("the standalone device route rejects static inventory before loading media", async () => {
  await expect(DevicePublicPage({ params: Promise.resolve({ id: staticInventory.id }) })).rejects.toThrow("NEXT_NOT_FOUND");

  expect(mocks.notFound).toHaveBeenCalledOnce();
  expect(mocks.listMediaResources).not.toHaveBeenCalled();
  expect(mocks.listInventoryAdvertiserResources).not.toHaveBeenCalled();
});

test("the public inventory profile rejects static inventory before loading media", async () => {
  await expect(PublicInventoryProfile({ inventoryId: staticInventory.id })).rejects.toThrow("NEXT_NOT_FOUND");

  expect(mocks.notFound).toHaveBeenCalledOnce();
  expect(mocks.listMediaResources).not.toHaveBeenCalled();
  expect(mocks.listInventoryAdvertiserResources).not.toHaveBeenCalled();
});

test("the public device-media API service rejects static inventory before loading media", async () => {
  await expect(getActiveDeviceMedia(staticInventory.id)).resolves.toBeNull();

  expect(mocks.listMediaResources).not.toHaveBeenCalled();
  expect(mocks.listInventoryAdvertiserResources).not.toHaveBeenCalled();
});
