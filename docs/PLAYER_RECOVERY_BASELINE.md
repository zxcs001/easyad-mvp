# P2 scheduling, playback evidence, and recovery

Implementation date: 2026-09-05. This extends the [P0/P1 baseline](PLAYER_PILOT_BASELINE.md) and follows [ADR 0005](adr/0005-player-scheduling-and-evidence.md). Deployment and physical-display qualification are separate from local verification.

## What is implemented

- Operator quote confirmation freezes a visible digital allocation; client acceptance checks capacity under an inventory row lock before committing. Legacy approval uses the same lock/check. Pending inquiries hold nothing. Static acceptance also benefits from ordered inventory locks.
- Each placement reserves one fixed slot per bounded loop; legacy ad-slot quantities are preserved. Dates are inclusive UTC, operating hours are 24 hours daily, with no dayparts. Local-time/DST products are not offered. Existing confirmed campaign-v2 rows without allocations require operator reconfirmation through a new plan/quote rather than silently inventing historical promises.
- Paired manifests combine approved institution media, one approved legacy creative per booking, and the latest assigned campaign creative with exact-version client and operator approval in the same organization. Compatibility placements are not counted twice. Future content within the lease is cached and starts only on its eligible date. Confirmed allocation snapshots survive screen interval changes.
- Only the active media element emits evidence. Images require a loaded, visible interval; videos require an actual ended event inside their reserved interval. Inactive videos are not mounted. Interrupted/failed media never becomes a completed play. A single video restarts; damaged media is skipped; institutional media fills available loop space. Overcommitted historical loops fail closed.
- `POST /api/player/events` uses the paired HttpOnly cookie. Player, historical manifest, asset, placement and exact creative version are server-authoritative. Event/session UUID, sequence, UTC timestamps, duration, size and lease/schedule are validated. Receipt may be up to seven days late, with at most two minutes future clock skew. Duplicate acknowledgments are stable; payload/sequence collisions are rejected. Events and derived issues commit together.
- `GET /api/player/assets/[id]` authorizes the creative against the paired manifest and streams stored bytes through the existing media storage adapter. No expiring S3 URL is used as an offline cache key. Campaign bytes are SHA-256 checked before use.
- The old shared-token `/api/delivery-events` endpoint returns **410**. Public previews retain their read-only contract and never emit player evidence.
- Campaign reports separate authenticated events, interruptions, unverifiable evidence, late transport and legacy reports. Reconciliation compares nominal allocations with reported completions, labeling missing reports **unknown**, never proven missed. Nominal allocation is not a billing metric and does not subtract alert interruption or creative-readiness delays. Audience figures remain estimates.
- Legacy proof declarations and demo ticks retain separate provenance. New manual submissions are labeled `operator-declaration`. Existing `verified` values are not relabeled as measured views. New player evidence records carry a seven-year retention date under ADR 0003; no destructive retention job is introduced.

## Supported offline runtime

The pilot target remains a dedicated foreground Chrome window on Windows, over HTTPS (localhost is accepted for development). IndexedDB, Web Locks and a service worker are required. Only one tab per browser profile runs the player. Pair in a dedicated profile; browser profiles are not an institutional authorization boundary.

The service worker caches only the player shell and versioned Next assets; API responses and credentials are never cached. Media blobs and the active manifest are switched in one IndexedDB transaction. A synchronous/quota write failure aborts that transaction and preserves the old cache. Corrupt assets cannot earn successful evidence. Approved public media must be same-origin or allow browser CORS downloads.

At startup the player restores the valid cached manifest and media before polling the server. It can therefore show the cached rotation without a connection; when online, polling replaces it with a newly authorized revision. No valid cache, expired lease, or an ineligible campaign date produces a neutral fallback rather than an old ad.

HTML creatives use the same media cache. The `/player` page alone permits local `blob:` fetches and frames in its Content Security Policy, so it can validate a downloaded HTML blob and display it again after an offline renderer restart. The creative remains in a sandboxed iframe with its own restrictive document policy. A browser check exercises an approved, sanitized HTML ad before and after an offline restart.

Before relying on an offline screen, keep `/player` online until Screen control shows the published revision received, prepared, and applied with no media or storage error. In the managed display profile, disconnect the network, restart the player page, and confirm the scheduled ad still renders. Reconnect and confirm queued playback reports synchronize. Repeat this drill on the actual hardware; server acknowledgments alone do not prove that the browser shell or display panel survived a restart.

Limits:

| Resource | Limit / behavior |
|---|---|
| Active media | 256 MiB total; streamed downloads reject excess bytes |
| Shell | Player document plus at most 200 versioned Next assets |
| Event outbox | 50,000 entries, including quarantined records; stable IDs and acknowledgment-based removal |
| Minimum scheduled slot | 2 seconds; even a short video waits for its reserved slot before advancing |
| Default offline lease | 24 hours for public ads; 60 seconds for private screens |
| Configurable public lease | `PLAYER_OFFLINE_LEASE_SECONDS` between 60 and 86400 seconds |
| Arrival window | Seven days; invalid/colliding records retained in bounded quarantine |
| Retries | Conditional polling with jitter and bounded backoff; outbox follows heartbeat retry cycles |

The 256 MiB budget covers media, not IndexedDB overhead or the event outbox. Reserve at least 512 MiB of available origin storage for the pilot and confirm browser storage persistence on the actual device. At the two-second minimum, 50,000 entries cover more than 24 hours of one event per slot. Browser eviction, deleting site data, or disk failure can destroy local records; those are not durability guarantees.

A completed event is durable before the rotation advances. Crash recovery preserves committed outbox entries and stable acknowledgments; an unfinished interval at process termination is not claimed as successful. Storage/outbox failure pauses playback with a visible error. An operator must free storage or export/resolve quarantined records before restarting; do not blindly delete unacknowledged evidence.

Alerts retain cached ordinary content, suppress it while active, and let eligible content resume on expiry offline. Campaign date boundaries and manifest expiry produce a neutral fallback, including after reload. Runtime expiry has a monotonic deadline; persisted observations detect backward clock changes beyond two minutes. A managed clock is still required for qualified pilot evidence.

## Stop and rollback

Disconnected hardware cannot receive immediate cancellation. **The configured lease is the maximum intended offline delay for unpublish, revoke or feature shutdown**, plus browser scheduling latency. The 24-hour public default favors offline ad continuity and can delay those changes for up to a day; private screens retain a 60-second cap.

Online 401/404 responses clear the active manifest/media and return to pairing/disabled state. The outbox is retained under its original player identity and is never reassigned to a replacement player. To roll back, disable `FEATURE_PLAYER_CONTROL`, retain additive schema and evidence, and wait for outstanding offline leases to end. Do not re-enable the old shared-token ingestion boundary.

## Reproduce verification

Use the Node runtime and isolated local test database described in the P0/P1 guide. Payments remain disabled.

```powershell
npm run test:pilot
npm run build
npm run test:pilot:e2e
$env:PILOT_CAMPAIGN_FLAGS='false'
npm run test:pilot:e2e
Remove-Item Env:PILOT_CAMPAIGN_FLAGS
$env:PLAYER_OFFLINE_LEASE_SECONDS='86400'
npm run test:pilot:e2e -- e2e/player-recovery.spec.ts
Remove-Item Env:PLAYER_OFFLINE_LEASE_SECONDS
```

The recovery browser test generates a real WebM, rotates it with a valid and a corrupt image, disconnects the browser, restarts the renderer from the cached shell, then verifies synchronized event uniqueness. A second scenario injects a cache quota failure, verifies atomic rollback, resumes after recovery, and checks offline alert and lease expiration with the browser clock. Advancing a clock checks a boundary; it is **not a real 24-hour soak**.

Unit/integration coverage includes concurrent confirmation, exact approval eligibility, scoped event ingestion, idempotency/sequence collisions, revoked credentials, atomic issue-write failure and retry, timestamp/duration checks, UTC boundaries, hidden-image interruption, video restart, failed assets and outbox failure.

## Local verification record

2026-09-05, Windows / Node 24 / Chrome / isolated PostgreSQL test schema:

| Check | Observed result |
|---|---|
| Full unit/component/database suite | 176 passed across 55 files; zero skips |
| Production build and TypeScript | Passed |
| Full browser suite, campaign/agency/static flags enabled | 16 passed |
| Full browser suite, campaign/agency/static flags disabled | 16 passed |
| Recovery scenarios with explicit 86400-second lease | 2 passed; simulated clock boundaries, not a 24-hour soak |
| Strict UI audit | Zero errors, warnings or unresolved findings |
| Visual inspection | Offline restored content, styled expired fallback, existing French/reflow checks |
| Diff whitespace check | Passed with repository Windows line-ending handling |

The strengthened startup-cache checks were run after visual inspection found a missing offline stylesheet; they assert both decoded offline content and the fallback’s computed grid layout. Temporary test servers were stopped after verification. No deployment or commit was performed. Machine-readable summary: [P2 local verification](verification/p2-local-verification.json).

## Release checks still required

- Run a wall-clock 24-hour mixed-media soak on the actual managed display within a 24-hour lease. Record cache/outbox size, crashes, thermal/power behavior and post-reconnect event counts. Repeat with a real process/power restart. Keep an independent visual observation log.
- Validate kiosk startup, HTTPS, muted autoplay, persistent profile/storage, device clock, power recovery, disconnected alert expiry and hardware connectivity.
- Native Canadian French review of new operational copy.
- Rehearse additive migration and rollback in deployment infrastructure. The pre-existing obsolete `next lint` command still needs a separate tooling migration; TypeScript, production build and strict UI audit are the working gates.

No physical-panel visibility, audience measurement, billing SLA or production-readiness claim follows from the local browser tests.
