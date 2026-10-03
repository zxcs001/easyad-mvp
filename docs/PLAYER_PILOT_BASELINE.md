# P0/P1 pilot baseline and operating guide

Date: 2026-09-05  
Scope: This checkout, local PostgreSQL, and automated Windows Chrome checks. No deployment or field-billboard certification.

## Reproduce the environment

Use Node.js 24 (validated here: 24.19.0) and install the locked dependencies with `npm ci`. The previously selected Node 20.12.0/npm path failed with a sandbox `EPERM` before execution; this was an environment failure, not a test assertion.

The documented local PostgreSQL account can access `ooh_market_test`. That existing database had additional NOT NULL coordinate constraints absent from this checkout. Pilot checks therefore create and use `easyad_player_pilot`, an isolated schema in the local test database, rather than altering those unrelated constraints.

```powershell
npm ci
$env:TEST_DATABASE_URL = 'postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test'
npm run test:pilot
npm run build
npm run test:pilot:e2e

# Repeat browser checks with legacy campaign behavior.
$env:PILOT_CAMPAIGN_FLAGS = 'false'
npm run test:pilot:e2e
Remove-Item Env:PILOT_CAMPAIGN_FLAGS
```

The runner rejects nonlocal or non-`*_test` database URLs and always disables payments. Database integration tests reset the isolated test schema; never use this runner against application data. The browser runner starts its own production server on port 3100, fails if that port is already serving an app, and terminates its server afterward. Build before browser checks so the runtime matches the source. It does not reuse an unknown running server.

`npm run test:pilot:e2e -- e2e/player.spec.ts` selects the player scenarios. Standard `npm test`, `npm run build`, and `npm run test:e2e` remain available; direct database/E2E runs need explicitly configured database scope.

## Fixtures and exclusion from production

`tests/helpers/player-fixtures.ts` defines a digital screen, a static face, a mixed draft campaign, a second institution's digital screen, and owner/admin/advertiser/operator identities. The browser scenarios create the `PLAYER-E2E` fixture; the integration suite uses `PLAYER-DB`. They exist only in the isolated local test schema. Product analytics and production operational reports must never merge that schema with live data.

Fixture accounts use `example.test` addresses and the test-only password defined in that helper. This is not a production account bootstrap. The P0 role scenario signs in with each role, checks the player ownership boundary, opens its workspace, and verifies the campaign endpoint according to the enabled/disabled flag configuration.

## Capability matrix

| Capability | Implementation | Exposure | Verification scope |
|---|---|---|---|
| Legacy advertiser/operator/admin/institution workspaces | Existing | Existing account permissions | Existing tests and Chrome role navigation |
| Mixed campaign and static fulfillment model | Existing | Campaign/agency/static flags default off | Existing campaign database tests, mixed fixture, and flag-sensitive role checks; complete fulfillment remains P3 |
| Public device view and media API | Existing | Approved digital inventory only | Existing public-eligibility tests; no player authority |
| Paired player identity and revocation | P1 | `FEATURE_PLAYER_CONTROL=true` | Database concurrency/isolation tests, route tests, Chrome pairing |
| Content synchronization and alerts | P1 | Authenticated `/player` runtime | Versioned manifests, ETags, approved content, removal, unpublishing, alert start/end |
| Connectivity and revision status | P1 | Owning institution or admin | Heartbeat/acknowledgment tests and connection-loss/recovery scenario |
| Offline cache and actual proof of play | Not part of P1 | Not claimed | P2 backlog; current browser memory is bounded by a five-minute lease |
| Analytics | Existing activity-action and campaign-state aggregation | Organization-scoped endpoint | Counts are not yet a complete funnel, baseline, or production conversion metric |
| Private institution content | Not introduced | Current public media rules remain | P4 access/storage work required before a private-content promise |
| Payments | Deferred | Off in every pilot run | Existing payment flag tests; no payment collection |

The original development plan's phases 0–6 describe implementation availability. They should not be read as proof of hardware qualification, complete production funnel instrumentation, or production deployment. The older baseline metrics file remains a historical snapshot of pre-campaign-v2 instrumentation.

## Pilot device target

First qualification target: a Windows display computer running the installed stable Google Chrome in a dedicated profile, with a connected 16:9 display, HTTPS application access, and automatic browser launch configured by its operator. Open `/player`, obtain a code from Screen control, and enter it once. Preserve the browser profile so the HTTP-only device cookie survives restart. Do not use a shared advertising-planning profile as the permanent screen runtime.

The automated tests run actual desktop Chrome on this Windows host. They validate browser behavior, not a commercial signage panel, unattended boot, GPU drivers, a kiosk policy deployment, or panel power. Check those with the selected physical device before field rollout. Muted media autoplay and supported PNG/JPEG/WebP/MP4/WebM codecs must be tested on that device. A full player restart requires online retrieval in P1; persistent offline playback is P2.

## Configure and use P1

```text
FEATURE_PLAYER_CONTROL=true
PLAYER_POLL_MS=10000
PLAYER_HEARTBEAT_MS=30000
PLAYER_STALE_MS=90000
FEATURE_PAYMENTS=false
```

Run `npm run db:migrate` on the intended application environment before its release. The local pilot runner initializes its own schema through the app/database layer. Do not copy the pilot schema search path into production configuration.

1. Sign in as the screen's owning Institution account or Super Admin.
2. Open Screen control, select a digital screen, and find Player connection.
3. Create a pairing code; reveal it with the masked field's show control when needed.
4. On the display computer, open `/player` and enter the code. The code expires after ten minutes and is usable once.
5. Publish approved content. Inspect received/prepared/applied revisions and last contact; keep those distinct from playback evidence.
6. To replace a device, disconnect its current player using the confirmation dialog, then create a new code. A stale confirmation cannot disconnect a replacement player.

An unpublished screen can be paired and waits for approved published content. A network outage makes contact stale; existing eligible content remains only within its current lease. Revocation or disabling the player feature stops online content at the next request, while disconnected content expires within the remaining lease.

## Verification record

Initial existing-suite run: 152 passed, two database tests skipped because `TEST_DATABASE_URL` was unset; production build passed. After isolating the test schema and adding P1 coverage, the final pilot unit/component/database suite passed 166 tests across 52 files, with no skips.

Final local results (2026-09-05):

| Check | Command executed / npm equivalent | Result |
|---|---|---|
| Unit, component, and real PostgreSQL integration | `node scripts/verify-pilot.cjs test` / `npm run test:pilot` | 166 passed; includes a one-connection pool, enrollment races, scopes, and revocation |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` | Passed |
| Production build | `node node_modules/next/dist/bin/next build` / `npm run build` | Passed; player page and five player API boundaries included |
| Chrome, campaign/agency/static flags on | `node scripts/verify-pilot.cjs browser` | 14 passed |
| Chrome, campaign/agency/static flags off | Same command with `PILOT_CAMPAIGN_FLAGS=false` | 14 passed |
| UI contract audit | Premium `audit_project.py . --mode strict` | Zero errors, warnings, or unresolved findings; output in `premium-audit.json` |
| Whitespace and local documentation links | `git diff --check` plus local-target existence check | Passed |
| Existing legacy lint script | `next lint` / `npm run lint` | Fails: Next.js 16 treats `lint` as an invalid project directory; migration to a maintained ESLint configuration is outside this P0/P1 change |

Chrome checks include real browser pairing, approved image rendering, five consecutive setting changes without reload, alert creation/cancellation, browser-network loss/recovery, content deletion, unpublishing, revoked credentials, English/French setup, keyboard validation/focus, narrow layout, reduced motion, forced colors, and 200% reflow. Mobile and French screenshots were visually inspected. External map tiles are fixture responses; the control interactions still run in the real browser.

Measured publication-to-applied acknowledgment with ten-second polling:

- Campaign features on: p95 **10.793 seconds**, five samples. [Raw measurements](verification/p1-publication-latency.json).
- Campaign features off: p95 **10.759 seconds**, five samples. [Raw measurements](verification/p1-publication-latency-legacy.json).

These small local samples satisfy the proposed 30-second pilot target. They are not a production SLA, audience measurement, or completed-play evidence. The browser test uses five-second heartbeats and a 15-second stale threshold to exercise configurable recovery; production defaults remain 30 and 90 seconds respectively.

The local production test server was stopped after each run. It uses the existing Next start path, which emits the repository's standalone-output warning; the separate AWS standalone-container runbook remains the deployment authority.

Baseline fixes made during P0:

- Corrected existing test fixture types and mock signatures exposed by a full TypeScript check.
- Fixed the existing alert-history test's UTC serialization; PostgreSQL's session timezone previously changed rows that were incorrectly labeled with `Z`.
- Isolated the new Player connection component in the existing institution-view unit tests; its network behavior has dedicated component coverage.
- Added a deterministic tile response to the existing map interaction browser test so external tile-service denial does not invalidate its control checks. It does not verify live map-tile service availability.
- Used a production build for pilot browser checks so development hot reload cannot interrupt pairing while a route is compiling.

## Remaining release checks

- Physical display/kiosk startup, operating-system sleep/restart policy, media codec/autoplay support, and long-running reliability on the selected hardware.
- Native Canadian-French review; automated translation coverage is not a native editorial review.
- Production HTTPS/proxy normalization and deployment migration/rollback rehearsal.
- P2 persistent caching, clock-skew handling, campaign-v2 schedule allocation, and actual playback ingestion.
