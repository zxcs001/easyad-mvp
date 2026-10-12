# EasyAD competitive review

Reviewed: October 11, 2026.

## Assessment and scope

EasyAD has a substantial pilot implementation. Its largest competitive gaps are dependable operation on real hardware, a complete commercial service, useful content integrations, and evidence that customers receive value and return. More interface features alone will not close those gaps.

This review uses the current repository and live retrieval of competitors' official public pages. Competitor capabilities and prices are vendor claims, not independently tested results. EasyAD's documentation records local verification; this review did not inspect deployment configuration, production usage, signed inventory agreements, or customer revenue. Demo screens and bookings do not establish real supply or demand. Features behind flags may not be available in a deployed environment.

AdQuick and Blip primarily compete for advertising buyers. Yodeck, OptiSigns, and Rise Vision primarily compete for screen operators, although their advertising capabilities overlap. OptiSigns' Ads Portal is a particularly relevant emerging competitor.

Recommended initial market hypothesis: Canadian institutions and community venues that need controlled screen publishing and, where permitted, optional advertising from nearby businesses. Validate this with buyers before treating it as the permanent strategy.

## Competitor comparison

| Competitor | Publicly offered advantage | EasyAD's remaining gap | Recommended response |
|---|---|---|---|
| AdQuick | Cross-vendor, multi-market OOH buying and consolidated contracting; audience planning; web/app/footfall attribution and lift measurement. | A comparable contracted inventory network and advanced measurement are not established by the repository. EasyAD's audience filters and estimated views do not provide equivalent audience targeting or causal attribution. | Build trustworthy inventory density in one local market. Improve source/freshness disclosure and outcome reporting. Consider measurement partners after sufficient campaign volume. |
| Blip | Flexible digital billboard buying with buyer-set daily budgets, variable per-play pricing, and start/stop controls. | EasyAD's existing budget mode buys whole days on a selected screen. It does not reproduce Blip's bid-based allocation and pay-per-play settlement; real payment processing is absent. | Improve the existing fixed-price workflow first: clear total, available dates/dayparts, approval turnaround, cancellation rules, and delivery reconciliation. Test demand for daily pacing before building auctions. |
| Yodeck | Broad CMS, layout tools, 800+ templates and 90+ essential apps in its Basic plan; office integrations and enterprise identity/governance in higher tiers. | EasyAD has three built-in advertiser template themes and a much narrower content/integration surface. Fleet governance exists, but SSO/MFA integration and broad hardware qualification remain open. | Add a small set of frequently used institutional integrations and branded templates. Qualify one managed player configuration. Avoid competing on template count. |
| OptiSigns | Broad integrations, playback reports, and remote device operations on supported proprietary players. Its Ads Portal beta targets networks with 100+ screens and describes advertiser invitations, approval, and payouts. | Device administration, settlement, and screen monetization overlap EasyAD's intended market. A combination of signage and ads is insufficient differentiation. | Focus on smaller Canadian institutional/community networks, accountable publishing, reserved airtime, local advertiser acquisition, and service. Benchmark Ads Portal again before expanding to large retail networks. |
| Rise Vision | School/institution content, extensive templates, CAP emergency integrations, device screenshots, SAML SSO, and published security/support assurances. | Institutional buying requires more than a dashboard: identity integration, deployment support, reliable devices, useful daily content, and procurement evidence. EasyAD's Alert Ready relay is implemented against synthetic messages, with live-feed release gates still open. | Strengthen deployment and support, produce a procurement pack, and validate the existing Canadian alert relay. Add other alert integrations only when a buyer needs them. |

Sources: [AdQuick Marketplace](https://www.adquick.com/marketplace), [AdQuick measurement](https://www.adquick.com/analytics), [Blip pricing/model](https://www.blipbillboards.com/pricing/), [Yodeck plans](https://www.yodeck.com/pricing/), [OptiSigns plans](https://www.optisigns.com/pricing), [OptiSigns device commands](https://support.optisigns.com/hc/en-us/articles/360055486554-Remotely-Control-and-Command-OptiSigns-Devices), [OptiSigns Ads Portal beta](https://www.optisigns.com/ads-portal), [Rise Vision plans](https://www.risevision.com/pricing), and [Rise Vision emergency integrations](https://www.risevision.com/software/emergency-alerts).

Yodeck also documents [playback reports](https://www.yodeck.com/docs/user-manual/playback-reports/). Proof of play is a useful baseline capability, not a sufficient differentiator by itself. An absence from this comparison is not evidence that a competitor lacks a feature.

## Existing strengths to preserve

- **Institution authority:** separate institution workspace, owner publishing, scoped staff approval, private-screen controls, advertising opt-in, category restrictions, reserved institutional airtime, and audit history. See [fleet baseline](INSTITUTIONAL_FLEET_BASELINE.md).
- **Digital delivery:** paired authenticated browser players, automatic updates, schedule/capacity validation, offline caching/outbox, playback reports, and bounded alert restoration. These are implemented and locally verified; physical acceptance remains separate. See [player recovery](PLAYER_RECOVERY_BASELINE.md) and [kiosk qualification](CHROMIUM_KIOSK.md).
- **Advertising workflows:** dates or budget planning, dayparts, availability calendar, alternative dates, uploaded artwork, three ready-made designs, creative approval/versioning, mixed campaigns, and repeat drafts. See [booking UI](../app/component/booking-view.tsx) and [P3 baseline](ADVERTISER_STATIC_PILOT_BASELINE.md).
- **Static operations:** quotes with separate production costs, installation/removal tasks, phone-friendly proof upload/retry, and private proof sharing. Preserve this for buyers who need mixed campaigns; it need not dominate the first digital pilot.
- **Responses and language:** QR/short-link events, reported promo-code uses, printable reports, English/French support, and accessibility work. See [results reporting](RESULTS_REPORTING.md). Language support still needs native review for release.

These capabilities are a foundation for a focused service. They do not establish a unique market position, production reliability, or customer adoption.

## Ranked improvements

### 1. Correct credibility gaps immediately

Implemented on October 11: the dashboard and printable report now share delivery summaries that separate authenticated player outcomes, operator declarations and demo records. They show estimated views/CPM, preserve unavailable values, and reconcile reserved schedules using dates, local dayparts and DST. This replaces the earlier `Times your ad was seen`, `Delivered impressions` and `Verified CPM` labels and `booking.pop` calculations. See [results reporting](RESULTS_REPORTING.md) for sources and limits.

The [assistant](../app/lib/chatbot.ts) currently returns a static greeting and ignores conversation history. Replace the visible experience with useful guided help or hide it until it can answer real questions. Connecting an LLM is optional; a working help flow is the immediate requirement.

[Payment processing](../app/lib/payments.ts) simulates charges and refunds. Keep it disabled for real business. Align every buyer-facing statement with the actual inquiry, operator confirmation, and offline acceptance workflow.

### 2. Prove unattended operation and make recovery practical

Start with one supported managed Windows or Android player configuration. Complete the outstanding physical 24-hour acceptance, then run a longer observed pilot with reboot, power loss, network interruption, expired media, storage pressure, and alert interruption/restoration scenarios.

Browser fleet diagnostics now include actionable problems and freshness timestamps, with owner-triggered content refresh, kiosk reload and atomic media-cache rebuild. A bounded playback watchdog handles an overdue rotation, and the Windows launcher has an optional process-exit relaunch watcher. See the [fleet recovery runbook](FLEET_DIAGNOSTICS_RECOVERY.md). Remote screenshots, OS reboot, startup after reboot and device configuration still need a supported runtime/MDM integration. A browser report does not prove the physical panel is visible or switched on; physical qualification remains open.

The current kiosk documentation explicitly separates fullscreen/wake lock from OS lockdown and startup after reboot. The fleet snapshot is capped at 500 screens and 500 media records, and bulk actions at 100 targets. Add pagination and representative load checks before selling larger deployments; do not confuse these bounds with measured capacity.

### 3. Create a usable local advertising market

Secure authorized, genuinely sellable inventory in one city before spreading across regions. Require real venue photos, current rates/availability, operating hours, content restrictions, and audience source/date. Existing data-quality checks can support onboarding; add operational evidence and commercial permission checks.

Extend the existing budget/daypart flow with a few curated local packages and clear explanations of why each venue fits a buyer's objective. Address search needs an actual geocoder integration: the repository ships regional search and an optional street-provider interface, not a default street service. A filter maximum starting at CAD 400/day is also a poor comparison tool for genuinely small budgets; adapt filters to actual inventory and total campaign affordability.

Define approval turnaround and communicate approval, rejection, creative deadlines, and first delivery. Existing in-app notifications are a starting point. Treat outbound notification delivery as a separate product capability to implement deliberately.

Owner acquisition is as important as advertiser acquisition. Show participating venues net proceeds, reserved content time, staff effort, and support burden, while allowing institutions to remain entirely advertisement-free.

### 4. Complete the commercial loop after policy decisions

The [decision register](PRODUCT_DECISIONS.md) explicitly defers merchant-of-record/payout choices, and [payment phase 7](DEVELOPMENT_PLAN.md) remains deferred. Resolve who invoices, receives funds, pays owners, handles cancellation/refunds, and accounts for interrupted or underdelivered campaigns before selecting a payment integration.

For a supervised pilot, operator-confirmed quotes, offline acceptance, real invoicing, and manual reconciliation can be enough to test willingness to pay. Track them truthfully. When self-service demand warrants automation, implement hosted payments, authenticated/deduplicated webhooks, reconciliation, refunds, and owner settlement. Enabling the mock flag is not a launch step.

Test a fleet subscription/onboarding fee for institutions and a clearly disclosed fee for booked advertising. Measure contribution after owner proceeds, infrastructure, creative work, and support. CMS pricing offers a useful comparison: Yodeck's public monthly Basic rate lists CAD 12/screen, while OptiSigns Standard lists CAD 13.50/screen/month. These are different feature bundles, not recommended EasyAD prices. A premium needs a demonstrated operational or revenue benefit.

### 5. Improve content creation and daily utility selectively

Extend the three advertiser designs with venue-relevant templates, actual logo/image input, brand colors, and layouts checked against target screen dimensions. A small, well-maintained library can serve the pilot better than hundreds of templates.

Implemented on October 11: the digital creative editor now adds validated brand colours, PNG/JPEG logo input, three layout choices, typography controls, undo/redo, account-and-campaign-scoped local drafts, reusable local brands, and a native-dimension live/enlarged preview. Preview and submission share the same renderer and preserve the approval flow. See [creative editor](CREATIVE_EDITOR.md) for implementation and limits. Additional theme content, freeform composition, and cloud brand sharing remain separate work.

Choose the first integrations from buyer interviews: calendars, Sheets/CSV, or a familiar design workflow are plausible candidates. The weather/transit widgets include sample data; turn only demanded widgets into live services with source, freshness, caching, and failure behavior. Content automation makes the product useful between advertising campaigns.

Implemented on October 11: institution screen media now supports daily/weekly recurring hours, local timezone and daylight saving rules, overnight windows, optional date bounds, pause/resume, revision conflicts, and owner review of operator changes. The paired player applies received rules offline within its existing lease. See [recurring content schedules](RECURRING_CONTENT_SCHEDULES.md) for behavior and limits. Multiple windows, holiday exceptions, and a calendar timeline remain separate work.

Consider one carefully tested adapter for an institution's existing signage platform when it reduces migration cost. Existing public media APIs are a starting point, but an adapter must separately validate authentication, schedules, private content, interruptions, and evidence provenance.

### 6. Make reporting useful without overstating attribution

Show planned allocation, eligible delivery, reported completed plays, interruptions, unknown periods, and audience estimates separately. Unify evidence across legacy bookings and campaign placements instead of presenting different confidence levels under a common verified label.

QR/link counters record events, not unique customers. [costPerResponse](../app/component/responses-panel.tsx) adds scans/visits and self-reported promo uses; a customer can contribute to both, so the combined metric cannot establish customer acquisition cost or sales ROI. Prefer separate cost-per-link-event and reported-redemption metrics, or explain the combined event denominator explicitly.

Next, add consistent campaign/creative tagging, optional lead collection or merchant redemption integrations, and screen/creative comparisons with stated sample sizes. QR codes fit venues with dwell time; choose readable URLs or other response methods for roadside inventory. Advanced footfall/lift work should follow adequate data and a suitable partner, rather than copying AdQuick's claims.

### 7. Become easier for institutions to buy and support

Confirm identity requirements during pilot qualification and fulfill the existing SSO/MFA gate before broader rollout where required. Preserve existing scoped permissions and revocation behavior. Prepare concise deployment, hosting/data handling, backup restoration, access control, support, and incident-response documentation with evidence for each claim.

Validate the existing Alert Ready relay against its live-feed release gates; do not describe synthetic-message tests as production integration. Add drill/test workflows and review the recipient's acknowledgement/unknown states. Offer a useful pilot/demo contact path on the existing institutional landing page, whose current account-acquisition instruction is to contact a Super Admin.

## Proposed 90-day sequence

These are planning targets, not promises or competitor benchmarks. Hardware procurement, institutional approvals, and identity setup may extend the schedule.

| Window | Focus | Evidence to produce |
|---|---|---|
| Days 1–30 | Correct metrics/help/claim gaps; qualify a managed player; add operational visibility; interview buyers and recruit 2–3 prospective venue/institution partners. | Documented physical recovery results, reproducible deployment/restore procedure, clear product positioning, and permitted inventory with real prices. |
| Days 31–60 | Run an authorized pilot in one city with roughly 10–20 screens and 5–10 local advertisers if recruitment supports it; improve existing purchasing flow; add the most demanded content integration. | Actual first-delivery times, approval delays, playback problems, response events, staff effort, invoice/reconciliation evidence, and reasons people abandon or decline. |
| Days 61–90 | Correct recurring failures; test repeat purchasing and contribution margin; complete required identity/procurement work; automate payment only if the policy and pilot justify it. | A case study with real denominators, repeat demand, support cost, owner benefit, and a justified decision to expand or revise the market hypothesis. |

Track six measures consistently: time from pairing to first delivered content; publication-to-acknowledgement latency for online devices; scheduled-delivery completeness with interruptions/unknowns separate; request-to-confirmation conversion; repeat buying among advertisers eligible to repeat; and contribution/support effort per completed campaign. Exclude demo/test activity and show cohort dates and sample sizes. The existing [funnel endpoint](../app/api/metrics/funnel/route.ts) counts actions/states; it does not yet establish those complete funnels.

## Strategic decision

Keep the present architecture and develop the narrow service that customers will buy repeatedly. The proposed offer is controlled institutional publishing with optional local sponsorship, supported deployment, and transparent results. OptiSigns' monetization beta means geography, buyer fit, operations, and actual local relationships must do the differentiating work.

Defer broad hardware coverage, ad auctions, large integration catalogues, speculative AI campaign generation, and audited-reach claims until pilot evidence shows which investment changes purchase or retention decisions. Preserve the existing separate advertiser and institution experiences; make their acquisition paths and value propositions clearer.
