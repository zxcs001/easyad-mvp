# ADR 0003: Provisional non-payment operating policy

- Status: Accepted, provisional and supersedable
- Date: 2026-08-24
- Decision owner: Product owner
- Scope: Phases 2–6; payment remains excluded

## Decision

1. Placement requests are inquiries. The first release does not create temporary holds.
2. Operator confirmation followed by recorded offline acceptance creates the binding placement.
3. A confirmed static face is exclusive for its posting date range. Posting cycles are represented by placement start/end dates plus removal or replacement work orders.
4. Client approval and media-owner technical/content approval are separate. The media owner has final placement authority.
5. An agency may approve for a client only when an explicit, revocable authorization record grants that capability; every decision records the acting user and authorization.
6. Plan costs are estimates until they become immutable lines on an operator-confirmed quote.
7. The media owner coordinates print and installation by default; responsibility may be assigned to an authorized vendor organization.
8. Proof photos are private by default. Explicitly authorized photos may be shared with the client; none are public in the initial implementation.
9. Creative masters, approvals, audit events, and proof records are retained for seven years. Ordinary comments and private access/installation notes are retained for two years. Automated retention execution requires a separately reviewed job and legal/privacy review; current implementation records retention class and expiry without destructive deletion.
10. External preclearance is an operator-managed manual checklist. EasyAD never represents a review as legal or regulatory clearance.
11. Audience data defaults to `operator_reported` with source and freshness. `audited` requires a supporting evidence reference.

## Change policy

These rules are intentionally provisional. A later ADR may supersede them prospectively. Existing quotes, approvals, specification snapshots, fulfillment records, and audit events remain immutable; migrations must not silently reinterpret historical decisions.

## Payment boundary

This ADR does not authorize checkout, card collection, charges, refunds, invoices as payment demands, merchant-of-record decisions, or payouts. The `payments` feature flag remains off.
