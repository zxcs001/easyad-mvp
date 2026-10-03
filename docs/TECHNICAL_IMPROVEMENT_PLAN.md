# EasyAD technical improvement plan

Date: 2026-09-04  
Status: P0/P1 implemented and verified locally; P2 software implemented and locally verified; physical 24-hour acceptance remains open; P3 software implemented and locally verified; P4 software implemented and locally verified with the user-approved identity-provider rollout gate; P5 remains planned. No production deployment performed.  
Goal: Run a real pilot in which advertisers can buy digital and static placements, operators can fulfill them, and institutions can reliably control their screens.

## 1. What to do now

Start with one complete device-delivery workflow: enroll a player, publish content, let the player retrieve it automatically, and show its acknowledgment in the owning institution's workspace. Then extend that workflow to playback evidence and offline recovery.

Keep the current Next.js, PostgreSQL, and S3 architecture. Use additive migrations and small end-to-end changes. A framework rewrite, microservices migration, payment gateway, or AI campaign generator is not a prerequisite.

This plan supplements the [existing development plan](DEVELOPMENT_PLAN.md). It does not reset its completed checkboxes or supersede the accepted [operating policy](adr/0003-provisional-operating-policy.md). Existing features should be exercised and repaired before being rebuilt.

## 2. Evidence and limits of this assessment

The following observations come from source inspection, not a deployed-system audit or real-device test.

| Area | Existing foundation | Next verification or improvement |
|---|---|---|
| Campaigns and static fulfillment | Campaign, placement, creative review, production, work-order, and proof routes exist; the development plan marks phases 0–6 implemented | Exercise complete workflows with flags on and off; record actual failures instead of assuming implementation means release readiness |
| Browser display | `app/devices/[id]/page.tsx` supplies content and the active alert to `device-screen.tsx` | The inspected rendering components do not implement periodic content retrieval, enrollment, heartbeats, or playback-event submission; verify any external player integration before adding one |
| Emergency overrides | Screen-only alerts, target selection, and local expiration handling already exist | Verify delivery of newly created alerts and early cancellation to a display that remains open |
| Delivery ingestion | `app/api/delivery-events/route.ts` accepts idempotent events behind the campaign flag | Replace shared-token trust with player-scoped authorization; validate schedule and creative associations; make event/issue persistence atomic |
| Legacy delivery evidence | `app/api/bookings/[id]/pop/route.ts` accepts operator-submitted play counts and derives impression estimates | Preserve provenance; distinguish manual declarations, authenticated player reports, and demo records |
| Analytics | `app/api/metrics/funnel/route.ts` aggregates activity actions and campaign states | Counts alone do not establish conversion funnels or elapsed-time metrics; reconcile with the older baseline document |
| Feature availability | Campaign, agency, static fulfillment, and payments flags default off | Record the active configuration in each environment without exposing secrets |

Relevant contracts: [README](../README.md), [UX contract](../UX-CONTRACT.md), [product decisions](PRODUCT_DECISIONS.md), [baseline metrics](BASELINE_METRICS.md), and [schema](../database/schema.sql).

## 3. Delivery order

Effort estimates are planning ranges for one experienced full-time developer with access to a test database and pilot hardware. They exclude procurement, native-language review, and external identity-provider setup. Revise after the first baseline run; later items may extend beyond 90 days.

| Priority | Work package | Estimate | Depends on | Exit outcome |
|---|---|---|---|---|
| P0 | Establish an executable baseline | 2–3 days | None | Known feature configuration, reproducible tests, and a documented device target |
| P1 | Authenticated players, automatic updates, and acknowledgments | 5–8 days | P0 | A remotely published revision reaches a paired screen without reload |
| P2 | Scheduling, offline recovery, and credible playback evidence | 8–12 days | P1 | Delivery survives tested failures and reports actual player events |
| P3 | Advertiser and static fulfillment pilot | 8–12 days | P0; P2 for real digital evidence | A mixed campaign reaches completion with separate delivery proofs |
| P4 | Institutional operations and publishing policy | 7–10 days | P1–P2 | Staff can safely operate a scoped fleet and track alert acknowledgments |
| P5 | Measurement and release hardening | 5–8 days | P2–P4 | Measured pilot outcomes, operational runbook, and staged release gates |

Add instrumentation and authorization checks within each work package, rather than postponing them all until P5.

## 4. P0 — Establish an executable baseline

Completed locally on 2026-09-05. See the [reproducible baseline, capability matrix, and verification record](PLAYER_PILOT_BASELINE.md). Physical kiosk qualification and production release checks are explicitly separate from the local completion evidence.

- [x] Run existing unit/integration tests, production build, and browser tests against the documented test database. Record command, environment, result, and date; distinguish unavailable infrastructure from failing assertions.
- [x] Exercise advertiser, operator, institution, and admin accounts with campaign/agency/static flags enabled in development. Also verify legacy behavior with those flags disabled. Keep payments off.
- [x] Trace the current public player, third-party media API, and any external player integrations. Select one supported pilot hardware/browser configuration and record autoplay, storage, kiosk startup, and networking constraints.
- [x] Create a capability matrix: implemented, exposed by configuration, verified, and blocked. Reconcile contradictory status statements across the development plan, UX contract, and baseline metrics only after verification.
- [x] Establish one test screen, one static face, one mixed campaign, and two separate institutions for isolation tests. Exclude their activity from production analytics.

Acceptance: another developer can reproduce the environment and list the exact remaining failures. No feature is labeled production-ready solely because its route or table exists.

## 5. P1 — Connect the publishing dashboard to real players

Completed locally on 2026-09-05 under [ADR 0004](adr/0004-authenticated-browser-player.md). The feature defaults off and can be enabled in a pilot with `FEATURE_PLAYER_CONTROL=true`. The recorded local p95 is 10.793 seconds for five publication updates with ten-second polling; this is an applied acknowledgment, not proof of play.

### Implementation

- [x] Introduce a registered player identity distinct from a sellable inventory unit. Initially bind one active player to one digital screen; preview sessions never count as delivery devices.
- [x] Add owner-authorized pairing using a short-lived, single-use code. Issue a device-scoped credential, store only its verification hash server-side, and support revocation and re-pairing. Never put credentials in URLs or the public display page.
- [x] Add an authenticated player runtime or route separate from the public preview/display contract. The public media API remains read-only and must not grant device-event authority.
- [x] Generate a versioned playback manifest using canonical content approval, ownership, publication state, and campaign eligibility. Share eligibility logic rather than creating a second set of approval rules.
- [x] Include immutable creative references, ordering, duration, schedule boundaries, display language/template, active overrides, and manifest validity. Handle content removal and screen unpublishing explicitly.
- [x] Start with conditional HTTP polling using ETags, jitter, and bounded retries. Proposed pilot defaults: poll every 10 seconds, heartbeat every 30 seconds, and mark connectivity stale after 90 seconds. Make thresholds configurable and measure them on hardware.
- [x] Separate downloaded/validated manifest acknowledgment from playback acknowledgment. Preserve last-known-good content until a replacement is usable, except where an explicit stop/revocation rule requires a safe fallback.
- [x] Expose last contact, expected revision, acknowledged revision, and last playback/error time to authorized owners. A heartbeat establishes connectivity, not that the physical panel is illuminated.

### Proposed additive data and API boundaries

Names below are design proposals to reconcile with existing schema and conventions before implementation.

| Boundary | Purpose |
|---|---|
| `players` and credential records | Owning organization, inventory binding, enrollment, credential version, revocation, and software version |
| `player_manifests` | Immutable manifest revisions, content references, validity, and publication metadata |
| `player_state` / bounded heartbeat history | Latest contact, fetched/acknowledged revision, health summary, and last error |
| `POST /api/players/pair` | Rate-limited redemption of a single-use pairing code |
| `GET /api/player/manifest` | Resolve the authenticated player's manifest; never trust an arbitrary tenant ID from the request |
| `POST /api/player/heartbeat` | Update server-observed liveness and validated player state |
| `POST /api/player/acknowledgments` | Idempotent receipt/application acknowledgment of an authorized manifest revision |

Use database-backed state across ECS tasks. In-memory registries must not become authoritative.

### Acceptance

- [x] A paired, continuously open screen receives approved content, edits, deletion, and unpublishing without manual reload.
- [x] Pilot target: publication to applied acknowledgment is within 30 seconds on a healthy connection; report measured p95 and sample size. This is a proposed target, not a current SLA.
- [x] Institution A cannot pair, fetch manifests, or submit events for institution B's player.
- [x] Expired/reused pairing codes and revoked credentials fail; public preview visits do not create delivery evidence.
- [x] Connection loss produces a stale/unknown state, and reconnection restores current state without duplicate mutations.

## 6. P2 — Reliable scheduling, playback evidence, and recovery

Software implementation follows [ADR 0005](adr/0005-player-scheduling-and-evidence.md). See [P2 recovery setup, verification, and release gates](PLAYER_RECOVERY_BASELINE.md). A physical 24-hour soak is still required; clock-boundary simulation does not satisfy that hardware acceptance.

### Scheduling and evidence

- [x] Trace how confirmed campaign-v2 placements enter the manifest. Define one authoritative schedule compiler so legacy bookings and new placements cannot duplicate or disagree about delivery.
- [x] Snapshot the promised digital allocation: duration, loop/share allocation, dates, operating hours, timezone, and any daypart rules. Choose the initial supported allocation model in an ADR before selling it.
- [x] Validate capacity server-side at confirmation; use transaction/concurrency protection to prevent overselling. Preserve inquiry/no-hold policy from ADR 0003.
- [x] Extend `digital_delivery_events` rather than creating a competing proof table. Require authenticated player association, creative version, authorized manifest/placement reference, event ID, sequence/session identity, occurrence time, and server receipt time.
- [x] Report image display intervals and video completion/failure from the active media element. Hidden slides, failed assets, interrupted ads, previews, and downloads must not create successful plays.
- [x] Validate event shape, size, timestamp bounds, duration, player binding, and historical schedule association. Explicitly handle clock skew and late offline events.
- [x] Persist delivery events and derived issues atomically; ensure idempotent retries also recover issue creation. Return a stable acknowledgment for duplicates.
- [x] Reconcile expected versus reported delivery, distinguishing missed, late, partial, and unverifiable outcomes. An absent heartbeat or event does not prove a particular ad was displayed or missed.
- [x] Label legacy operator declarations and demo ticks separately. Keep estimated impressions distinct from player-reported plays and never relabel historical estimates as measured views.

### Offline runtime

- [x] Cache complete manifests and required media on the selected supported runtime. Validate assets before activation; use atomic manifest switching and a documented storage budget.
- [x] Store media bytes where appropriate; caching an expiring S3 URL alone does not provide offline playback. Refresh media access while online without invalidating usable cached assets.
- [x] Persist an event outbox with bounded growth, retry backoff, stable IDs, and acknowledgment-based deletion. Test process restart as well as temporary network loss.
- [x] Enforce campaign end times and alert expiration offline. Do not reactivate expired content after restart. Use an approved neutral fallback when nothing remains eligible.
- [x] Define manifest expiry/offline lease limits for stop, unpublish, credential revocation, and private content. Disconnected hardware cannot receive immediate cancellation; document that bound and avoid claiming otherwise.
- [x] Recover from corrupt downloads, full storage, failed videos, expired media URLs, and player restart. If browser storage cannot meet the pilot requirement, select an existing compatible player or a managed runtime after a bounded hardware spike.

### Acceptance

- [ ] A scheduled mixed-media rotation runs for a proposed 24-hour offline pilot test within its authorized validity window, then synchronizes events without duplicate counts.
- [x] Restart during playback/outbox transmission loses neither acknowledged state nor unacknowledged evidence within the documented storage limit.
- [x] A broken asset does not stall the entire rotation; a single-video playlist loops correctly and inactive videos do not generate events.
- [x] Online alert creation/cancellation reaches an already-running screen; alert expiry works while offline and ordinary eligible content resumes.
- [x] Concurrent scheduling cannot exceed configured capacity. Timezone and daylight-saving boundaries are covered.

## 7. P3 — Complete advertiser and physical-billboard workflows

Completed for local software acceptance on 2026-09-05. See [P3 implementation, verification, and pilot limits](ADVERTISER_STATIC_PILOT_BASELINE.md). Physical installation and the P2 hardware soak remain separate release checks.

- [x] Exercise existing campaign planning with digital and static inventory, accurate availability, quote confirmation, and recorded offline acceptance. Fix missing connections instead of building another booking model.
- [x] Show media, design, printing, installation, and removal costs separately. Preserve immutable confirmed quote lines and versioned placement specifications.
- [x] Verify the three creative paths: supplied artwork, design request, and artwork later. Missing artwork must remain a visible launch blocker with a responsible person and due date.
- [x] Verify exact-version client approval and separate operator approval. Prevent an unapproved replacement file from inheriting approval accidentally.
- [x] Harden static transitions: print preparation, production, installation assignment, completion evidence, client-visible proof, and removal/replacement. Static placements become live only after installation confirmation.
- [x] Make existing field tasks usable on a phone: assigned jobs, scoped access instructions, photo upload/retry, completion time, issue reason, and reschedule. Keep proofs private unless explicitly shared with the client.
- [x] Exercise weather/access delays, partial completion, failed uploads, duplicated completion requests, and conflicting edits. Preserve submitted work and server-authoritative status.
- [x] Provide one campaign readiness/report view that keeps static proof of posting and digital playback evidence separate, with placement-specific next actions.
- [x] Add repeat-campaign creation only after the first flow passes; force fresh availability, quote, schedule, and specification checks.

Acceptance: a pilot advertiser completes one static placement and two digital placements from plan through reporting; a delayed installation stays visibly blocked while the digital placements can proceed independently. Another organization cannot access the quote, creative, access notes, or proof photos.

## 8. P4 — Institutional fleet operations

- [x] Add or verify screen grouping by building/department, bulk scheduling with partial-failure results, reusable announcements, and content start/end times.
- [x] Preserve institution-owner direct publishing and delegated-operator approval behavior. Apply server-side capabilities to group actions and individual records alike.
- [x] Add alert receipt/playback status per targeted player, explicit stale/offline targets, expiration, early cancellation, and restoration status. Never imply delivery to official public-alert networks.
- [x] Record actor, target scope, content revision, priority, timestamp, and result for sensitive publishing and permission changes. Keep alert bodies and private content out of operational logs.
- [x] Design private-network access separately from advertising eligibility. A screen excluded from the marketplace is not automatically private if its media remains accessible through public URLs.
- [x] Before enabling private content, verify authenticated runtime access, private asset delivery, cache/lease behavior, and denial from public profile/device-media endpoints. Preserve current public compatibility until explicit migration rules exist.
- [x] Prepare explicit owner opt-in for advertising participation, category restrictions, and reserved institutional airtime. Do not automatically list institution-owned screens as sellable inventory.
- [x] Document priority and interrupted-delivery accounting. Block only commercial interruption compensation behavior until the applicable policy is decided; do not invent credits or payment actions.
- [x] Scope sessions/memberships and audit revocation. User-confirmed exception: no SSO/MFA provider requirement yet; provider selection/integration is deferred to the documented gate before broad rollout.

Acceptance: a department editor cannot publish outside its assigned scope; bulk results identify failures; private screen content stays inaccessible publicly; an owner can trace each alert's delivery state without mistaking a dashboard preview for a live camera feed.

Local implementation and evidence: [P4 baseline](INSTITUTIONAL_FLEET_BASELINE.md), [policy ADR](adr/0006-institutional-fleet-policy.md), and [verification record](verification/p4-local-verification.json).

## 9. P5 — Instrument, harden, and release

- [ ] Implement the allow-listed events in [baseline metrics](BASELINE_METRICS.md), with accepted ownership/retention settings. Use server-confirmed lifecycle transitions for completion and exclude demo/test traffic.
- [ ] Extend the existing metrics endpoint with defined cohort/window denominators, durations, and sample sizes. Do not call grouped activity counts a conversion rate.
- [ ] Track publication-to-acknowledgment latency, stale players, expected/reported delivery discrepancy, plan-to-confirmation conversion, time to creative readiness, on-time installation, proof turnaround, and support requests per completed campaign.
- [ ] Add operational visibility for database/API failures, ingestion rejection rates, polling load, media delivery failures, storage growth, and outstanding outbox/reconciliation work.
- [ ] Load-test representative manifest polling and event ingestion. Example: 100 players polling every 10 seconds create approximately 10 manifest requests/second before retries; size database access and caches from measurements.
- [ ] Exercise backup restoration, migrations on existing data, multi-instance behavior, media authorization, and a documented rollback. Do not add destructive retention cleanup as an incidental hardening change.
- [ ] Verify English/Canadian French, keyboard access, phone layouts, visible errors, and 200% zoom for changed workflows. Arrange native French review for release copy.
- [ ] Roll out first to a development screen, then a small authorized pilot cohort, then broader inventory after evidence review. Preserve an explicit fallback for existing devices.

Acceptance: a pilot report shows actual sample sizes, observed reliability, conversion definitions, unresolved failures, support burden, and readiness for expansion. Missing measurements remain marked unavailable.

## 10. First implementation ticket

Status: Completed as part of P0/P1; acceptance evidence is in the pilot baseline linked above. P2 software is now implemented; its separate hardware acceptance remains open.

**Title:** Pair one digital player and acknowledge a published content revision.

**Scope:** P0 baseline plus the smallest P1 path: additive player identity, single-use pairing, scoped credential verification, versioned manifest retrieval, heartbeat/applied acknowledgment, automatic runtime polling, and owner-visible delivery state for one screen.

**Start in:** `database/schema.sql`, `app/lib/db.ts`, `app/lib/auth.ts`, `app/lib/public-device-media.ts`, `app/devices/[id]/page.tsx`, `app/component/device-screen.tsx`, and `app/component/institution-network-view.tsx`. Extract a reusable server manifest builder and introduce dedicated player routes/runtime as needed; preserve existing public display behavior.

**Required tests:** pairing expiry/reuse, tenant isolation, credential revocation, unchanged manifest response, approval filtering, publication/unpublishing propagation, idempotent acknowledgment, network failure/recovery, and no delivery evidence from public previews.

**Done when:** institution staff publish a revision, the paired screen applies it without reload, and the workspace shows the authenticated revision acknowledgment and last contact. This ticket does not claim offline reliability, audience measurement, or physical panel visibility.

## 11. Implementation and release rules

- Use additive, idempotent migrations; preserve user work and immutable approvals, quotes, and evidence. Make concurrent transitions transactional and retries idempotent.
- Keep the existing `institutional` role and public device/media contracts. New private/player behavior needs explicit boundaries and compatibility tests.
- Use existing feature flags where appropriate. Add independently controllable player rollout flags if needed, with server-owned cohort assignment; do not enable unfinished functionality globally.
- Keep payment collection disabled. Preserve inquiry/no-hold and offline acceptance rules until a superseding ADR exists.
- Record proposed scheduling allocation, offline lease, device multiplicity, advertising priority, and telemetry retention choices before implementing their dependent behavior. Unaffected work can proceed.
- For application changes, run relevant tests during development and the repository's full verification gate before release: `npm test`, `npm run build`, and `npm run test:e2e` with the documented test database. Apply the existing UI audit and locale/accessibility requirements to changed UI, resolving stale tool paths first.
- Add real-device checks for publishing, autoplay, restart, disconnection, reconnection, expired content, and emergency overrides. Browser component tests alone cannot validate deployment hardware.
- Roll back runtime/routes/configuration without removing evidence or additive tables. Define cached-content behavior when player functionality is disabled; switching a flag off must not strand devices indefinitely.
- Record each completed slice with changed files, validation evidence, remaining limitations, and updated UX/API documentation. Documentation creation alone does not satisfy any implementation checkbox above.

## 12. Deferred work

Defer payment processing/payouts, programmatic auctions, automatic official-alert integration, AI-generated campaigns, a full installer native app, broad hardware support, microservices, and claims of audited audience reach. Reconsider each when a measured pilot need justifies it.
