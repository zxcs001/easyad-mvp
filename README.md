# EasyAD Platform

Next.js MVP for a multi-tenant out-of-home advertising marketplace.

The staged digital/static roadmap is in [Development Plan](docs/DEVELOPMENT_PLAN.md). Phase 0 architecture decisions are recorded in [ADR 0001](docs/adr/0001-campaign-placement-domain.md) and [ADR 0002](docs/adr/0002-lifecycle-transition-authority.md); unresolved policy stays explicit in [Product Decisions](docs/PRODUCT_DECISIONS.md).

The next implementation priorities, player reliability work, pilot milestones, and acceptance checks are in [Technical Improvement Plan](docs/TECHNICAL_IMPROVEMENT_PLAN.md).

## Authenticated screen players (P1/P2)

The paired browser player at `/player` automatically retrieves approved screen content and reports connection and content-revision acknowledgments. Enable `FEATURE_PLAYER_CONTROL=true` in an explicitly configured pilot environment and run the schema migration. In Screen control, the owning Institution account or Super Admin can create a one-time code, inspect player status, or disconnect a device. Enter that code on the display computer's `/player` page.

Public device views and media APIs retain their existing behavior. Player acknowledgments do not claim completed playback or physical screen visibility; P2 adds bounded offline caching, scheduling and authenticated playback reports, which remain distinct from measured audience views.

See [P2 recovery setup and release checks](docs/PLAYER_RECOVERY_BASELINE.md), [P0/P1 pilot setup and verification](docs/PLAYER_PILOT_BASELINE.md) and [the player protocol decision](docs/adr/0004-authenticated-browser-player.md). Use Node.js 24 and `npm ci` for the verified local runtime. `npm run test:pilot` runs tests in an isolated local test schema; after `npm run build`, `npm run test:pilot:e2e` exercises Chrome against a dedicated local server.

## Local PostgreSQL Database

The app now uses PostgreSQL through `pg`. It reads `DATABASE_URL` first, then `POSTGRES_URL`, and falls back to:

```text
postgres://postgres:postgres@localhost:5432/ooh_market
```

For local development, install dependencies and run the project initializer:

```bash
npm run init
npm run dev
```

`npm run init` installs dependencies, copies `.env.example` to `.env.local` when needed, starts the bundled PostgreSQL service with Docker Compose, and waits until the configured databases are reachable.

### Docker credential helper on macOS

The `docker compose` command needs the Docker Desktop credential helper. Homebrew installs the `docker` binary in a different directory. The helper `docker-credential-desktop` stays in the Docker Desktop application directory.

Add the helper directory to your `PATH` before you run `npm run init`:

```bash
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

If the `PATH` does not contain this directory, the image pull fails with this error:

```text
error getting credentials - err: exec: "docker-credential-desktop": executable file not found in $PATH
```

Seed the documented governmental, institutional, advertiser, and device fixtures for local development:

```bash
npm run seed:demo-data
```

The seed writes eight users, thirteen Thunder Bay screens and sixteen months of trading: 420 bookings across 172 campaigns, with their creatives, invoices, proof-of-play rows and approval events. Find screens, Performance and Invoices therefore open with data instead of an empty state.

Every screen sits at a real civic or campus address and carries a real latitude and longitude. Every audience figure is published or is an estimate with its arithmetic shown. Every advertiser is fictional, because no real business may appear to have bought advertising it did not buy. [Demo data research](docs/DEMO_DATA_RESEARCH.md) gives the source of each number; read it before you change one.

The stable identities, demo credentials, ownership graph, and AI fixture rules are documented in [Demo Users and Devices](docs/DEMO_USERS_AND_DEVICES.md). The older `seed:test-data` command remains available for the temporary test-account workflow.

### Local demo credentials file

The `npm run seed:demo-data` command reads the local file `DEMO_ACCOUNTS.md`. The repository does not contain this file. The `.gitignore` file excludes it. Never commit this file and never upload it.

Create the file in the repository root before you run the seed command. Use a Markdown table with four columns. Put the stable user ID in the first column. Put the email in the third column. Put the password in the fourth column.

```markdown
| Stable user ID | Name | Email | Password |
|---|---|---|---|
| `USR-DEMO-GOV-TB` | City of Thunder Bay Screen Operations | `gov.thunderbay@demo.local` | `<password>` |
```

The table needs one row for each of the eight demo users. [Demo Users and Devices](docs/DEMO_USERS_AND_DEVICES.md) lists the eight stable user IDs. The seed command stops with an error if a row is missing.

The local compose setup creates:

- `ooh_market` for the app
- `ooh_market_test` for integration tests

The compose file publishes PostgreSQL on `127.0.0.1:5432` only. Other machines on the network cannot connect to the database. The development password is in `docker-compose.yml`, so do not change the binding to `5432:5432`. If a different machine must connect, use an SSH tunnel.

### Application origin and port

The `npm run dev` and `npm run start` commands are pinned to port **3001** in `package.json`. The port is fixed on purpose. Another EasyAD prototype runs on port 3000 on at least one machine, and an unpinned port let the two be confused for each other, which cost real debugging time.

Always open `http://localhost:3001`. Set `APP_ORIGIN` in `.env.local` to the same port. The public device media API builds each value in `links` from `APP_ORIGIN`. A wrong `APP_ORIGIN` value gives a link to the wrong port.

Run the PostgreSQL integration test with:

```bash
set TEST_DATABASE_URL=postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test
npm test -- --run tests/db.test.ts
```

Run end-to-end tests against the same PostgreSQL database with:

```bash
set TEST_DATABASE_URL=postgres://ooh_app:ooh_app_password@localhost:5432/ooh_market_test
npm run test:e2e
```

Playwright starts the app on port `3100` so it does not collide with a normal dev server on port `3000`.

On macOS/Linux, use `export TEST_DATABASE_URL=...` instead of `set`.

## Public Device Media API

Published devices expose a read-only, CORS-enabled API for third-party integrations. Only operator media on an approved device and approved advertiser creative whose campaign is currently active are returned.

List the currently visible media and totals for a device:

```text
GET /api/public/devices/INV-101/media
```

Access the first currently visible item or use the stable media ID returned by the list endpoint:

```text
GET /api/public/devices/INV-101/media/1
GET /api/public/devices/INV-101/media/CRV-123
```

Image detail responses contain Base64 data. Video detail responses contain a public streaming URL. Append `?encoding=url` to an image detail request when a URL is preferred. Base64 responses default to a 20 MB limit, configurable with `PUBLIC_API_BASE64_MAX_BYTES` up to the platform's 50 MB upload limit.

## Institutional and Local-Government Screen Control

The public `/government/about` route introduces Civic Screen Operations for local government, institutions, and large screen networks before secure sign-in. A compact entry at the bottom of the marketplace landing page links to that overview; the government entry remains absent from the marketplace top navigation. The dedicated `Institution account` role then signs in through `/government/login` and uses the separate `/government` dashboard for devices owned by its institution. It combines publishing state, image/video uploads, a scoped fleet map, and a representative screen-content preview. Institution-owned uploads bypass content approval and join the rotation immediately when the screen is published; uploading content never silently publishes an intentionally unpublished screen. Delegated operator uploads remain in review until the owning Institution account or a Super Admin approves them. Advertiser creative keeps the standard campaign approval flow. The preview reflects only approved rotation content and is explicitly not a live camera feed. The persisted role key remains `institutional` for database compatibility.

The public landing page links to this workspace from the middle of the page; it is intentionally absent from the top navigation. Signed-out visitors are routed to the dedicated government sign-in, while advertiser and operator accounts receive an access boundary. Super Admin can create Institution accounts and can enter the Civic Screen Operations dashboard in addition to the standard admin workspace.

Authorized institutional staff can create time-limited AMBER, evacuation, or public-safety screen overrides for selected published devices. These overrides replace regular content only on the application's owned screens—they do not issue an alert through Alert Ready, wireless emergency alerts, police systems, or another official public-alert network.

Run `npm run db:migrate` after deployment so the additive `device_alerts` table and media approval state are available.

## Colour and Status Encoding

The design system encodes status by visual weight, not by hue. A colour-vision deficiency removes a hue channel, but it never removes lightness. Each state is a surface-and-ink pair on a five-step severity ladder, and weight 4 is reserved for an active screen override.

Colour alone never encodes a state. Every state also carries a distinct icon shape and a text label.

Use `--line-strong` for the edge of a control. Use `--line` for a decorative hairline only, because it gives 1.23:1 and WCAG 2.2 SC 1.4.11 needs 3:1.

The tokens live in [`app/globals.css`](app/globals.css), which stays canonical. [DESIGN.md](DESIGN.md) mirrors them. The measured basis, the rejected alternatives, and the AODA obligation are in [ADR 0007](docs/adr/0007-status-colour-encoding.md).

## Session Skills

`.claude/skills/` holds skills that ship with this repository, so every person
working on it gets the same routine.

| Skill | Say | What it does |
|---|---|---|
| `lights-on` | "lights on", "start up", "pick up where we left off" | Fetches what teammates pushed, starts PostgreSQL and the dev server on 3001, checks the app answers, and summarizes the last session |
| `lights-off` | "lights off", "wrap up", "shut down" | Verifies the work, updates `README.md` and `DESIGN.md`, commits to the feature branch, stops servers this session started, and reports what is left |

The pair is deliberate. `lights-on` opens the day and `lights-off` closes it.

Neither one pushes, opens a pull request, or merges. Those reach other people,
so they ask instead. `lights-off` also refuses to commit when `npm test`, `tsc`
or `npm run build` fails, and `lights-on` never discards local work to make a
pull succeed.

## Advertiser Vocabulary

The product serves two populations with one component set. Operators, institutions, and government staff are trained, so their screens keep the precise operational terms: loop time, inventory, occupancy. An advertiser is often a small-business owner buying outdoor media for the first time, so advertiser screens name the task instead of the trade.

Role selects the vocabulary on every shared screen, through an `isAdvertiser` flag: `dashboard-shell`, `campaign-spaces-view`, `content-library-view`, `ReportsView` and `BillingView`. An advertiser never sees the marketplace's own revenue split, because the platform's cut and the operator payable are not a buyer's business.

No screen is forked. `advertiserViewTitles` and `advertiserGroupLabel` in [`app/component/dashboard-shell.tsx`](app/component/dashboard-shell.tsx) hold the advertiser wording, and the rest is the English string in each advertiser-only component.

Add a French entry in [`app/i18n/fr-additional.ts`](app/i18n/fr-additional.ts) whenever you change an English string. The English text is the lookup key, so a changed string without a matching French entry silently falls back to English.

The collapsed sidebar rail lives in `app/component/dashboard-shell.css` inside `@media (min-width: 901px)`. The sidebar turns into a top bar at 900px, not at 1180px. An earlier rule assumed 1180px, forced the shell to one column between 901px and 1180px, and the collapsed rail then filled the whole screen with its toggle hidden. Measure a breakpoint in the running layout before writing a rule against it.

Map marker and tile positions in `app/component/maplibre-inventory-map.tsx` are rounded to a tenth of a pixel. The browser shortens an inline style to six significant digits, so an unrounded float in server HTML reads back as a different value and causes a hydration mismatch.

Discover uses two columns. The filters are one horizontal bar above the map and the result list. The selected screen's detail floats over the map. `.discover-grid` in [`app/component/discover-view.css`](app/component/discover-view.css) is declared twice; the lower rule wins on source order and holds the layout. Keep the column count in every media query equal to the column count in `grid-template-areas`, or a phantom track appears and the map collapses.

A map pin and a result card both select a screen; there is no pin modal. `PlaceComments` in [`app/component/place-panel.tsx`](app/component/place-panel.tsx) renders location comments inside the detail card. The card preview renders `DeviceScreen` on a 1280px stage and scales the whole frame to the card, because `DeviceScreen` sizes its text in `vw` and would overflow a card. A digital screen gets the preview; a static billboard does not.

The floating card sits inside `.detail-dock`, which uses `contain: size`. Keep it. The dock shares the map's grid row, and without containment the card's own height stretched that row, so the card was never capped and ran under the map search bar and past the map. A percentage `max-height` on the card does not help: Chrome does not resolve it for a grid item aligned to the end. Below 1120px the dock returns to normal flow with `contain: none`, or it collapses to zero height.

Known limit: public screens show "ON" instead of "Thunder Bay, ON". `deriveScreenCity` in [`app/component/device-templates.ts`](app/component/device-templates.ts) keeps only the last address part. The profile page, the public playback page and the Discover preview share it, so the fix is one line, but it changes what physical screens display.

The advertiser buying flow shows a three-step indicator in the top bar: Find screens, Book dates, Make an ad. Booking already takes the ad picture, so a person can buy screen time in two steps. Make an ad is a separate task for a campaign that is already booked, and it stays locked until one exists.

Discover shows three filters by default and keeps the rest behind **More filters**, which remembers what you open (ADR 0008 stage 1). The control always shows how many hidden filters are active, and an active hidden filter opens the group, so disclosure never hides capability.

Every empty state names a next action, through the shared `EmptyState` in [`app/component/shared-ui.tsx`](app/component/shared-ui.tsx). A column header is never shown above an empty table.

A disabled control must state why it is disabled and what to do next. See the blocked-reason line in [`app/component/booking-view.tsx`](app/component/booking-view.tsx). A silent disabled control is a defect.

The portal at `/` serves two audiences from one component. A signed-out visitor sees the marketing page. A signed-in advertiser sees a task-focused home built by `AdvertiserHome` in [`app/component/portal.tsx`](app/component/portal.tsx). Role selects the branch; the screen is not forked. The civic gateway renders for both, because a test and [DESIGN.md](DESIGN.md) require it at the end of the page for every visitor.

Complexity varies inside the advertiser role as well as between roles. Advertiser density is disclosed progressively, and the interface remembers what a person opens instead of asking them to pick a level. Any mode has two settings, defaults to guided, and never applies to the operator, institution, or government consoles. [ADR 0008](docs/adr/0008-advertiser-complexity-modes.md) records that decision and its boundary.

## Production Notes

The production target is a stateless Next.js container on ECS Fargate, RDS PostgreSQL, and private S3 media storage. See [the AWS deployment runbook](docs/AWS_DEPLOYMENT.md) for the complete build, IAM, migration, health-check, and release procedure.

Run the idempotent schema migration before each ECS service deployment:

```bash
npm run db:migrate
```

Set these environment variables in your hosting platform:

```text
DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/DB_NAME
DATABASE_SSL=true
DATABASE_POOL_SIZE=10
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_SSL_CA_BASE64=<base64-rds-ca-bundle>
BOOTSTRAP_ADMIN_TOKEN=<strong-secret>
APP_ORIGIN=https://your-public-domain.example
PUBLIC_API_BASE64_MAX_BYTES=20971520
MEDIA_STORAGE_PROVIDER=s3
MEDIA_BUCKET=<private-s3-bucket>
MEDIA_KEY_PREFIX=production
AWS_REGION=ca-central-1
FEATURE_CAMPAIGN_MODEL_V2=false
FEATURE_AGENCY_WORKSPACE=false
FEATURE_STATIC_FULFILLMENT=false
FEATURE_PAYMENTS=false
```

Roadmap features are opt-in and accept only the exact value `true`. Payment collection is out of scope and `FEATURE_PAYMENTS` must remain `false` outside an explicitly labelled demo environment.

The application retains a startup schema check, but production releases should run the explicit migration first. Local development uses `.data/uploads`; S3 is required for durable media across multiple Fargate tasks.

## Advertiser and static fulfillment pilot (P3)

Campaigns now expose quote cost lines, persisted artwork approvals and placement readiness. Field operations support phone scheduling, assignment, recoverable uploads and private-by-default proof. Repeat campaign starts a fresh draft and requires new dates and confirmation. See [P3 verification and operating limits](docs/ADVERTISER_STATIC_PILOT_BASELINE.md).

## Institutional fleet pilot (P4)

Enable `FEATURE_FLEET_OPERATIONS=true` with authenticated player control for the authorized pilot. Owners can group screens, schedule reusable announcements, assign department scope, set privacy and advertising policy, and inspect per-player alert reports. See [P4 verification and rollout gates](docs/INSTITUTIONAL_FLEET_BASELINE.md) and [fleet policy decisions](docs/adr/0006-institutional-fleet-policy.md). Institutional SSO/MFA provider selection is deferred until requirements are confirmed before broader rollout.
