# Results reporting: responses, not only plays

Date: 2026-10-09

Proof of play says an ad ran. A small business wants to know whether it brought customers. Results now report **responses** beside delivery.

## What is counted, and by whom

| Figure | Source | Label in the product |
|---|---|---|
| QR scans and link visits | Counted by EasyAD at `/go/{code}` | "QR scans and link visits" |
| Promo-code uses | Typed in by the advertiser | "Uses of {code} (you report)" |
| Confirmed playback | Operator declaration or authenticated player reports | "Confirmed playback" |
| Estimated views | Screen audience figure × loop share × days × playback | "Estimated views", with the audience source and "not an audited measurement (COMMB)" |

Cost per response is spend ÷ (scans and visits + reported promo uses).

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
