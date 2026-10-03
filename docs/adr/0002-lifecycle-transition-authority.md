# ADR 0002: Lifecycle state and transition authority

- Status: Accepted as a technical boundary; named product-policy decisions remain open
- Date: 2026-08-24
- Related plan: `docs/DEVELOPMENT_PLAN.md`

## Context

Campaign, creative, static fulfillment, and digital fulfillment have different evidence and actors. A single broad status would permit invalid transitions and make mixed campaigns misleading.

## Decision

State transitions are server-authoritative, pessimistic for approvals and externally visible work, and recorded as immutable activity events. The client requests a transition and announces success only after the server commits it. Invalid current state or record version returns `409`; invalid transition input returns `422`; authentication, authorization, and missing records remain distinct `401`, `403`, and `404` outcomes.

### Campaign summary

`draft → planning → proposed → confirmed → in_fulfillment → live → completed`, with `cancelled` available only under an explicit cancellation policy. Campaign status is derived or validated against its placements and never erases placement blockers.

### Placement

`draft → requested → held → confirmed → creative_required → ready_for_fulfillment → live → completed`, with `declined`, `cancelled`, and `expired` exception states. `held` is defined structurally but cannot be enabled until decisions PD-001 and PD-002 are resolved.

### Creative

`draft → submitted → changes_requested → client_approved → operator_approved → production_ready`, with `rejected` and `superseded` exceptions. Every approval references an immutable creative version. Client approval and operator technical approval are separate capabilities.

### Static fulfillment

`not_ready → preflight → approved_for_production → in_production → ready_to_install → installation_scheduled → installed → proof_published → removed`. Delay, access, damage, partial completion, reprint, and reschedule are issue/event records; they do not masquerade as digital delivery states.

### Digital fulfillment

`not_ready → approved_for_scheduling → scheduled → delivered → verified`, with `missed`, `late`, and `unverifiable` evidence outcomes. Raw player events are immutable and idempotently ingested; aggregates are derived.

## Transition authority

- Campaign drafting/planning: authorized organization planner or account manager.
- Commercial proposal/confirmation: authorized commercial member; exact binding authority remains PD-001/PD-006.
- Client creative decision: explicitly authorized reviewer; agency-on-behalf authority remains PD-005.
- Operator technical decision: media-owner/institution operations or Super Admin within server-resolved scope.
- Production and installation transitions: assigned operations/vendor capability within organization scope.
- Static completion: assigned field operator with required evidence; publication of proof is a separate authorized action.
- Digital delivery evidence: trusted ingestion boundary; manual delivery tick remains demo-only.
- Permission changes: organization owner/admin only.

## Concurrency, audit, and idempotency

Every mutation supplies a record version or expected `updated_at`. Multi-record transitions use a transaction. Create/confirm/complete and external-effect endpoints accept an idempotency key. Activity records include organization, actor, action, subject, previous/next state, exact version references, timestamp, and safe metadata.

## Rollout and rollback

Lifecycle enforcement ships behind the owning feature flag. Rollback disables new entry points and returns UI reads to the compatibility adapter; it does not rewrite historical events or delete new records. A state introduced to production is never silently mapped to a misleading legacy state; the adapter must expose an explicit blocker/unknown mapping.

## Consequences

The UI must show per-placement next actions and recovery. Mixed campaigns can progress unevenly without presenting false campaign-level success. Policy-dependent transitions remain disabled until their decision record is accepted.
