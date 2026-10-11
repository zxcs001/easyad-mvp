import * as assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";

const postgresUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!postgresUrl)("response links keep their code, count only people, and summarize by day", async () => {
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = postgresUrl;
  vi.stubEnv("APP_ORIGIN", "https://easyad.example");
  vi.resetModules();
  const db = await import("../app/lib/db");
  const responses = await import("../app/lib/responses");
  try {
    await db.resetDatabaseForTests();
    const owner = await db.createUser("Owner", "owner@example.test", "hash", "admin");
    const screen: InventoryItem = { id: "INV-R", name: "Screen", operator: "O", format: "digital", advertisingOptIn: true, x: 50, y: 50, address: "1 Way", price: 100, impressions: 1000, traffic: 1, income: 1, audience: "A", competitor: "Low", occupancy: 0, imageInterval: 10, maxLoopSeconds: 60, availableFrom: "2026-01-01", availableTo: "2099-01-01" };
    await db.createInventory(screen, owner.id, owner.id);
    const booking: Booking = { id: "BK-R", advertiser: "A", inventoryId: screen.id, campaign: "C", start: "2026-10-01", end: "2026-10-20", adSlots: 1, creativeStatus: "approved", status: "live", spend: 300, paid: false, pop: 90 };
    await db.createBookingRecord(booking, owner.id);

    await assert.rejects(() => responses.saveResponseLink("BK-R", owner.id, { destinationUrl: "javascript:alert(1)" }), /web address/);
    const code = await responses.saveResponseLink("BK-R", owner.id, { destinationUrl: "northline.ca/offer", promoCode: "SCREEN10" });
    assert.match(code, /^[2-9A-HJKMNP-Z]{8}$/);
    // A new destination keeps the code, so a printed QR code still works; leaving the promo code out keeps it.
    assert.equal(await responses.saveResponseLink("BK-R", owner.id, { destinationUrl: "https://northline.ca/winter", onAd: true }), code);

    assert.equal(await responses.followResponseLink(code, true), "https://northline.ca/winter");
    assert.equal(await responses.followResponseLink(code, true), "https://northline.ca/winter");
    assert.equal(await responses.followResponseLink(code, false), "https://northline.ca/winter");
    assert.equal(await responses.followResponseLink("ZZZZZZZZ", true), null);
    assert.equal(await responses.followResponseLink("bad", true), null);
    await responses.setPromoRedemptions("BK-R", 4);
    await assert.rejects(() => responses.setPromoRedemptions("BK-R", -1), /number of times/);

    const [summary] = await responses.responseSummaries(["BK-R"]);
    assert.equal(summary.responses, 2);
    assert.equal(summary.promoCode, "SCREEN10");
    assert.equal(summary.promoRedemptions, 4);
    assert.equal(summary.onAd, true);
    assert.equal(summary.shortUrl, `https://easyad.example/go/${code}`);
    assert.equal(summary.daily.length, 14);
    assert.equal(summary.daily.at(-1)?.count, 2);
    assert.match(await responses.responseQrSvg(summary.shortUrl), /^<svg[\s\S]*<\/svg>\s*$/);
  } finally {
    await db.closeDb();
    process.env.DATABASE_URL = saved;
    vi.unstubAllEnvs();
  }
});
