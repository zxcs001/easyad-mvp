import * as assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import type { Booking, InventoryItem, MediaResource } from "../app/data";

const postgresUrl = process.env.TEST_DATABASE_URL;

test.skipIf(!postgresUrl)("PostgreSQL database layer persists users, sessions, inventory, bookings, and media", async () => {
  const originalCwd = process.cwd();
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const testRoot = mkdtempSync(path.join(tmpdir(), "ooh-market-db-"));
  let db: typeof import("../app/lib/db") | null = null;
  process.chdir(testRoot);
  process.env.DATABASE_URL = postgresUrl;

  try {
    vi.resetModules();
    db = await import("../app/lib/db");
    await db.resetDatabaseForTests();
    const user = await db.createUser("Temporary Admin", "ADMIN@EXAMPLE.TEST", "hashed-password", "admin");

    assert.equal(user.email, "admin@example.test");
    assert.equal(user.role, "admin");
    assert.equal(await db.countUsers(), 1);
    assert.equal((await db.getUserByEmail("admin@example.test"))?.password_hash, "hashed-password");
    assert.equal((await db.getUserById(user.id))?.name, "Temporary Admin");

    await db.createSessionRecord("session-token", user.id, new Date(Date.now() + 60_000).toISOString());
    assert.equal((await db.getUserBySession("session-token"))?.id, user.id);
    const storedSession = await db.getDb().query<{ token: string }>("SELECT token FROM sessions LIMIT 1");
    assert.notEqual(storedSession.rows[0]?.token, "session-token");
    await db.deleteSessionRecord("session-token");
    assert.equal(await db.getUserBySession("session-token"), null);

    const inventory: InventoryItem = {
      id: "INV-DB-1",
      name: "Database Test Screen",
      operator: "Database Operator",
      format: "digital",
      x: 45,
      y: 55,
      address: "1 Database Way",
      price: 500,
      impressions: 120000,
      traffic: 80000,
      income: 90000,
      audience: "Commuters",
      competitor: "Low",
      occupancy: 10,
      imageInterval: 12,
      maxLoopSeconds: 120,
      availableFrom: "2026-07-01",
      availableTo: "2026-08-01",
    };

    assert.equal((await db.createInventory(inventory, user.id))?.id, inventory.id);
    assert.equal((await db.listInventory()).length, 1);
    assert.ok((await db.getInventory(inventory.id))?.tags?.includes("digital"));
    const pendingInventory: InventoryItem = { ...inventory, id: "INV-DB-PENDING", approvalStatus: "pending approval" };
    assert.equal((await db.createInventory(pendingInventory, user.id))?.approvalStatus, "pending approval");
    assert.deepEqual((await db.listPublishedInventory()).map((item) => item.id), [inventory.id]);
    assert.equal((await db.updateInventoryRecord(pendingInventory.id, { approvalStatus: "approved" }))?.approvalStatus, "approved");
    assert.equal((await db.listPublishedInventory()).length, 2);
    assert.equal((await db.updateInventoryRecord(inventory.id, { price: 650 }))?.price, 650);
    assert.equal((await db.getInventory(inventory.id))?.price, 650);
    assert.equal((await db.updateInventoryRecord(inventory.id, { imageInterval: 15 }))?.imageInterval, 15);
    assert.equal((await db.getInventory(inventory.id))?.imageInterval, 15);
    assert.equal((await db.updateInventoryRecord(inventory.id, { maxLoopSeconds: 180 }))?.maxLoopSeconds, 180);
    assert.deepEqual((await db.updateInventoryRecord(inventory.id, { tags: ["Urban", "near university", "urban"] }))?.tags, ["urban", "near-university"]);
    assert.equal((await db.getInventory(inventory.id))?.maxLoopSeconds, 180);

    const booking: Booking = {
      id: "BK-DB-1",
      advertiser: "Database Advertiser",
      inventoryId: inventory.id,
      campaign: "Database Campaign",
      start: "2026-07-10",
      end: "2026-07-20",
      adSlots: 2,
      creativeStatus: "pending review",
      status: "pending approval",
      spend: 1000,
      paid: false,
      pop: 0,
    };

    assert.equal((await db.createBookingRecord(booking, user.id)).id, booking.id);
    assert.equal((await db.listBookings())[0]?.campaign, "Database Campaign");
    assert.equal((await db.listBookingsCreatedBy(user.id))[0]?.id, booking.id);
    assert.equal(await db.getBookingOwnerId(booking.id), user.id);
    assert.equal((await db.listBookings())[0]?.adSlots, 2);
    assert.equal((await db.updateBookingRecord(booking.id, { status: "approved", paid: true, pop: 42 }))?.pop, 42);
    assert.equal((await db.listBookings())[0]?.paid, true);
    const approval = await db.createApprovalEvent({
      bookingId: booking.id,
      actorId: user.id,
      action: "approved",
      previousStatus: "pending approval",
      nextStatus: "approved",
    });
    assert.equal(approval?.campaign, "Database Campaign");
    assert.equal((await db.listApprovalEvents(user.id))[0]?.actorName, "Temporary Admin");

    const media: MediaResource & { storagePath: string } = {
      id: "MED-DB-1",
      inventoryId: inventory.id,
      ownerId: user.id,
      title: "Screen Photo",
      originalName: "screen.png",
      mimeType: "image/png",
      mediaType: "image",
      sizeBytes: 2048,
      publicUrl: "/media/MED-DB-1",
      createdAt: "2026-07-01T00:00:00.000Z",
      storagePath: path.join(testRoot, "screen.png"),
    };

    assert.equal((await db.createMediaResource(media)).id, media.id);
    assert.equal((await db.listMediaResources(inventory.id))[0]?.publicUrl, "/media/MED-DB-1");
    assert.equal((await db.getMediaResource(media.id))?.storagePath, media.storagePath);
    assert.equal((await db.getPublicMediaResource(media.id))?.mimeType, "image/png");
    assert.equal((await db.deleteMediaResource(media.id))?.resource.id, media.id);
    assert.equal(await db.getMediaResource(media.id), null);

    const uploadedCreative = await db.createCreative({
      id: "CRV-DB-UPLOAD",
      bookingId: booking.id,
      source: "upload",
      template: "retail",
      format: "digital",
      width: 1920,
      height: 1080,
      fileType: "mp4",
      fileSize: 24,
      safeZone: 10,
      distortion: 1,
      originalName: "spot.mp4",
      mimeType: "video/mp4",
      publicUrl: "/media/CRV-DB-UPLOAD",
      storagePath: path.join(testRoot, "spot.mp4"),
      status: "pending review",
    });

    assert.equal(uploadedCreative.source, "upload");
    assert.equal((await db.listCreatives(booking.id))[0]?.publicUrl, "/media/CRV-DB-UPLOAD");
    assert.equal((await db.getPublicMediaResource("CRV-DB-UPLOAD"))?.originalName, "spot.mp4");
    assert.deepEqual((await db.listInventoryAdvertiserResources(inventory.id)).map((resource) => ({
      id: resource.id,
      campaign: resource.campaign,
      advertiser: resource.advertiser,
      publicUrl: resource.publicUrl,
    })), [{
      id: "CRV-DB-UPLOAD",
      campaign: "Database Campaign",
      advertiser: "Database Advertiser",
      publicUrl: "/media/CRV-DB-UPLOAD",
    }]);
    assert.equal((await db.listInventoryAdvertiserResources(inventory.id, "2026-07-21")).length, 0);
    assert.equal((await db.getPublicMediaResource("CRV-DB-UPLOAD"))?.originalName, "spot.mp4");

    await db.deleteInventoryRecord(inventory.id);
    assert.equal(await db.getInventory(inventory.id), null);
    assert.equal((await db.listBookings()).length, 0);
  } finally {
    await db?.closeDb();
    process.chdir(originalCwd);
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    vi.resetModules();
  }
});
