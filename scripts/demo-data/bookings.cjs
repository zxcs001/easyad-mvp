"use strict";

// Builds a year of Thunder Bay campaigns: bookings, creatives, transactions,
// proof-of-play logs and approval events.
//
// Deterministic. The same "today" always produces the same data, so a demo can
// be repeated and a test can assert on it.
//
// Two consistency rules the app depends on:
//   1. The app recomputes a booking's pop from its proof-of-play rows
//      (pop = verified plays / expected plays). The rows written here add up to
//      the pop written here, so a recompute changes nothing.
//   2. A digital booking earns its share of the loop, not the whole screen.
//      Impressions use slots x spot length / loop length.

const {
  CAMPAIGN_OFFERS,
  DELIVERY_RATE,
  PLATFORM_FEE_RATE,
  REVENUE_INDEX,
  SEASON_WORDS,
  SPOT_SECONDS,
  TIERS,
  advertisers,
  cityNotices,
  rejectionReasons,
  screens,
} = require("./thunder-bay.cjs");

// The app's own assumption for scheduled plays per active day (app/utils.ts).
const PLAYS_PER_DAY = 180;

const CITY_ADVERTISER = "City of Thunder Bay Screen Operations";

// --- Small deterministic helpers --------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const day = 86400000;
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (date, count) => new Date(date.getTime() + count * day);
const daysBetween = (start, end) => Math.max(1, Math.round((new Date(end) - new Date(start)) / day) + 1);

function mondayOf(date) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const shift = (copy.getUTCDay() + 6) % 7;
  return addDays(copy, -shift);
}

function pick(random, items) {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted(random, items, weightOf) {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let mark = random() * total;
  for (const item of items) {
    mark -= weightOf(item);
    if (mark <= 0) return item;
  }
  return items[items.length - 1];
}

function between(random, low, high) {
  return low + random() * (high - low);
}

// --- Trading maths -----------------------------------------------------------

// A digital slot earns its share of the loop. A static face has no loop, so the
// advertiser earns the whole face.
function loopShare(screen, slots) {
  if (screen.deliveryMode === "static" || !screen.loopSeconds) return 1;
  return Math.min(1, (slots * SPOT_SECONDS) / screen.loopSeconds);
}

function bookingImpressions(screen, slots, days) {
  return Math.round(screen.impressions * loopShare(screen, slots) * days);
}

function bookingSpend(screen, slots, days) {
  const units = screen.deliveryMode === "static" ? 1 : slots;
  return Math.round(screen.price * units * days);
}

// --- Campaign naming ---------------------------------------------------------

function seasonWord(month) {
  if (month <= 2 || month === 12) return SEASON_WORDS[0];
  if (month <= 5) return SEASON_WORDS[1];
  if (month <= 8) return SEASON_WORDS[2];
  return SEASON_WORDS[3];
}

function campaignName(random, advertiser, start) {
  const month = start.getUTCMonth() + 1;
  const year = start.getUTCFullYear();
  const all = CAMPAIGN_OFFERS[advertiser.category] ?? [{ text: "Brand Awareness" }];
  const inSeason = all.filter((entry) => !entry.months || entry.months.includes(month));
  const evergreen = all.filter((entry) => !entry.months);
  const usable = inSeason.length ? inSeason : evergreen.length ? evergreen : [{ text: "Brand Awareness" }];
  const offer = pick(random, usable).text;
  const shapes = [
    () => `${seasonWord(month)} ${year} — ${offer}`,
    () => `${offer} — ${seasonWord(month)} ${year}`,
    () => `Q${Math.ceil(month / 3)} ${year} ${offer}`,
    () => `${advertiser.name.split(" ")[0]} ${offer} ${year}`,
    () => `${offer} — Flight ${1 + Math.floor(random() * 3)}`,
  ];
  return pick(random, shapes)();
}

// --- The generator -----------------------------------------------------------

function buildDemoCampaigns({ today = new Date(), seed = 20260918, target = 180 } = {}) {
  const random = mulberry32(seed);
  const now = mondayOf(today);
  const windowStart = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, 28));

  // Shares from docs/DEMO_DATA_RESEARCH.md section 7.
  const quota = {
    completed: Math.round(target * 0.45),
    scheduled: Math.round(target * 0.15),
    "pending approval": Math.round(target * 0.12),
    "creative review": Math.round(target * 0.09),
    approved: Math.round(target * 0.08),
    live: Math.round(target * 0.06),
    rejected: Math.round(target * 0.05),
  };

  const bookings = [];
  const creatives = [];
  const transactions = [];
  const popLogs = [];
  const approvalEvents = [];
  const remaining = { ...quota };
  const monthUse = new Map();
  const cityQuota = Math.round(target * 0.15);
  let cityUsed = 0;
  let sequence = 0;

  const monthsInWindow = [];
  for (let cursor = new Date(windowStart); cursor <= windowEnd; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1))) {
    monthsInWindow.push(new Date(cursor));
  }

  // The state is chosen first, from the quota, and the dates are then fitted to
  // it. Letting the dates decide made almost everything "completed", because
  // most of a 15-month window is in the past.
  function takeState() {
    const available = Object.keys(remaining).filter((state) => remaining[state] > 0);
    if (!available.length) return null;
    return pickWeighted(random, available, (state) => remaining[state]);
  }

  function startForState(state, weeks, allowedMonths) {
    const span = weeks * 7;
    if (state === "live") {
      // Started, not finished: at least two days in, at least two days left.
      return mondayOf(addDays(now, -Math.floor(between(random, 2, Math.max(3, span - 2)))));
    }
    if (state === "completed" || state === "rejected") {
      const past = monthsInWindow.filter((month) => month < now && allowedMonths.includes(month.getUTCMonth() + 1));
      // Weight by the revenue index, then divide by what the month already
      // holds, so no month in the history chart is left empty.
      const month = past.length
        ? pickWeighted(random, past, (entry) => REVENUE_INDEX[entry.getUTCMonth()] / (1 + 3 * (monthUse.get(isoDate(entry).slice(0, 7)) ?? 0)))
        : null;
      let start = month ? mondayOf(addDays(month, Math.floor(random() * 21))) : mondayOf(addDays(now, -(span + 14)));
      if (addDays(start, span - 1) >= now) start = mondayOf(addDays(now, -(span + 7)));
      return start;
    }
    // Everything still in the queue starts inside the next three months.
    return mondayOf(addDays(now, 7 + Math.floor(random() * 70)));
  }

  function nextId(prefix) {
    sequence += 1;
    return `${prefix}-TB-${String(sequence).padStart(4, "0")}`;
  }

  // A loop holds only so many spots. The application refuses a booking that
  // would pass the loop (exceedsLoopCapacity in app/utils.ts), so data that
  // oversells a screen would show a state the product cannot produce. This
  // counts every overlapping booking, which is stricter than the application,
  // and the application therefore never disagrees.
  const bookedByScreen = new Map();

  function freeSlots(screen, start, end) {
    const taken = (bookedByScreen.get(screen.id) ?? [])
      .filter((entry) => start <= entry.end && entry.start <= end)
      .reduce((sum, entry) => sum + entry.slots, 0);
    return Math.max(0, (screen.slotsInLoop ?? 1) - taken);
  }

  function holdSlots(screen, start, end, slots) {
    const held = bookedByScreen.get(screen.id) ?? [];
    held.push({ start, end, slots });
    bookedByScreen.set(screen.id, held);
  }

  // How much of the loop this advertiser wants, before capacity is checked.
  function wantedSlots(screen, tier, isCity) {
    if (screen.deliveryMode === "static") return 1;
    const capacity = screen.slotsInLoop ?? 1;
    const share = isCity ? 0.15 : tier.loop;
    const jitter = between(random, 0.75, 1.25);
    return Math.max(1, Math.min(capacity, Math.round(capacity * share * jitter)));
  }

  function addCampaign({ advertiser, isCity }) {
    const tier = TIERS[advertiser.tier] ?? TIERS.medium;
    const state = takeState();
    if (!state) return 0;
    // A city notice is never rejected and never sits in a creative queue.
    const finalStatus = isCity && ["rejected", "creative review", "pending approval"].includes(state)
      ? "scheduled"
      : state;

    const weeks = isCity ? advertiser.weeks : pick(random, tier.weeks);
    const start = startForState(finalStatus, weeks, advertiser.months);
    const end = addDays(start, weeks * 7 - 1);

    // A queued or refused flight is small, so those states fill their share.
    // A large campaign would eat the whole quota with one booking group.
    const queueState = ["rejected", "creative review", "pending approval"].includes(finalStatus);
    const screenCount = queueState
      ? 1 + Math.floor(random() * 2)
      : isCity
        ? 2 + Math.floor(random() * 3)
        : Math.round(between(random, tier.screens[0], tier.screens[1]));
    const pool = isCity ? screens.filter((screen) => screen.institutionKey === "government-owner") : screens;
    const chosen = [];
    const poolCopy = [...pool];
    for (let index = 0; index < screenCount && poolCopy.length; index += 1) {
      // The square root, not the audience itself. Weighting by audience alone
      // sold the two big faces out and left the small ones empty, which is not
      // how a small network trades: a corner shop buys the library screen
      // because it is cheap and it is near the shop.
      const screen = pickWeighted(random, poolCopy, (entry) => Math.sqrt(entry.impressions));
      chosen.push(screen);
      poolCopy.splice(poolCopy.indexOf(screen), 1);
    }

    const campaign = isCity ? advertiser.title : campaignName(random, advertiser, start);
    const days = daysBetween(isoDate(start), isoDate(end));
    const createdAt = addDays(start, -(7 + Math.floor(random() * 21)));

    let created = 0;
    for (const screen of chosen) {
      const startDate = isoDate(start);
      const endDate = isoDate(end);
      // Take what the advertiser wants, or what the loop still holds, and skip
      // the screen when it is sold out for these dates.
      const slots = Math.min(wantedSlots(screen, tier, isCity), freeSlots(screen, startDate, endDate));
      if (slots < 1) continue;
      holdSlots(screen, startDate, endDate, slots);
      const spend = isCity ? 0 : bookingSpend(screen, slots, days);
      const id = nextId("BK");
      const impressions = bookingImpressions(screen, slots, days);

      // Delivery: 98.0-99.5% normally; a rare flight lands in the 96-98% band.
      const deliveryRate = random() < 0.12
        ? between(random, DELIVERY_RATE.min, DELIVERY_RATE.normal[0])
        : between(random, DELIVERY_RATE.normal[0], DELIVERY_RATE.normal[1]);

      let pop = 0;
      let elapsedDays = 0;
      if (finalStatus === "completed") elapsedDays = days;
      if (finalStatus === "live") elapsedDays = Math.max(1, daysBetween(isoDate(start), isoDate(now)) - 1);

      if (elapsedDays > 0) {
        // The app recomputes pop from the logs, so build the logs first and let
        // them decide the percentage.
        const expectedPlays = days * PLAYS_PER_DAY;
        const verifiedPlays = Math.round(elapsedDays * PLAYS_PER_DAY * deliveryRate);
        const impressionsPerPlay = impressions / Math.max(1, expectedPlays);

        let playsLeft = verifiedPlays;
        let loggedPlays = 0;
        let logDay = new Date(start);
        while (playsLeft > 0 && logDay <= addDays(start, elapsedDays - 1)) {
          const chunkDays = Math.min(7, Math.round((addDays(start, elapsedDays - 1) - logDay) / day) + 1);
          const plays = Math.min(playsLeft, Math.round(chunkDays * PLAYS_PER_DAY * deliveryRate));
          popLogs.push({
            id: nextId("POP"),
            bookingId: id,
            inventoryId: screen.id,
            plays,
            impressions: Math.round(plays * impressionsPerPlay),
            status: "verified",
            source: "player-log",
            playedAt: addDays(logDay, chunkDays - 1).toISOString(),
          });
          playsLeft -= plays;
          loggedPlays += plays;
          logDay = addDays(logDay, chunkDays);
        }

        // Take the percentage from the rows that exist, not from the figure
        // they were cut from: each chunk rounds, so the two can differ by a
        // point, and the app would then correct the seed on its first recompute.
        pop = Math.min(100, Math.round((loggedPlays / Math.max(1, expectedPlays)) * 100));
      }

      // A free city notice has no invoice, so it must never read as paid.
      const paid = spend === 0 ? false
        : finalStatus === "completed" ? random() < 0.95
        : finalStatus === "live" ? random() < 0.6
        : finalStatus === "scheduled" ? random() < 0.2
        : false;

      const creativeStatus = finalStatus === "creative review" ? "pending review"
        : finalStatus === "rejected" ? "needs changes"
        : "approved";

      bookings.push({
        id,
        advertiser: isCity ? CITY_ADVERTISER : advertiser.name,
        accountKey: isCity ? "government-operator-primary" : advertiser.account,
        inventoryId: screen.id,
        campaign,
        start: isoDate(start),
        end: isoDate(end),
        adSlots: slots,
        creativeStatus,
        status: finalStatus,
        spend,
        paid,
        pop,
        createdAt: createdAt.toISOString(),
        rejectionReason: finalStatus === "rejected" ? pick(random, rejectionReasons) : null,
      });

      if (!isCity) {
        creatives.push({
          id: nextId("CRV"),
          bookingId: id,
          source: random() < 0.55 ? "upload" : "template",
          template: pick(random, ["retail", "finance", "event"]),
          format: screen.format === "static" ? "static" : "digital",
          width: screen.format === "static" ? 5760 : 1920,
          height: screen.format === "static" ? 1440 : 1080,
          fileType: screen.format === "static" ? "pdf" : pick(random, ["jpg", "png", "mp4"]),
          fileSize: Math.round(between(random, 2, 40) * 1024 * 1024),
          safeZone: screen.format === "static" ? 10 : 8,
          distortion: Math.round(between(random, 0, 2)),
          status: creativeStatus === "approved" ? "approved" : creativeStatus === "pending review" ? "pending review" : "needs changes",
          createdAt: addDays(createdAt, 1).toISOString(),
        });

        if (spend > 0 && ["completed", "live", "scheduled", "approved"].includes(finalStatus)) {
          const platformFee = Math.round(spend * PLATFORM_FEE_RATE);
          transactions.push({
            id: id.replace(/^BK/, "TX"),
            bookingId: id,
            advertiser: advertiser.name,
            amount: spend,
            platformFee,
            operatorPayout: spend - platformFee,
            status: paid ? "paid" : "pending",
            method: paid ? pick(random, ["card", "invoice", "e-transfer"]) : "invoice",
            gatewayRef: paid ? `DEMO-${id.slice(-4)}${Math.floor(random() * 9000 + 1000)}` : null,
            createdAt: addDays(createdAt, 2).toISOString(),
            paidAt: paid ? addDays(start, Math.floor(random() * 30)).toISOString() : null,
          });
        }
      }

      if (["approved", "scheduled", "live", "completed", "rejected"].includes(finalStatus)) {
        approvalEvents.push({
          id: nextId("EVT"),
          bookingId: id,
          actorKey: screen.managerKey,
          action: finalStatus === "rejected" ? "rejected" : "approved",
          previousStatus: "pending approval",
          nextStatus: finalStatus === "rejected" ? "rejected" : "approved",
          createdAt: addDays(createdAt, 3).toISOString(),
        });
      }

      if (remaining[finalStatus] !== undefined) remaining[finalStatus] -= 1;
      // Only paid flights count towards the spread: a month holding nothing but
      // free city notices still reads as an empty month on the revenue chart.
      if (spend > 0) {
        const monthKey = isoDate(start).slice(0, 7);
        monthUse.set(monthKey, (monthUse.get(monthKey) ?? 0) + 1);
      }
      created += 1;
      if (bookings.length >= target) break;
    }
    if (isCity) cityUsed += created;
    return created;
  }

  // Build until the target is met: city notices to their share, then the roster.
  let guard = 0;
  while (bookings.length < target && guard < target * 40) {
    guard += 1;
    const wantCity = cityUsed < cityQuota && random() < 0.2;
    if (wantCity) {
      const notice = pick(random, cityNotices);
      addCampaign({ advertiser: { ...notice, months: notice.months, weeks: notice.weeks, tier: "small" }, isCity: true });
      continue;
    }
    const advertiser = pickWeighted(random, advertisers, (entry) => TIERS[entry.tier].share * 100);
    addCampaign({ advertiser, isCity: false });
  }

  // Occupancy is measured, not declared. Each screen reports the mean share of
  // its loop that was sold over the past year, so the figure the product shows
  // is the figure the bookings produce.
  const occupancy = {};
  const yearStart = isoDate(addDays(now, -364));
  const yearEnd = isoDate(now);
  for (const screen of screens) {
    const capacity = screen.slotsInLoop ?? 1;
    let slotDays = 0;
    for (const entry of bookedByScreen.get(screen.id) ?? []) {
      const from = entry.start > yearStart ? entry.start : yearStart;
      const to = entry.end < yearEnd ? entry.end : yearEnd;
      if (from > to) continue;
      slotDays += entry.slots * daysBetween(from, to);
    }
    occupancy[screen.id] = Math.min(100, Math.round((slotDays / (capacity * 365)) * 100));
  }

  const revenue = bookings.reduce((sum, booking) => sum + booking.spend, 0);
  const summary = {
    occupancy,
    bookings: bookings.length,
    campaigns: new Set(bookings.map((booking) => booking.campaign)).size,
    cityNotices: bookings.filter((booking) => booking.spend === 0).length,
    revenue,
    byStatus: bookings.reduce((counts, booking) => ({ ...counts, [booking.status]: (counts[booking.status] ?? 0) + 1 }), {}),
    // The true span of the data. A flight that starts on the last booking
    // Monday still runs for its four weeks, so the last end is later than the
    // last start.
    windowStart: bookings.reduce((first, booking) => (booking.start < first ? booking.start : first), isoDate(windowEnd)),
    windowEnd: bookings.reduce((last, booking) => (booking.end > last ? booking.end : last), isoDate(windowStart)),
  };

  return { bookings, creatives, transactions, popLogs, approvalEvents, summary };
}

module.exports = { buildDemoCampaigns, loopShare, bookingImpressions, bookingSpend, PLAYS_PER_DAY };
