# UX Contract

## Product context

- Audience: Advertisers, Institution account screen owners, institution-provisioned operators, and marketplace Super Admins.
- Primary jobs: Discover/book media; create and maintain devices; publish screen content; inspect the fleet geographically; review the general screen output; manage institution operators; oversee approvals and billing.
- Target market(s): Canada-first sample data, with no market-specific regulated integration implemented.
- Active locales: English (`en`) and Canadian French (`fr-CA`). English is the website default; a trusted Quebec deployment-region signal selects French only when no explicit locale cookie exists. A person's selector choice persists for one year and overrides region detection. Each standalone device display stores its own `en` or `fr` language in inventory settings and does not inherit or modify the website locale cookie.
- Language/content register and native-review policy: Plain operational English and Canadian French. User-generated names and content are not translated. Legal or official emergency-alert language requires an authoritative external source before the product may claim official alert issuance. French release copy requires native Canadian-French review before production signoff.
- Timezone/calendar policy: Existing ISO date-only storage and browser-local display remain canonical. Emergency overrides use absolute ISO instants and display the viewer's local timezone.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Permission model | `database/schema.sql`, `app/lib/auth.ts`, institution/admin API route guards | Schema + server authorization | 2026-08-21 |
| Data lifecycle | `app/lib/db.ts`, `app/api/inventory/**`, `app/api/media/**` | Domain/API implementation | 2026-08-21 |
| Device/content publishing, dedicated government entry, and screen-only emergency override | Current institutional-entry brief; `app/api/inventory/[id]/media`, `app/api/media/[id]`, `app/api/institution/alerts/**` | Explicit task decision + API contract | 2026-08-21 |
| Deletion / retention | `ON DELETE` constraints in `database/schema.sql`; existing delete routes | Schema + API implementation | 2026-08-21 |
| Billing / payment | `app/lib/payments.ts`, `app/api/bookings/[id]/payment/route.ts` | Domain/API implementation | 2026-08-21 |
| Legal / regulatory copy | No maintained legal source. Official public-alert integration is out of scope; the UI must say the override affects owned screens only. | Explicit scope boundary | 2026-08-21 |
| Authenticated player control, pairing, acknowledgments, and revocation | `docs/adr/0004-authenticated-browser-player.md`, `app/lib/players.ts`, player API routes | User-authorized P0/P1 plan + implemented protocol | 2026-09-05 |
| Market / content conventions | `README.md`, Thunder Bay seed inventory | Product implementation evidence | 2026-08-21 |

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`
- Token ownership model: Existing runtime canonical.
- Runtime design-system/token source: `app/globals.css` plus shared/component CSS.
- Mapping/export/adapters: `DESIGN.md` mirrors CSS variables; compact workspace variants are documented in component CSS.
- Token drift gate: DESIGN.md lint, premium static audit, and representative browser screenshots.
- Supported themes: Light theme; forced-colors interoperability.
- Design-context owner/review policy: Durable token or interaction changes update this contract and their runtime owners together.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Table Selection | Planned shared `TableSelection` primitive; implementation is blocked until Phase 6 unless an earlier bounded workflow proves reuse | This contract | current page / all filtered results, with exact scope announced | component keyboard/selection tests + partial-failure E2E |
| Campaign Stepper | Planned shared `CampaignStepper` navigation and status primitive | ADR 0002 + this contract | editable draft / read-only readiness | keyboard navigation, current-step semantics, validation recovery, narrow viewport |
| Upload Queue | Planned shared `UploadQueue` with per-file state; no screen-local multi-file uploader may precede it | ADR 0001 + this contract | creative source / proof evidence | signature/size validation, progress, retry, remove/cancel, partial failure, safe preview |
| Activity Timeline | Planned shared `ActivityTimeline` backed by immutable events | ADR 0002 + this contract | campaign / creative / fulfillment | actor-action-time text, timezone, pagination, permission filtering |
| Unsaved/Draft Guard | Planned shared draft state and app-dialog guard | This contract | server-backed campaign draft / local form guard | unload and in-app navigation, save failure, session expiry, conflict recovery |
| Locale | Root `I18nProvider`, fixed device-locale provider, English-source message catalog, request proxy locale detection, and shared hover/focus language menu | `app/i18n/**`, inventory `display_language`, `proxy.ts`, and this contract | website floating/embedded selector; fixed non-interactive device display; `en` / `fr` | Quebec/default/override tests + device isolation + hover, keyboard, selection, and browser switch |
| Select/Listbox | Native `<select>`; OS popup geometry and locale are accepted for the English/French MVP | This contract + shared field CSS | native | keyboard + browser popup in both locales |
| Date | Native date input; OS locale and popup geometry are accepted for the English/French MVP | This contract + `EditorInput` | native | keyboard + browser popup in both locales |
| Form | Native semantic form/label controls with app-owned validation; shared `EditorInput` where applicable | This contract + shared UI | create / edit | component tests |
| Scrollbar | Global application stylesheet | `DESIGN.md` + `app/globals.css` | stable-gutter geometry exception | computed style + browser |
| Toast | Shared `toast` service and `Toaster` | This contract + `app/component/toast.tsx` | success / info / error | live-region test |
| CRUD | Server-authorized API routes with OohApp state reconciliation | Route contracts + this contract | stay in owning workspace | full-flow tests |
| Player Connection | Shared `PlayerControl`, `SecretInput`, `AppDialog`, `PanelHeading`, and `toast`; existing `shared-ui.css` tokens | ADR 0004 | screen-owner status / code creation / confirmed disconnect | player component + API/database + Chrome tests |
| Player Runtime | `PlayerRuntime`, `player-storage.ts`, `PlayerRotation`, and existing `DeviceScreen`; shared form/button styling | ADR 0004 and ADR 0005 | pairing / active content / offline restoration / expired or storage-failure fallback | browser pairing, cache/outbox restart, quota rollback, offline alert/lease expiry, French and keyboard checks |
| Digital Allocation and Evidence | `DigitalAllocation` and `DeliveryEvidenceSummary` within the existing campaign workspace | ADR 0005 and canonical report API | immutable quote allocation / provenance-separated report | confirmation concurrency and browser campaign report |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | Visible verb | elevation/tone | shared ring | subtle press | non-interactive + reduced opacity | stable spinner/label | inline persistent recovery |
| Icon button | Accessible name | surface cue | shared ring | subtle press | non-interactive | stable geometry | nearby text |
| Input | visible label | stronger border | shared ring | n/a | read-only appearance | stable adornment | text + `aria-invalid` |
| Secret input | masked | stronger border | shared ring | n/a | non-interactive | stable | generic safe message |
| Search | visible label/name + clear | stronger border | shared ring | n/a | non-interactive | reserved state | persistent result-region error |
| Textarea | resize none | stronger border | shared ring | n/a | non-interactive | stable | text + association |
| Table/list | stable records | surface/border cue | ring on row action | selected state | explained | stable frame | retry state |

## Dataset navigation

- Admin tables: Existing bounded MVP lists render all scoped records; pagination must be added before datasets become unbounded.
- Exploratory lists: Render all within the currently bounded dataset; content library filtering is local.
- URL state: Route and primary workspace are URL-backed. Existing local filters remain an acknowledged MVP limitation.
- Page size: Not currently exposed.
- Empty/no-results/error/loading treatment: Stable in-panel states with a next action; filtered no-results offers reset/adjust guidance.
- Back/scroll restoration: Browser route state is preserved by URL-backed workspace links; in-view selection remains client state.
- Selection scope: Authenticated workspace maps use single-device selection and share the selected ID with their device list. The public portal map is an availability-only variant with no selected device, nearby-business markers, radius graphic, or campaign-status overlays. Shared inventory maps open on a 30 km operating viewport. Individual device pins are visible at city scale (zoom 8.5 and closer). At province/national scale, they are replaced by city-availability count markers aggregated from the matching inventory. Each is anchored to one representative matching device rather than a calculated city centroid; activating it centers and zooms into that city. Returning to city scale restores the individual pins without losing workspace selection.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create device | `Continue`, then role-aware `Submit device for approval` / `Create device` | stable busy button | Device/inventory workspace | role-aware submitted/created toast | preserve the current stage + inline error + retry | created device | inventory API |
| Edit device | `Save changes` | stable busy button | Stay in device context | `Changes saved` toast | preserve fields + inline error | save action / heading | inventory API |
| Publish device | `Publish screen` | dialog action busy | Stay in network control | `Screen published` toast | dialog/inline error + retry | originating action | inventory PATCH |
| Unpublish device | `Unpublish screen` | dialog action busy | Stay in network control | `Screen unpublished` toast | dialog/inline error + retry | originating action | inventory PATCH |

Device creation uses three revisitable stages: identity/location, availability/pricing, and review. Each stage validates before advancing and retains entered values when moving back. Delivery mode derives the initial format, product type, and relevant digital-loop or static-lead-time fields. The map owns coordinates; raw X/Y fields are not part of the regular flow. Audience data, tags, display settings, and media are intentionally deferred to the created device record.
| Search | Search input | local result update | Stay in context | result count/empty state | clear query | input | current local filters |
| Direct-publish institution content | `Publish content` | stable busy control | Stay on selected device | `Content published` when the screen is published; otherwise approved-and-ready feedback | preserve selection + inline retry; no approval queue | upload control | current task decision + media API |
| Submit delegated operator content | `Upload resource` | stable busy control | Stay on selected device | submitted/in-review feedback | preserve selection + inline retry; institution owner or Super Admin reviews | upload control | current task decision + media API |
| Review delegated device content | `Approve` / `Reject` | stable busy action | Stay in approval queue | action-aligned toast; approved content becomes rotation-eligible | queue remains actionable after failure | reviewed card | current task decision + media API |
| Cancel/back | `Cancel` / route link | none | Originating context | none | unsaved warning where implemented | originating trigger | shared UI |
| Publish emergency override | `Publish emergency override` | confirmation action busy | Stay in network control | persistent active banner + toast | dialog stays open with error/retry | originating alert action | institution alert API |
| Cancel emergency override | `End override` | stable busy action | Stay in network control | active state removed + toast | inline error/retry | originating action | institution alert API |
| Learn about Civic Screen Operations | Compact `View workspace details` link at the bottom of `/` | normal route transition | `/government/about` public overview | dedicated institutional capabilities and scope are visible before authentication | marketplace return link remains available | overview heading | current task decision |
| Continue from government overview | `Continue to secure sign in` or `Open your dashboard` | normal route transition | `/government/login` when signed out; `/government` when already authorized | audience and access boundary stay explicit | return to overview or marketplace | sign-in or command-centre heading | current task decision + auth state |
| Sign in as Institution account | `Enter government workspace` at `/government/login` | stable submit action | `/government` Civic Screen Operations command centre | authenticated civic shell identity | generic credential error + retry; non-government roles receive an access boundary | command-centre heading | auth login route + current task decision |
| Create pairing code | `Create pairing code` in selected digital screen's Player connection panel | disabled fixed-width action | stay in selected screen | masked one-time code plus expiry text | inline error; request a new code if an uncertain response lost the first | show/hide code control | ADR 0004 |
| Pair screen | `Pair this screen` at `/player` | duplicate submit blocked | automatic display runtime | approved content or unpublished waiting state | field-associated errors; focus pairing input; retry connection after uncertain completion | display surface / pairing input on failure | ADR 0004 |
| Disconnect player | `Disconnect player` with expected player ID | shared app confirmation; initially focus Cancel | stay in selected screen | shared toast and Not paired state after server confirmation | dialog stays open; stale-player conflicts require refresh | original trigger if still mounted, otherwise next available control | ADR 0004 |

### P0/P1 reconciliation note (2026-09-05)

Older planned/Phase 6 descriptions in this contract describe the original migration baseline, not a fresh certification of every implemented feature. The current implemented/exposed/verified distinction is recorded in `docs/PLAYER_PILOT_BASELINE.md`. Campaign-v2 routes and activity aggregation exist, but full production funnel measurement, complete static fulfillment validation, persistent offline playback, and actual player proof of play are not established by the P0/P1 checks.

The new `/player` route is separate from public displays and hides website language selection and chat during operation. Screen content follows the saved device locale; pairing/error controls follow the website locale. A fresh unpaired state is instructional, not a validation error. Owned English and French strings are in the existing locale catalog, with `fr-player.ts` supplying this feature's translations.

Player status distinguishes connectivity, published/received/prepared/applied revisions, last applied time, and historical last error. Background status recovery clears its own transport error without erasing a mutation error. Last playback is derived only from authenticated completed events. ADR 0005 adds a configurable bounded offline lease (five minutes by default), persistent media, an outbox and interval evidence. Publication/approval rules, owner access and credential handling remain governed by ADR 0004 as amended by ADR 0005; this section does not replace those policies.

## Navigation and responsive behavior

- Route document title policy: Root metadata uses `EasyAD Platform`; the public government overview names Government and Institution Screen Operations; marketplace workspaces use `{Workspace} — EasyAD Platform`; government workspaces use `{Workspace} — Civic Screen Operations`; titles must not include private alert text.
- Route error / 403 page behavior: API routes return 401/403/404 distinctly. Direct forbidden product routes should retain the shell and explain the role boundary when route-level pages are introduced.
- Breadcrumb/tab/route-state policy: Marketplace workspaces are URL-backed sidebar links. The marketplace landing page ends with a compact public gateway to `/government/about`; this entry is intentionally absent from its top navigation. Government workspaces remain under `/government` with `view` search parameters; map/device selection is a peer control, not a tab.
- Shared-assistant availability: The site assistant is omitted from public device and inventory detail routes (`/devices/[id]` and `/inventory/[id]`) so it cannot obstruct screen or media content.
- Standalone device playback: `/devices/[id]` is a digital-only, view-only, automatically advancing display surface. It exposes no language selector, API guide, carousel controls, chat, or other clickable chrome. Its language comes from the device's saved inventory setting.
- Public digital inventory profile: `/inventory/[id]` owns public device links, the developer API guide, media inspection, and website-level language controls for digital inventory only. Static/physical inventory remains available to marketplace booking and fulfillment workflows, but exposes no public inventory profile, device display, or public device-media API; dashboard and campaign surfaces omit those links.
- Sidebar/drawer/bottom-sheet transformation: Persistent desktop sidebar becomes a horizontally scrollable top navigation below 900px. Institution accounts use the fixed-scope Civic Screen Operations shell rather than the marketplace workspace switcher. Super Admin may enter `/government` for cross-institution oversight or remain in the standard admin workspace.
- Responsive table strategy: Existing independent records stack on narrow screens; comparative tables retain explicit horizontal overflow when needed.
- Truncation/full-value access: Device names and addresses wrap in detail surfaces; identifiers remain visible in links/details.
- Focus restoration and sticky-obstruction policy: Dialogs restore the trigger; focused controls must remain visible beneath sticky navigation.

## Overlays and feedback

- Dialog primitive: Shared app dialog with portal, focus placement/trap, Escape, backdrop, scroll lock, and restoration.
- Destructive confirmation levels: Routine saves have no confirmation. Public visibility changes name the screen and outcome. Emergency overrides require exact scope, authorization acknowledgement, and a pessimistic server-confirmed commit.
- Toast placement/duration/deduplication: One shared bottom-right viewport; routine success/info auto-dismiss; errors persist long enough to recover; duplicate messages are collapsed.
- Alert/banner scope and persistence: Active emergency overrides remain persistently visible in network control and replace ordinary screen content on targeted device renders.
- Tooltip delay/dismissal: Essential instructions are never tooltip-only.
- Unsaved-changes behavior: Long-form guard is not yet generalized; alert dialog retains entered values after server failure.
- Layer/z-index contract: Tokenized dropdown 200, popover 300, header 400, backdrop 500, dialog 600, drawer 700, command 800, toast 900.

## Async and resilience

- Mutation default: Pessimistic for publishing, permissions, deletion, alerts, billing, and externally visible changes. “Published” is announced only after the upload API confirms an approved resource; an intentionally unpublished screen remains unpublished.
- Idempotency and duplicate-submit policy: Busy controls block duplicate activation. Campaign creation, player ingestion, and installation completion use explicit server-side idempotency records; replay with different request data conflicts.
- Auto-save/draft recovery: Publishing and emergency controls remain non-draft actions. Campaign planning keeps a local recovery copy until the server draft succeeds and uses an unload guard while dirty.
- Offline/read-stale/write behavior: Preserve visible server-rendered data; failed writes keep user input and offer retry. No offline queue.
- Retry/backoff/timeout behavior: User-initiated retry only for mutations; no unbounded automatic retry.
- Version conflict and multi-tab behavior: Campaigns and fulfillment records carry versions; critical mutations reject stale expected versions with `409`. Campaign detail exposes an ETag for cache and conflict-aware clients.
- Session expiry/re-authentication: API 401/403 does not claim success; sign-in returns through `returnTo` for page navigation.
- Long-running progress and return path: Upload uses an indeterminate busy state; resumable uploads are not supported.
- Stale-request cancellation/invalidation and pending-state ownership: Campaign search discards older responses by request sequence; mutation busy state belongs to the triggering control/dialog.
- Dialog/form preservation and retry after mutation failure: Dialog remains open and retains non-sensitive values.

## Validation

- Schema/validation layer: Server route guards and explicit field validation; client pre-checks for required values, file type/size, scope, and expiry.
- Trigger timing: Submit, then correction on change for fields already in error.
- Error summary/inline policy: Short forms use a persistent form-level alert and field-specific guidance when applicable.
- Server error mapping: Safe server messages map to persistent form/dialog status; raw internals never reach toasts.
- Sensitive-value handling: Passwords remain masked; secrets do not enter URLs, toasts, or logs.
- `noValidate`, first-invalid focus, duplicate-submit prevention, unsaved changes, and submit recovery: Product forms declare `noValidate`; invalid submissions focus the first invalid owned field; busy state blocks duplicates.

## Permission and clipboard

- Permission UI strategy: The persisted `institutional` role is presented as `Institution account`. Institution accounts and Super Admin can access `/government`; advertiser and operator roles receive a dedicated access boundary. The government sign-in accepts only those two roles. Institution-owned content uploads are approved immediately and bypass the review queue; delegated operator device content remains `pending review` until the owning Institution account or a Super Admin approves it. Advertiser creative retains the established campaign review flow. Super Admin may provision Institution accounts and operates emergency controls within one selected institution scope at a time. Irrelevant workspaces are hidden, known unavailable actions are disabled with nearby explanation, direct server access returns 403, and server authorization is canonical.
- Clipboard copy policy: No new secret-copy flow in this feature.
- Disabled-state explanation: Visible help text explains Institution-account/Super-Admin and published-state requirements.

## Migration status

- Migration ledger location: This contract records touched-workflow consolidation; no separate project tracker exists.
- Canonical primitives and owners: Shared CSS/tokens, `EditorInput`, `AsyncButton`, `toast`, map, device renderer, and app dialog.
- Current risk-prioritized slices: Institutional network control, direct institution content publishing, delegated content review, device publishing, screen-only emergency override.
- Legacy import/token enforcement: Premium audit plus changed-file anti-pattern search.
- Rollout/rollback and removal gates: Database additions are additive. Alert rendering is ignored when no active record exists.

## Campaign v2 and agency/static workflow contract

These rules are dormant until their owning feature flags are enabled. Domain and transition authority come from `docs/adr/0001-campaign-placement-domain.md` and `docs/adr/0002-lifecycle-transition-authority.md`; unresolved business policy is referenced from `docs/PRODUCT_DECISIONS.md` and is not duplicated here.

- Route policy: the target canonical routes are `/campaigns`, `/campaigns/new`, `/campaigns/[id]`, `/campaigns/[id]/plan`, `/campaigns/[id]/creative`, `/campaigns/[id]/production`, `/campaigns/[id]/reporting`, `/clients`, `/brands`, `/design-requests`, `/design-requests/[id]`, `/production`, `/installations`, `/work-orders/[id]`, and `/proofs`. Legacy `?view=` routes remain during additive migration; feature-flag rollback returns navigation to them without deleting v2 data.
- Agency context: organization and client/brand context is always visible. Switching scope reloads server-authorized data; it never filters a cross-tenant client cache.
- Planning state: the builder saves a server draft, shows saved/saving/failed state, preserves safe input after failure or session expiry, and uses the canonical unsaved/draft guard. A request does not claim a hold or reservation until product policy and the server transition confirm it.
- Media-plan tray: adding/removing units is reversible draft work. Bulk dates report unit conflicts without clearing valid selections. Estimates are labelled by source and differ from operator-confirmed lines.
- Readiness: the campaign groups blockers by placement and delivery mode. Static uses production/installation and proof of posting; digital uses scheduling/playback and proof of play. Campaign status cannot hide a placement blocker.
- Booking summary: loop-capacity metrics (`Reserved loop time`, `Available loop time`, and `Booked loop time`) are digital-only and are omitted for static/physical billboard inventory.
- Physical billboard availability: static inventory exposes exactly `Available` or `Unavailable` as its marketplace availability state. The owning operator or institution changes the inclusive availability start/end dates; the client derives the current state from those dates, and static booking requests outside that window are rejected server-side. Internal approval and fulfillment states remain separate and are not presented as additional billboard availability states.
- Booking creative sequence: buyers may request dates before artwork is ready. A booking without artwork is created as `pending approval` with creative state `not submitted`, then routes the buyer to the existing creative workspace. If artwork is attached during booking, the booking and immutable `pending review` creative record commit together. Creative accepts PNG or JPEG, plus animated GIF for digital inventory, up to 50 MB; MIME type and file signature are validated server-side. Failed submissions preserve selected files for retry, and requested revisions remain available through the creative workspace.
- Permissions: UI capability visibility comes from server-supplied organization membership. Client approval, operator review, fulfillment work, commercial visibility, and member management are distinct. Direct forbidden routes show a 403 boundary; hiding is never authorization.
- Static field work: completion is pessimistic and narrow-phone friendly. Evidence uploads expose per-file progress, failure, retry, cancel/remove, and timeout recovery. A timeout checks server state before another completion attempt. Private access notes never enter public proof or ordinary exports.
- Upload recovery: accepted files remain when another fails. Validation names the file and face-specific requirement. Signature validation is server-authoritative, and safe previews use authorized URLs without executing active content.
- Activity: timeline entries expose actor, action, subject/version, and localized time in text. Out-of-scope events are excluded server-side.
- Localization/accessibility: English-source copy receives Canadian-French coverage and native review before release. All new primitives support keyboard use, visible focus, text status, narrow screens, reduced motion, and WCAG 2.2 AA.

## Feature flags and no-payment policy

Server-owned flags are `campaign_model_v2`, `agency_workspace`, `static_fulfillment`, and `payments`. Every flag defaults off and requires the exact environment value `true`. New routes and mutations check their flag server-side; UI checks only prevent false affordances.

`payments` remains off in every documented environment. Current campaigns use quotes and immutable offline acceptance without checkout, card entry, charge, refund, invoice-payment gating, or payout controls. The legacy commercial ledger is read-only while the flag is off. Explicit demo enablement labels all mock controls demo-only. Phase 7 requires a new accepted payment ADR before production enablement.

## Planned workflow behavior ledger

| Operation | Pending | Success | Failure/recovery | Focus | Source |
|---|---|---|---|---|---|
| Save campaign draft | stable save state | stay; announce saved timestamp | preserve input, retry/re-auth; compare conflict | save or first conflict | ADR 0002 |
| Add/remove plan unit | draft pending | tray count/estimates update | restore and name failed unit | originating control | ADR 0001 |
| Submit creative files | per-file progress | accepted files remain; identify version | retain reason/retry/remove; no batch reset | first failed file | ADR 0001/0002 |
| Review creative | pending on exact version | timeline/readiness update after commit | retain reason; retry; `409` refreshes version | version heading | ADR 0002 |
| Complete installation | work order pending | installed only after evidence commit | timeout checks state; issue/reschedule remains | summary or error | ADR 0002 |
| Confirm offline terms | pessimistic confirmation | immutable acceptance; no payment prompt | retain terms and retry/conflict path | terms heading | ADR 0001/0002 |

## Verification

### Campaign v2 accessibility and locale matrix

| Matrix case | Required evidence |
|---|---|
| English and Canadian French | All owned controls and lifecycle labels use the English-source catalogue; French remains release-gated on native review. |
| Keyboard only | Native inputs, selects, file pickers, details, and buttons retain visible focus and require no drag interaction. |
| Reduced motion | Campaign, upload, production, and reporting surfaces add no required animation; global reduced-motion tokens remain canonical. |
| High contrast | Status is repeated in text; borders, focus rings, and error copy do not rely on colour alone. |
| 390 px narrow phone | Builder, upload queue, work-order evidence, exception actions, and reports collapse to one column without horizontal overflow. |
| 200% zoom | Grids use wrapping/minmax layouts, controls retain text labels, and fixed-height content containers remain scrollable. |

The 2026-08-24 verification pass recorded zero strict premium-audit findings and no horizontal overflow at a 390 × 844 browser viewport. Automated WCAG conformance remains supplemented by keyboard and assistive-technology release testing.

- Required static commands: premium strict audit, DESIGN.md lint, `npm test`, `npm run build`.
- Browser/device/locale/theme matrix: Desktop and narrow English light-theme views, keyboard navigation, reduced motion, alert active/inactive, empty fleet, upload and server-error states.
- Accessibility checks: Semantic controls, focus-visible, dialog focus containment/restoration, live feedback, text-equivalent statuses.
- Native-language/domain review and target-user evidence: No legal/domain reviewer is recorded; product copy must not claim official alert issuance.
- Component-state/visual regression coverage: Component tests plus browser screenshots for landing and institutional network workspace.
- Canonical sibling flow used for comparison: Existing inventory management, content library, map discovery, and device display pages.
- Project audit command/result: `audit_project.py <project-root> --mode strict` before completion.
- CRUD full-flow evidence: Institutional network, `tests/institution-media-publishing-route.test.ts`, `tests/media-approval-route.test.ts`, and API/component tests.
- Failure-path evidence: Permission, scope, pending-content exclusion, validation, duplicate-submit, and alert cancellation tests.

### P2 implementation record (2026-09-05)

The P0/P1 reconciliation note above is historical. `docs/PLAYER_RECOVERY_BASELINE.md` records P2 software behavior, verification and remaining hardware gates. Player acknowledgments, reported completed plays, manual declarations, demo ticks and audience estimates remain distinct. Read-only digital allocation copy appears before offline acceptance and explicitly states UTC / 24-hour operation / no dayparts. Unknown delivery does not become a missed-play claim.

Offline media uses the same `DeviceScreen` layout and tokens; `PlayerRotation` is its business-specific evidence-producing media region. Public preview carousels never receive event callbacks. Local outbox writes are queued, bounded and scoped to the original paired identity. Storage failure pauses playback; cached content never overrides an explicit online stop or an expired lease. New copy uses the existing English-source/French catalog. The real 24-hour hardware soak and native French review remain release checks.

## P3 advertiser and field operations

Campaign detail owns the cost breakdown, persisted creative version reviews and per-placement readiness. Quote confirmation freezes estimate lines as confirmed terms; repeat campaign starts a fresh draft with blank dates. Placement-specific artwork may be submitted separately. Replacement artwork starts without approval and cannot silently replace printed work.

StaticOperationsPanel owns phone assignment, private access notes, scheduling, upload retry and installation completion. Completion is server-authoritative and idempotent; blocked work requires rescheduling before completion. Completion photos are private by default and become client-visible only when explicitly shared. Both list and direct-photo APIs enforce that distinction. Static proof and digital player evidence remain separate.

P3 verification and operating limits are recorded in `docs/ADVERTISER_STATIC_PILOT_BASELINE.md`.

## P4 fleet operations

Bulk operations act on explicit selected screens and show each target result. A stale version requires refresh before retry. Owners publish; department editors submit content for approval within their saved screen scope. Scope changes revoke sessions. Privacy is separate from advertising opt-in; changing visibility requires an empty screen. Alert receipt, application, browser rendering and restoration remain separate, and missing/stale reports never imply successful physical display. Fleet controls include English/French copy, labelled inputs, keyboard operation and a phone layout with horizontally scrollable alert columns.
