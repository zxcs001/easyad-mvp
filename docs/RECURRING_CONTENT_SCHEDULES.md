# Recurring content schedules

Implemented October 11, 2026 for institution screen images and videos.

## Using schedules

Open **Media library / Content**, select a device resource, and use **Recurring content schedule**. The command centre also links to **Content schedules**.

- Choose always available, every day, or selected weekdays.
- Set all-day playback or a start and end time, with an IANA timezone. Canadian zones and UTC are suggested; other valid zones are accepted.
- Optionally set a first and last local date. These dates are inclusive.
- Save, pause, or resume. Selecting always available removes the recurring rule.

An end time earlier than its start crosses midnight. For example, Friday 22:00–02:00 plays Friday night through Saturday at 01:59:59, including the overnight tail of the final Friday. Weekdays and dates identify when each window starts. Starts are inclusive and ends exclusive. The existing absolute start/end timestamps also apply.

Daylight saving uses the selected zone's wall clock. Missing spring-forward times never occur; repeated fall-back times are eligible on both occurrences. The machine's timezone does not change the rule.

Owners and super admins may change schedules within their screen permissions. Delegated operators may edit only their assigned screens; their edits return the resource to pending review, removing it from playback until approved. Owner review shows the recurring hours, weekdays, timezone, date bounds, and pause state. Review from the UI checks the resource revision to reject stale decisions.

## Delivery and persistence

`media_resources.recurring_schedule` is nullable JSONB. Existing content has no recurring restriction. `PATCH /api/media/:id/schedule` accepts `{ schedule, revision }`, validates all rule fields, and atomically increments the media revision. Conflicting saves return 409; successful changes write a fleet audit record. Normal schema initialization adds the column idempotently.

Authenticated manifests include upcoming approved resources and their rules so assets can be cached before the window begins. Rules change the manifest revision while preserving asset identity, allowing cached files to be reused. The player evaluates recurrence locally every 500 ms, including offline. Cutoff interruptions are recorded separately from completed plays; server validation allows at most one second of cutoff detection delay for interruptions. Malformed or unsupported cached rules fail closed. Emergency overrides retain precedence.

Public media feeds and anonymous file downloads expose only content currently eligible under its recurring and absolute windows. Feed positions are renumbered after filtering. The full public device view evaluates windows locally and refreshes server content every ten seconds. Authorized staff can still preview their own files outside a window. Fleet announcement copies retain the source's recurrence and apply the target's additional absolute dates.

## Scope and limits

Each resource currently has one weekly time window, with every day as a shortcut. Multiple windows, holiday exceptions, a calendar timeline, and recurrence for paid advertiser campaigns are separate additions. Advertiser dayparts and capacity reservations keep their existing rules.

An offline player can follow the last received schedule only while its manifest lease is valid. New edits, pauses, revocations, and emergency instructions require connectivity; they cannot instantly change a disconnected player. Public screen leases are at most 24 hours, and private screen leases remain at most 60 seconds. The device clock must be correct. Assets still undergo the existing cache and decoding checks.

## Verification

Automated coverage checks local weekdays and date limits, overnight tails, midnight, multiple zones, both daylight saving transitions, malformed rules, pause/resume, absolute-window intersections, cutoff evidence, optimistic conflicts, permissions, approval, audit records, public visibility, manifest updates, and fleet copies. Browser verification covers real upload, saved-rule restoration, desktop/phone controls, pause/resume, and cached content starting and stopping with the network disconnected.

See [desktop](verification/recurring-content-desktop.png), [phone](verification/recurring-content-phone.png), and [offline player](verification/recurring-content-offline.png).

October 11, 2026: all 477 regression tests passed. The final public-feed and approval checks passed, the production build passed, and both Chrome scenarios passed (saved schedules/offline windows and operator edits/owner review).
