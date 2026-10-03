# Local browser walkthrough — September 30, 2026

Tested the current working tree at `http://localhost:3001` through the browser as a newly registered advertiser. No unit tests, automated test scripts, direct API requests, or database queries were used to verify the flow. The empty development database was prepared with the repository's fictional demo fixtures before registration.

## Browser results

| Scenario | Observed result |
|---|---|
| Register a fresh advertiser | Account created; advertiser home opened. |
| Discover inventory | Digital screens and the static billboard were selectable; map legend contained device markers only. |
| Request static billboard dates | Future dates led to upload-only Creative Studio; no fixed-template choice. |
| Enter past dates | After the fix, a specific explanation appeared and Continue was disabled. |
| Submit a file named JPEG containing text | Server rejected it with the specific file-content/MIME mismatch explanation; selected file remained available to replace. |
| Replace invalid artwork with a valid PNG | Submission succeeded and campaign entered creative review. |
| Create another static campaign from screen discovery | Valid PNG submission returned to Your campaigns with pending-review artwork. |
| Create a digital campaign | Edited template HTML, saw its preview, submitted it, and returned to Your campaigns with creative-review status. |
| Inspect fixed output fields | Format, width, and height carried read-only attributes. |
| Inspect HTML editor | Rendered approximately 474 px high with vertical resizing enabled. |
| Cancel from Creative Studio | Returned to screen selection, unlocked navigation, removed the cancelled request from campaign list and booked totals. |
| Reload campaigns | Submitted campaigns persisted; cancelled campaign remained absent. |
| Sign out and sign in again | Fresh account could sign in; submitted campaigns remained visible. |

## Issues found and fixed

- Fixed July date defaults accepted an expired campaign and then led to an empty, locked Creative Studio. Defaults now start tomorrow and run for fourteen days. Both booking UI and server reject past start dates and invalid date ranges; the empty studio also provides an exit.
- Successful submissions outside the creation session stayed in an empty editor. Successful submissions now return to Your campaigns.
- Campaigns awaiting review or already expired offered Edit even though the server would not accept artwork. Campaign actions now explain their state; the content library only offers editing when submission is allowed. A selected ineligible campaign cannot silently fall back to a different campaign.
- Cancelled requests still appeared in discovery/booking timelines and some totals. These surfaces now exclude cancelled requests.
- A stale upload error stayed visible after selecting replacement artwork. Selecting a new file now clears it.
- One public portal description still advertised competitor-presence discovery. Removed that claim and updated its French translation.

This walkthrough covers static PNG artwork, digital HTML templates, invalid JPEG content, account access, date validation, and cancellation. PDF, MP4, payment, operator approval, and optional campaign-model-v2 flows were not exercised.

The pre-fix expired request remains as local QA data, alongside the successful campaigns. No live-site deployment was performed.
