import * as assert from "node:assert/strict";
import { test } from "vitest";
import type { InventoryItem } from "../app/data";
import type { CreativeDraft } from "../app/types";
import {
  CURRENT_LOCATION_ID,
  PLAYS_PER_DAY,
  approvalHref,
  creativeHref,
  daysBetween,
  deliveredImpressions,
  discoveryHref,
  distance,
  estimateSpend,
  expectedImpressions,
  expectedPlays,
  exceedsLoopCapacity,
  formatRatio,
  geoToMapPoint,
  isCreativeSubmissionAllowed,
  isKnownLocationId,
  mapDistanceKm,
  overlaps,
  portalHref,
  reservedLoopSeconds,
  splitRevenue,
  truncateFileName,
  validateCreative,
} from "../app/utils";

const inventoryItem: InventoryItem = {
  id: "INV-TEST-1",
  name: "Test Digital Screen",
  operator: "Test Operator",
  format: "digital",
  x: 50,
  y: 50,
  address: "100 Test Ave",
  price: 400,
  impressions: 14000,
  traffic: 90000,
  income: 85000,
  audience: "Commuters",
  competitor: "Medium",
  occupancy: 20,
  imageInterval: 6,
  maxLoopSeconds: 30,
  availableFrom: "2026-07-01",
  availableTo: "2026-07-31",
};

const validCreative: CreativeDraft = {
  template: "retail",
  format: "digital",
  width: 1920,
  height: 1080,
  fileType: "png",
  fileSize: 84,
  safeZone: 8,
  distortion: 1,
};

test("date, schedule, and spend helpers use inclusive campaign dates", () => {
  assert.equal(daysBetween("2026-07-01", "2026-07-01"), 1);
  assert.equal(daysBetween("2026-07-01", "2026-07-03"), 3);
  assert.equal(overlaps("2026-07-01", "2026-07-10", "2026-07-10", "2026-07-15"), true);
  assert.equal(overlaps("2026-07-01", "2026-07-09", "2026-07-10", "2026-07-15"), false);
  assert.equal(estimateSpend(inventoryItem, "2026-07-01", "2026-07-03"), 1500);
  assert.equal(estimateSpend(inventoryItem, "2026-07-01", "2026-07-03", 2), 3000);
});

test("loop capacity allows overlapping campaigns until reserved seconds are exhausted", () => {
  const existing = [{
    id: "BK-CAP-1",
    advertiser: "First Advertiser",
    inventoryId: inventoryItem.id,
    campaign: "Existing Campaign",
    start: "2026-07-05",
    end: "2026-07-12",
    adSlots: 3,
    creativeStatus: "approved" as const,
    status: "scheduled" as const,
    spend: 1000,
    paid: false,
    pop: 0,
  }];

  assert.equal(reservedLoopSeconds(inventoryItem, 3), 18);
  assert.equal(exceedsLoopCapacity(inventoryItem, existing, "2026-07-08", "2026-07-10", 2), false);
  assert.equal(exceedsLoopCapacity(inventoryItem, existing, "2026-07-08", "2026-07-10", 3), true);
  assert.equal(exceedsLoopCapacity(inventoryItem, existing, "2026-08-01", "2026-08-05", 3), false);
});

test("analytics helpers calculate plays, impressions, and revenue split", () => {
  assert.deepEqual(splitRevenue(1000), { gross: 1000, platformFee: 150, operatorPayout: 850 });
  assert.equal(expectedPlays("2026-07-01", "2026-07-02"), PLAYS_PER_DAY * 2);
  assert.equal(expectedImpressions(inventoryItem, "2026-07-01", "2026-07-02"), 2000);
  assert.equal(deliveredImpressions(inventoryItem, { start: "2026-07-01", end: "2026-07-02", pop: 50 }), 1000);
});

test("map and location helpers normalize known spatial values", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(isKnownLocationId("thunder-bay"), true);
  assert.equal(isKnownLocationId("unknown-place"), false);

  const point = geoToMapPoint(48.38, -89.25);
  assert.ok(point.x > 67 && point.x < 68);
  assert.ok(point.y > 40 && point.y < 42);
  assert.ok(mapDistanceKm(point, { x: point.x, y: point.y + 0.15 }) > 8);
});

test("creative validation accepts matching specs and rejects invalid output", () => {
  assert.equal(validateCreative(validCreative).every((check) => check.ok), true);

  const invalid = validateCreative({
    ...validCreative,
    format: "static",
    width: 1920,
    height: 1080,
    fileType: "mp4",
    fileSize: 501,
    safeZone: 0,
    distortion: 4,
  });

  assert.deepEqual(invalid.map((check) => [check.label, check.ok]), [
    ["Aspect ratio", false],
    ["Safe zone", false],
    ["Distortion", false],
    ["File size", false],
    ["File type", false],
  ]);
});

test("creative submissions only allow active pending or approved campaigns", () => {
  const booking = {
    id: "BK-CREATIVE-RULE",
    advertiser: "Test Advertiser",
    inventoryId: inventoryItem.id,
    campaign: "Campaign Rule",
    start: "2026-07-01",
    end: "2026-07-15",
    adSlots: 1,
    creativeStatus: "pending review" as const,
    status: "pending approval" as const,
    spend: 1000,
    paid: false,
    pop: 0,
  };

  assert.equal(isCreativeSubmissionAllowed(booking, "2026-07-10"), true);
  assert.equal(isCreativeSubmissionAllowed({ ...booking, status: "approved" }, "2026-07-10"), true);
  assert.equal(isCreativeSubmissionAllowed({ ...booking, status: "rejected" }, "2026-07-10"), false);
  assert.equal(isCreativeSubmissionAllowed({ ...booking, status: "creative review" }, "2026-07-10"), false);
  assert.equal(isCreativeSubmissionAllowed({ ...booking, end: "2026-07-09" }, "2026-07-10"), false);
});

test("URL helpers preserve dashboard intent in query strings", () => {
  assert.equal(portalHref("operator", "inventory"), "/?role=operator&view=inventory");
  assert.equal(approvalHref("BK-1", "approve"), "/?role=operator&view=approvals&approvalId=BK-1&approvalAction=approve");

  const creativeUrl = new URL(`http://local.test${creativeHref(validCreative, { template: "event" }, "BK-2")}`);
  assert.equal(creativeUrl.searchParams.get("bookingId"), "BK-2");
  assert.equal(creativeUrl.searchParams.get("template"), "event");

  const discoveryUrl = new URL(`http://local.test${discoveryHref({
    radius: 25,
    format: "digital",
    minImpressions: 1000,
    minTraffic: 2000,
    minIncome: 3000,
    audience: "Commuters",
    competitor: "Low",
    priceMax: 700,
    showCompetitors: true,
    selectedTags: ["urban", "digital"],
  }, CURRENT_LOCATION_ID, "INV-1", { x: 12.345, y: 67.891 }, 8)}`);

  assert.equal(discoveryUrl.searchParams.get("areaX"), "12.35");
  assert.equal(discoveryUrl.searchParams.get("areaY"), "67.89");
  assert.equal(discoveryUrl.searchParams.get("mapZoom"), "8");
  assert.equal(discoveryUrl.searchParams.get("tags"), "urban,digital");
});

test("formatRatio returns friendly labels for supported creative ratios", () => {
  assert.equal(formatRatio(16 / 9), "16:9");
  assert.equal(formatRatio(4), "4:1");
  assert.equal(formatRatio(3), "3:1");
  assert.equal(formatRatio(2.25), "2.25:1");
});

test("uploaded filenames are persisted at a maximum of 30 characters", () => {
  assert.equal(truncateFileName("short-name.jpg"), "short-name.jpg");
  assert.equal(truncateFileName("this-is-a-very-long-inventory-creative-name.jpg"), "this-is-a-very-long-inventory-");
});
