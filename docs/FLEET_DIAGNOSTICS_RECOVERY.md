# Kiosk fleet diagnostics and recovery

Implemented for the existing authenticated browser display at `/player?kiosk=1`. No native player or device-management service is required for the browser actions.

## Use

Enable `FEATURE_PLAYER_CONTROL=true` and apply the additive database schema with the project's normal migration workflow. For the fleet dashboard, also enable `FEATURE_FLEET_OPERATIONS=true`. The same diagnostics and single-screen actions appear in **Screen control** without the fleet feature.

Open **Fleet tools → Kiosk diagnostics** at `/government?view=fleet`. Select explicit screens for bulk recovery, or use the buttons on an individual screen. Owners/admins can recover; scoped operators can view their permitted screens. The dashboard refreshes every 15 seconds. Browser reports arrive on the existing heartbeat interval (30 seconds by default); stale contact uses the existing configured threshold (90 seconds by default).

The report includes server contact and report timestamps, expected/applied content revisions, browser/version/platform, viewport, kiosk/visibility/fullscreen state, wake lock, playback progress, clock difference, cached media, stored playback reports, storage usage/quota and offline shell readiness. Unknown or stale diagnostics require attention. Native Chrome `--kiosk` can be fullscreen without using the DOM fullscreen API; that API's false value alone is not a fault. Healthy browser telemetry is not physical proof that a panel is lit.

## Recovery actions

| Action | Behavior |
| --- | --- |
| Refresh content | Fetch the current authorized manifest, prepare it and restart the ordinary rotation. Reuse valid cached media. |
| Reload kiosk page | Claim the command, save a session receipt and reload the same URL/profile. Report completion from the next running document after content is available. |
| Rebuild media cache | Download and prepare fresh current media, atomically replace the cache and display URLs. Failed download/decode preserves the prior ordinary cache when that content remains authorized. |

Pairing, quarantined evidence, pending playback reports and schedule rules are preserved. Heartbeats continue during recovery downloads and evidence uploads, and preparation aborts at command expiry or when a newer manifest supersedes it. Existing removal, privacy and unpublishing rules can require clearing old content before preparing its replacement. Recovery does not publish private/unapproved content, extend an offline lease, cancel an emergency, reboot the OS, or erase browser site data. An active emergency retains priority and the ordinary fallback under its original lease.

The player also monitors visible ordinary playback progress. An overdue rotation is restarted locally, with at most three attempts in ten minutes per browser tab, including across document reloads. Intentional loop waits, scheduled gaps, hidden pages, emergencies, unpublished screens and storage pauses do not trigger this recovery. It requires a functioning JavaScript event loop.

## Command lifecycle and permissions

Commands progress **queued → received → reported complete / failed**. A queued label means only that the server stored the request. Commands expire after 15 minutes and target the currently paired player ID, so re-pairing cannot deliver old commands to a replacement. Received commands are not redelivered; if a response/process is lost, completion may remain uncertain until expiry. A reload receipt lets the next document acknowledge a claimed reload without a loop.

There is one pending command per player, a maximum of five requests per player in ten minutes, UUID request-key deduplication, explicit limits of 100 bulk targets and separate results for each target. Queuing is recorded in fleet audit; the latest five command results appear with the player. Owner requests use the existing session/CSRF controls; receipt/results use only the paired HttpOnly credential. Fleet responses do not include that credential or its hash. Diagnostic fields are validated and bounded, and arbitrary URLs/text are discarded.

## When the browser cannot receive recovery

1. Check the server contact timestamp. Offline browsers cannot receive commands; retry after fixing connectivity. Expired queued commands are not executed on reconnect.
2. Check power, network and the display's dedicated profile on site. Reuse the same profile and origin to retain pairing and cached content.
3. On Windows, the optional `-Watch` launcher relaunches its dedicated Chrome process after an exit, bounded to five relaunches in ten minutes. Configure startup after reboot separately. See [Chromium kiosk setup](CHROMIUM_KIOSK.md).
4. If playback reports cannot be persisted, playback pauses. Rebuilding media does not delete evidence to make room. Investigate storage/profile policy and server report rejection before clearing anything.
5. If JavaScript/the browser is frozen, a panel is off or the OS needs rebooting, browser commands cannot fix it. A process supervisor/managed device setup or site assistance is required. Android startup/relaunch remains a device-management concern.

## Verification

Automated coverage includes diagnostic validation/freshness, deliberate wait handling, local restart budgets, storage timeout, owner/scoped operator boundaries, foreign-player rejection, idempotent retries, expiry, rate limits, revocation/re-pairing, and partial bulk results. The Chromium browser scenario exercises real paired telemetry and all three remote actions; it verifies fresh asset downloads, new display URLs, document reload, preserved credentials/evidence, expired offline commands and failed-rebuild offline restoration.

Local verification on 2026-10-11: **502 tests across 97 files**, TypeScript and the production build passed. Chromium checks passed for the fleet recovery flow, desktop/emulated Android kiosk controls, mixed-media report synchronization, emergency-photo restoration, quota/lease expiry and recurring-content scheduling. The final fleet flow also checks continuing contact during slow downloads/uploads and the configured heartbeat interval after reload. [Desktop dashboard](verification/fleet-diagnostics-desktop.png), [phone dashboard](verification/fleet-diagnostics-phone.png), [offline recovery](verification/fleet-recovery-offline.png).

Physical Android/Windows power, startup, browser-process relaunch and panel visibility still need qualification on the deployed devices. The PowerShell watcher has not been executed on this macOS development machine.
