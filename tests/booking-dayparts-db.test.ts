import * as assert from "node:assert/strict";
import { test, vi } from "vitest";
import type { Booking, InventoryItem } from "../app/data";

const postgresUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!postgresUrl)("time-of-day bookings persist, reserve only their own slots, and feed the availability calendar", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = postgresUrl;
  vi.resetModules();
  const db = await import("../app/lib/db");
  try {
    await db.resetDatabaseForTests();
    const owner = await db.createUser("Daypart Owner", "dayparts@example.test", "hashed-password", "admin");
    const screen: InventoryItem = {
      id: "INV-DAYPART", name: "Daypart Screen", operator: "Owner", format: "digital", advertisingOptIn: true,
      x: 50, y: 50, address: "1 Daypart Way", price: 400, impressions: 10000, traffic: 1, income: 1, audience: "Commuters",
      competitor: "Low", occupancy: 0, imageInterval: 6, maxLoopSeconds: 6, availableFrom: "2099-01-01", availableTo: "2099-12-31",
    };
    await db.createInventory(screen, owner.id, owner.id);
    const request = (id: string, dayparts?: Booking["dayparts"]): Booking => ({
      id, advertiser: "Advertiser", inventoryId: screen.id, campaign: id, start: "2099-03-01", end: "2099-03-10", adSlots: 1,
      ...(dayparts ? { dayparts } : {}), creativeStatus: "not submitted", status: "pending approval", spend: 100, paid: false, pop: 0,
    });

    const evening = await db.createBookingRecord(request("BK-EVENING", ["evening"]), owner.id);
    assert.deepEqual(evening.dayparts, ["evening"]);
    assert.deepEqual((await db.getBooking("BK-EVENING"))?.dayparts, ["evening"]);
    const allDay = await db.createBookingRecord(request("BK-ALLDAY"), owner.id);
    assert.equal("dayparts" in allDay, false);
    assert.equal("dayparts" in (await db.getBooking("BK-ALLDAY"))!, false);
    await db.createBookingRecord(request("BK-MORNING", ["morning"]), owner.id);
    await db.createBookingRecord(request("BK-EVENING-2", ["evening"]), owner.id);

    // The loop holds one showing. Evening and morning each get their own loop.
    assert.deepEqual((await db.updateBookingRecord("BK-EVENING", { status: "approved" }))?.dayparts, ["evening"]);
    await db.updateBookingRecord("BK-MORNING", { status: "approved" });
    await assert.rejects(() => db.updateBookingRecord("BK-EVENING-2", { status: "approved" }), /capacity is full/);
    await assert.rejects(() => db.updateBookingRecord("BK-ALLDAY", { status: "approved" }), /capacity is full/);
    // Approval never changes the slots a request asked for.
    assert.deepEqual((await db.getBooking("BK-EVENING"))?.dayparts, ["evening"]);

    const snapshot = (await db.getDb().query("SELECT schedule_snapshot FROM bookings WHERE id='BK-EVENING'")).rows[0].schedule_snapshot;
    assert.equal(snapshot.model, "daypart-slot-v1");
    assert.equal(snapshot.timezone, "America/Toronto");
    assert.deepEqual(snapshot.dayparts, ["evening"]);

    const commitments = await db.listInventoryCommitments(screen.id, "2099-01-01");
    assert.deepEqual(commitments.map((entry) => entry.dayparts).sort(), [["evening"], ["morning"]]);
    assert.ok(commitments.every((entry) => entry.seconds === 6 && !("advertiser" in entry)));
  } finally {
    await db.closeDb();
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});
