import * as assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "vitest";

// The demo data modules are CommonJS, because the seed script runs them with
// plain node and no build step.
const requireModule = createRequire(import.meta.url);
const { buildDemoCampaigns, PLAYS_PER_DAY } = requireModule("../scripts/demo-data/bookings.cjs");
const { PLATFORM_FEE_RATE, SPOT_SECONDS, screens } = requireModule("../scripts/demo-data/thunder-bay.cjs");

type DemoBooking = {
  id: string;
  advertiser: string;
  inventoryId: string;
  campaign: string;
  start: string;
  end: string;
  adSlots: number;
  status: string;
  spend: number;
  paid: boolean;
  pop: number;
};

type DemoScreen = {
  id: string;
  impressions: number;
  loopSeconds: number;
  deliveryMode: string;
  price: number;
};

const TODAY = new Date("2026-09-18T12:00:00Z");
const demo = buildDemoCampaigns({ today: TODAY });
const screenById = new Map<string, DemoScreen>(screens.map((screen: DemoScreen) => [screen.id, screen]));

function days(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

test("the demo generator is deterministic", () => {
  const again = buildDemoCampaigns({ today: TODAY });
  assert.deepEqual(again.bookings, demo.bookings);
  assert.deepEqual(again.popLogs, demo.popLogs);
  assert.deepEqual(again.transactions, demo.transactions);
  assert.deepEqual(again.summary, demo.summary);
});

test("the booking mix shows every campaign state, with completed the largest", () => {
  const counts = demo.summary.byStatus as Record<string, number>;
  const states = ["completed", "scheduled", "pending approval", "creative review", "approved", "live", "rejected"];
  for (const state of states) assert.ok(counts[state] > 0, `no bookings in state ${state}`);

  const largest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  assert.equal(largest[0], "completed");
  // A demo with one advertiser reads as a test fixture, not as a market.
  assert.ok(new Set(demo.bookings.map((booking: DemoBooking) => booking.advertiser)).size >= 12);
  assert.ok(demo.summary.campaigns >= 40);
});

test("every flight starts on a Monday and stays inside the demo window", () => {
  for (const booking of demo.bookings as DemoBooking[]) {
    assert.equal(new Date(`${booking.start}T00:00:00Z`).getUTCDay(), 1, `${booking.id} does not start on a Monday`);
    assert.ok(booking.end >= booking.start, `${booking.id} ends before it starts`);
    assert.ok(booking.start >= demo.summary.windowStart);
    assert.ok(booking.end <= demo.summary.windowEnd);
  }
});

test("a digital booking earns its share of the loop, never the whole screen", () => {
  for (const log of demo.popLogs) {
    const booking = (demo.bookings as DemoBooking[]).find((entry) => entry.id === log.bookingId)!;
    const screen = screenById.get(booking.inventoryId)!;
    const share = screen.deliveryMode === "static"
      ? 1
      : Math.min(1, (booking.adSlots * SPOT_SECONDS) / screen.loopSeconds);
    const wholeScreen = screen.impressions * days(booking.start, booking.end);
    assert.ok(log.impressions <= Math.round(wholeScreen * share) + 1, `${log.id} claims more than its loop share`);
    if (share < 1) assert.ok(log.impressions < wholeScreen, `${log.id} claims the whole screen`);
  }
});

test("proof-of-play rows add up to the stored pop, so a recompute changes nothing", () => {
  const playsByBooking = new Map<string, number>();
  for (const log of demo.popLogs) {
    playsByBooking.set(log.bookingId, (playsByBooking.get(log.bookingId) ?? 0) + log.plays);
  }

  for (const booking of demo.bookings as DemoBooking[]) {
    const expectedPlays = days(booking.start, booking.end) * PLAYS_PER_DAY;
    const plays = playsByBooking.get(booking.id) ?? 0;
    assert.equal(Math.min(100, Math.round((plays / expectedPlays) * 100)), booking.pop, `pop of ${booking.id} disagrees with its logs`);
    // Only a campaign that has played has evidence.
    if (!["completed", "live"].includes(booking.status)) assert.equal(plays, 0, `${booking.id} has plays it never earned`);
  }
});

test("money is consistent: city notices are free and every invoice matches its booking", () => {
  const bookingById = new Map((demo.bookings as DemoBooking[]).map((booking) => [booking.id, booking]));

  for (const transaction of demo.transactions) {
    const booking = bookingById.get(transaction.bookingId)!;
    assert.ok(booking, `transaction ${transaction.id} has no booking`);
    assert.equal(transaction.amount, booking.spend);
    assert.equal(transaction.platformFee, Math.round(booking.spend * PLATFORM_FEE_RATE));
    assert.equal(transaction.operatorPayout, booking.spend - transaction.platformFee);
    assert.ok(transaction.amount > 0, `transaction ${transaction.id} bills nothing`);
    assert.equal(transaction.status, booking.paid ? "paid" : "pending");
  }

  const free = (demo.bookings as DemoBooking[]).filter((booking) => booking.spend === 0);
  assert.equal(free.length, demo.summary.cityNotices);
  for (const booking of free) {
    assert.equal(booking.paid, false);
    assert.equal(demo.transactions.some((transaction: { bookingId: string }) => transaction.bookingId === booking.id), false);
  }

  const revenue = (demo.bookings as DemoBooking[]).reduce((sum, booking) => sum + booking.spend, 0);
  assert.equal(revenue, demo.summary.revenue);
});

test("spend follows the rate card of the screen that was booked", () => {
  for (const booking of demo.bookings as DemoBooking[]) {
    if (booking.spend === 0) continue;
    const screen = screenById.get(booking.inventoryId)!;
    const list = screen.price * days(booking.start, booking.end) * booking.adSlots;
    // Volume and agency discounts cut the list price, never raise it.
    assert.ok(booking.spend <= list, `${booking.id} costs more than its rate card`);
    assert.ok(booking.spend >= Math.round(list * 0.5), `${booking.id} is discounted past any real deal`);
  }
});

test("no screen is sold past its loop, and the rate is per slot", () => {
  const bookings = demo.bookings as DemoBooking[];
  // Slots sold on each screen on each day. A loop holds only so many.
  const sold = new Map<string, number>();
  for (const booking of bookings) {
    for (let time = new Date(booking.start).getTime(); time <= new Date(booking.end).getTime(); time += 86400000) {
      const key = `${booking.inventoryId}|${new Date(time).toISOString().slice(0, 10)}`;
      sold.set(key, (sold.get(key) ?? 0) + booking.adSlots);
    }
  }

  for (const screen of screens as (DemoScreen & { slotsInLoop: number; facePrice: number })[]) {
    for (const [key, slots] of sold) {
      if (!key.startsWith(`${screen.id}|`)) continue;
      assert.ok(slots <= screen.slotsInLoop, `${key} is sold ${slots} of ${screen.slotsInLoop} slots`);
    }
    // A buyer who takes the whole loop pays the researched face rate.
    assert.ok(screen.price * screen.slotsInLoop >= screen.facePrice, `${screen.id} sells its whole loop below its face rate`);
  }
});

test("occupancy is measured from the bookings, not declared", () => {
  const capacity = new Map((screens as (DemoScreen & { slotsInLoop: number })[]).map((screen) => [screen.id, screen.slotsInLoop]));
  for (const [screenId, occupancy] of Object.entries(demo.summary.occupancy as Record<string, number>)) {
    assert.ok(occupancy >= 0 && occupancy <= 100, `${screenId} reports ${occupancy}% occupancy`);
    const sold = (demo.bookings as DemoBooking[]).filter((booking) => booking.inventoryId === screenId).length;
    if (occupancy > 0) assert.ok(sold > 0, `${screenId} claims occupancy with no bookings`);
    if (sold === 0) assert.equal(occupancy, 0, `${screenId} claims occupancy with no bookings`);
    assert.ok(capacity.has(screenId));
  }
  assert.equal(Object.keys(demo.summary.occupancy).length, screens.length);
});

test("every month of the past year holds paid business", () => {
  const months = new Set(
    (demo.bookings as DemoBooking[])
      .filter((booking) => booking.spend > 0 && booking.start <= "2026-09-18")
      .map((booking) => booking.start.slice(0, 7)),
  );
  assert.ok(months.size >= 12, `revenue chart has only ${months.size} months of business`);
});
