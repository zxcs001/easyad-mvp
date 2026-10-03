# P3 advertiser and static fulfillment pilot

Date: 2026-09-05
Scope: local software acceptance for technical improvement plan P3. Payments remain disabled. No production deployment or physical installation was performed.

## Delivered behavior

- Existing campaign plans support one static and two digital placements. Operator confirmation records confirmed cost lines; offline acceptance reserves inventory through the existing transaction and capacity checks. Static confirmation requires a specification snapshot and inventory dates must cover the placement. Draft date edits recalculate media costs. Cancelled placements do not reserve static capacity.
- Campaign details expose separate media, design, printing, installation and removal quote lines, specification versions, creative responsibility/due dates, and placement-specific next actions. Readiness and list blocker counts use approved creative and actual installation state. Digital evidence and static proof remain separate in reports.
- Supplied artwork, design requests and artwork-later use the existing creative workflow. Missing approved artwork blocks launch. Users can target a particular placement, upload a replacement version, and review persisted versions after reopening a campaign. Multi-placement static files must satisfy the common allowed file types; incompatible placements require separate uploads. Operator and client approvals remain separate; advertiser ownership does not grant operator approval. Bulk operator review uses the same lifecycle handler as individual review. A replacement receives no inherited approval. An approved replacement updates production only before printing or during an explicit reprint; existing printed/installed work retains its exact version.
- Production progresses through ready, in production, printed, shipped and delivered. Updates, installation readiness and audit writes are transactional. Completion requires accepted terms, delivered production and a ready/scheduled/in-progress install order. Blocked, unready, removed and already-installed orders cannot become live through completion. Removal is restricted to a removal task for a live placement. Physical replacement uses removal followed by a fresh placement/plan, preserving the prior proof.
- Phone operations expose assignment, scoped access instructions, scheduling, weather/access/partial-completion reasons, upload retry, server-restored uploaded evidence, and completion time. Conflicting edits return 409. Concurrent identical completion submissions return the same proof; retries do not duplicate proof or lifecycle writes. Successful installation resolves its outstanding placement issues.
- Completion photos default to private. Sharing requires an explicit checkbox. Both proof listings and direct photo delivery enforce owner/client-sharing scope. Reports expose only explicitly shared client proof. Stored files use the existing private-media delivery endpoint.
- Repeat campaign populates a fresh draft with inventory and brief, clears dates and carries over no quote, schedule, specification, artwork approval or proof. Saving follows the ordinary create/confirm flow and takes fresh snapshots.

## Local verification

Use Node.js 24 and the existing local PostgreSQL `*_test` database. The pilot runner uses the isolated `easyad_player_pilot` schema and disables payments. Commands were run with the bundled Node executable because the system Node/npm resolves through an inaccessible user installation.

```text
node scripts/verify-pilot.cjs test
node node_modules/next/dist/bin/next build
node scripts/verify-pilot.cjs browser
PILOT_CAMPAIGN_FLAGS=false node scripts/verify-pilot.cjs browser e2e/p3-pilot.spec.ts e2e/player.spec.ts --grep "P0 role boundaries|P3 advertiser"
python <installed frontend-design-premium>/scripts/audit_project.py . --mode strict
```

The new database scenario is `tests/p3-pilot-db.test.ts`: three placements, exact-version approvals, immutable confirmed terms, ordered production, independent weather delay, stale versions, blocked completion, concurrent retries, private proof, foreign organization denial and unapproved replacement. Existing player evidence tests cover authenticated digital ingestion and schedule association. The new Chrome scenario is `e2e/p3-pilot.spec.ts`: supplied PNG approval, phone scheduling/access notes, simulated upload transport failure and retry, explicit client sharing, report access, new-date repeat draft and French loading. Screenshot: `docs/verification/p3-phone.png`.

The regression run also exposed and fixed specification creation exhausting a one-connection database pool, and test reset retaining pairing-rate-limit buckets across consecutive runs. The latter is a test reset fix; production rate limiting remains unchanged.

Final results: 177 unit/component/database tests passed across 56 files; the expanded P3 database scenario also passed separately. All 17 enabled-feature Chrome tests passed. The focused disabled-feature matrix passed, with the P3 scenario intentionally skipped. Production build, strict UI audit (zero findings), and whitespace check passed.

Exact final command results are recorded in `docs/verification/p3-local-verification.json`.

## Pilot limits

- This is software acceptance using local fixtures and a simulated weather delay; it does not certify a real billboard installation, printer output or physical display visibility.
- The P2 physical 24-hour soak remains open. Digital reports are authenticated player reports, not measured audience views.
- Operator-specific manual print preflight and native Canadian-French review remain release checks.
- Monetary defaults remain the existing planning estimates until an operator confirms them; no new procurement or payment policy is introduced.
- No destructive retention job, production deployment or payment collection is included.
