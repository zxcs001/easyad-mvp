# ADR 0001: Campaign, placement, organization, and fulfillment boundaries

- Status: Accepted for additive implementation
- Date: 2026-08-24
- Decision owners: Product and engineering
- Related plan: `docs/DEVELOPMENT_PLAN.md`

## Context

The MVP stores a booking as both the campaign intent and one inventory reservation. That shape cannot safely represent multi-unit plans, mixed static/digital delivery, agency clients, or separate commercial and fulfillment lifecycles. Existing booking, institution, and public-device behavior must remain operable during migration.

## Decision

`Campaign` is the advertiser or agency objective and owns one or more `Placement` records. A placement is the dated commercial and fulfillment commitment for one inventory unit. A campaign may contain digital and static placements.

Every new domain record is scoped to an `Organization`; server-side capability checks resolve membership and organization scope on every route. The legacy global `users.role` remains a compatibility input until membership backfill and route migration are verified. The persisted `institutional` role and government workspace are preserved.

Inventory uses a shared inventory-unit concept. Each unit has an explicit delivery mode. Static fulfillment uses production jobs, installation work orders, and proof of posting. Digital fulfillment uses scheduling, player-event ingestion, and proof of play. Neither workflow reuses the other's state names or evidence.

Production specifications are versioned per inventory face. A placement snapshots the applicable version before approval or fulfillment so later inventory edits cannot silently alter committed work.

Legacy `bookings` remain available while the new model is behind `campaign_model_v2`. Migration uses one of two compatible paths:

1. backfill one campaign and one placement for each booking, retaining a stable legacy booking reference; or
2. use a tested adapter that exposes the same mapping until backfill is safe.

New writes must not dual-write without one transaction and an idempotency strategy. Legacy fields are not renamed or removed in Phases 1–4.

Commercial terms are quotes and offline acceptance events. They are not charges, invoices, or proof of payment. Payment collection remains behind the `payments` flag and outside current scope.

## Migration and rollout

- Add tables and nullable references idempotently.
- Backfill in deterministic batches and record a migration version.
- Validate counts, ownership, dates, amounts, and legacy-reference uniqueness before enabling reads.
- Enable `campaign_model_v2` only for explicitly selected environments/scopes.
- Preserve legacy reads and writes until parity tests and rollback rehearsal pass.

## Rollback

Disable `campaign_model_v2` to return reads and UI navigation to legacy bookings. Additive tables and columns remain intact; rollback does not delete migrated data. Any dual-write introduced later must document reconciliation before rollout.

## Consequences

The migration takes longer than replacing bookings directly, but it preserves existing advertiser, operator, institution, and public-device workflows. Campaign status becomes a summary; placement and fulfillment records remain the source of operational truth.

## Unresolved policy

The open choices in `docs/PRODUCT_DECISIONS.md` remain product decisions. This ADR does not infer reservation authority, exclusivity, approval authority, procurement, retention, audience-data rights, or merchant-of-record policy.
