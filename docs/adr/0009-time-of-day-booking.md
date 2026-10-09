# ADR 0009: Time-of-day booking in local time

- Date: 2026-10-09
- Status: Accepted for the advertiser booking flow (the `bookings` table). Campaign-v2 placements stay all day.
- Authority: Yuchen asked for easier scheduling: quick date picking, budget-first booking and time-of-day slots
- Supersedes: the "no dayparts, UTC only" rule in [ADR 0005](0005-player-scheduling-and-evidence.md), for bookings that choose slots

## Context

ADR 0005 sold one fixed slot in the loop, all day, on UTC dates. It rejected dayparts until local time had a defined rule, so it did not have to guess daylight-saving offsets.

A small business buys the hours its customers pass the screen. A café wants mornings. A restaurant wants evenings. Self-serve DOOH marketplaces let a buyer pick the time of day and pay for it alone. An all-day price makes a short budget run for very few days.

## Decision

### Five fixed slots

| Slot | Toronto time | Share of the daily rate |
|---|---|---|
| Morning | 06:00–10:00 | 25% |
| Midday | 10:00–15:00 | 25% |
| Afternoon drive | 15:00–19:00 | 25% |
| Evening | 19:00–23:00 | 15% |
| Overnight | 23:00–06:00 | 10% |

- The shares add up to 100%, so all day costs the existing daily rate. Old prices do not change.
- A slot includes its start minute and excludes its end minute.
- Choosing every slot is stored as all day (an empty list). One schedule has one representation.
- The slots and shares live in `DAYPARTS` in [`app/lib/booking-schedule.ts`](../../app/lib/booking-schedule.ts). Operators cannot change them yet.

### Local time

- A booking with slots stores `model: "daypart-slot-v1"`, `timezone: "America/Toronto"` and its slots in the allocation snapshot. Its start and end dates are Toronto dates.
- `Intl.DateTimeFormat` with the `America/Toronto` zone converts an instant to the wall-clock date and minute. It applies daylight saving time, so nothing guesses an offset.
- The overnight slot is a time-of-day rule. On the first date it plays from 00:00 to 06:00; on the last date it plays from 23:00 to 24:00.
- An all-day booking keeps `fixed-slot-v1` on UTC dates. Existing records are not reinterpreted.

### Capacity

- Each slot has its own loop. A morning booking and an evening booking never share airtime.
- An all-day commitment (every existing booking and every campaign-v2 placement) occupies all five slots.
- The server check (`checkDigitalCapacity`), the booking API, the client check and the public calendar read the same rule from `booking-schedule.ts`.

### Playback and evidence

- The manifest carries the allocation. `slideEligible` uses the local slot rule, so the paired player starts and stops a slot on its own, offline as well.
- Playback evidence must start and end inside the slot. A play that crosses a slot boundary is refused, as a play that crosses a date boundary already is.
- The public device page and the public media API show a slot booking only while its slot runs.
- Audience and play estimates scale by hours on screen (`hours / 24`). No hourly audience data exists, so this is an estimate by time, not a measured audience by hour.

### Booking calendar

`GET /api/inventory/{id}/availability` returns confirmed loop time for a marketplace screen: dates, seconds and slots only. It returns no advertiser, campaign or price. Pending requests hold no time (ADR 0003), so they are not listed.

## Consequences

- One additive column: `bookings.dayparts TEXT[] NOT NULL DEFAULT '{}'`. Run `npm run db:migrate`.
- Screens outside Ontario's Eastern zone (for example Kenora, in Central time) use Toronto time until a per-screen time zone exists. The booking form says "Toronto time".
- Campaign-v2 placements, the operator quote and the reports do not offer slots yet.

## Rejected alternatives

- **Price by hours alone.** Evening and overnight hours would cost as much as the morning commute. Fewer people pass, so the shares weight the peak.
- **Free-form hours.** Every pair of bookings would need an interval overlap check. Five fixed slots keep the check simple and the choice simple for a first-time buyer.
- **Per-screen time zones now.** Every demo and pilot screen is in Eastern time. The snapshot stores the zone, so a later change does not reinterpret old bookings.
