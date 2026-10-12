# Results reporting: responses, not only plays

Updated: 2026-10-11

Proof of play says an ad ran. A small business wants to know whether it brought customers. Results now report **responses** beside delivery.

## What is counted, and by whom

| Figure | Source | Label in the product |
|---|---|---|
| QR scans and link visits | Counted by EasyAD at `/go/{code}` | "QR scans and link visits" |
| Promo-code uses | Typed in by the advertiser | "Uses of {code} (you report)" |
| Completed playback reports | Authenticated paired player, authorized historical manifest | "Player-reported completed plays" |
| Manual playback claims | Legacy operator declarations | "Operator-declared completed plays" and "Operator-declared missed plays" |
| Simulated playback | Demo seed and delivery ticks | "Demo plays (excluded)" |
| Estimated views | Current screen audience figure × reserved duration × loop share × reported completed fraction | "Estimated views", with the audience source and "not an audited measurement (COMMB)" |

Cost per scan or link visit is spend ÷ scans and visits. Promo uses remain separate because they may overlap with visits; visits are events, not unique customers.

## Delivery accuracy

The dashboard, `/api/delivery` and printable booking report share one server-generated summary. `booking.pop` and legacy `pop_logs.impressions` do not determine these figures.

- Counts distinguish completed, interrupted and failed authenticated playback reports. Late reports overlap those outcome counts; they are not additional plays. Counts are grouped by creative identity and include both canonical legacy placements and older manifest-associated bookings without a placement.
- Operator declarations never add to player counts. They support estimates only when the booking has no authenticated player outcomes. Demo ticks, new `demo-seed` records and historical `POP-TB-*`/`POP-DEMO-*` fixtures are excluded from estimates, including older fixtures labelled `player-log`.
- Planned plays require a valid reserved schedule snapshot. Scheduled plays to date use the same dates, timezone and local dayparts as the player, including the two portions of overnight and Toronto DST transitions. Contiguous slots form one interval per loop. No historical schedule is reconstructed from current loop settings.
- Nominal scheduled allocation excludes no creative-readiness delays, overrides or downtime. A missing completed report is unknown delivery, not a proven missed play. Authenticated reports establish the software player's claim, not physical panel visibility.
- Estimates require evidence, a reserved schedule and a named current audience source. Unavailable estimates and CPM display `—`, never zero. Zero received reports means no reports were received; it does not prove zero actual delivery. Positive estimates below one view display `<1`; CPM uses the unrounded estimate, full booked spend, only bookings with an available estimate, and keeps cents.
- Reports capture one `asOf` timestamp and exclude later playback and declaration timestamps. The dashboard refreshes every minute and on request; fetch failures clear figures to unavailable. Advertisers see only their bookings, institutions their screens, and operators their delegated screen scope. Responses are private and not cached.
- Campaign-v2 reports use the same schedule calculation, expose outcomes and creative-version groups separately, and retain proof of posting as a separate evidence category.

The pure schedule tests cover dayparts, cutoff dates, malformed snapshots and both DST transitions. Database tests exercise real authenticated ingestion, retry deduplication, historical manifest association, creative replacement and account scope. UI tests cover demo-only unknown delivery, failed requests and refresh recovery.

## Response links

- Each booking has at most one short link, `APP_ORIGIN/go/{code}`. The code is 8 characters from an alphabet without look-alike characters. It never changes, so a printed QR code keeps working when the advertiser changes the destination page.
- `/go/{code}` answers 302 to the advertiser's page. Only `http` and `https` destinations are accepted.
- A response event stores the code and the time. It stores no IP address, cookie, user agent or device identifier.
- HEAD requests, requests without a user agent and known link-preview bots and crawlers are redirected but not counted.
- The advertiser who owns the booking (and Super Admin) changes the link. The screen's owner sees the same figures read-only.

## QR code on an ad

- **Ready-made design:** Make an ad has an optional "QR code on the ad" field. On submission the server creates the booking's link and draws its QR code into the stored ad (bottom right, white tile, "SCAN ME"). The QR SVG comes from the server's own generator (`qrcode`); it is the only markup in the ad that does not pass through the HTML sanitizer, and the renderer refuses anything that is not a plain SVG.
- **Uploaded artwork or print:** Results offers the QR code as an SVG file to place in the design.

## Report

`/report/{bookingId}` is a one-page report to print or save as PDF (the browser's print dialog). It names the source of each figure and the measurement limits. Only the advertiser who owns the booking, the screen's owner and Super Admin can open it.

## Not done

- No promo-code integration with a point-of-sale system; redemptions are self-reported.
- No audience measurement. Estimated views stay an estimate until a screen's figure comes from a COMMB-accredited method; the report says so.
- No sales-lift or attribution model.
