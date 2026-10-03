# EasyAD baseline product-event and usability metrics

Snapshot date: 2026-08-24  
Scope: pre-campaign-v2 MVP  
Privacy rule: no creative copy, alert text, access notes, credentials, file contents, or direct personal identifiers enter product-event properties.

Update (2026-09-05): the current repository includes `activity_events` aggregation and campaign-state counts at `/api/metrics/funnel`. This file's original baseline is historical; those aggregate counts still do not establish complete production funnels, conversion denominators, abandonment rates, or a customer baseline. P0/P1 player verification and local latency samples are recorded separately in [the pilot baseline](PLAYER_PILOT_BASELINE.md) and exclude production activity.

## Current baseline

The application does not currently have a production analytics sink or a canonical product-event table. Therefore the Phase 0 numerical baseline is **not available**, rather than inferred from demo seed data or login counts. Existing PostgreSQL booking, creative, transaction, and proof-of-play records can support operational checks, but they do not capture task starts, abandonments, revision reasons, static installation, or support requests consistently.

This explicit zero-instrumentation baseline prevents demo activity from being presented as user evidence. Event collection begins only after privacy/retention ownership is accepted and the relevant phase owns the domain record.

## Canonical event envelope

Future product events use: `event_id`, `event_name`, `occurred_at`, `organization_id`, `actor_id` (pseudonymous/internal), `session_id` (rotating), `subject_type`, `subject_id`, `workflow_stage`, `outcome`, `source`, and a versioned allow-listed `properties` object. Server-confirmed lifecycle events are canonical for completion; client events may measure views, starts, validation, and abandonment but never invent completion.

## Event catalogue and metric derivation

| Metric | Start/event source | Completion/event source | Phase |
|---|---|---|---|
| Creation to first saved media plan | `campaign.created` | `media_plan.saved` | 2 |
| Multi-placement plan rate | `media_plan.saved` placement count | same server event | 2 |
| Plan-to-confirmation conversion | `media_plan.proposed` | `commercial_terms.confirmed` | 2 |
| Confirmation to creative-ready | confirmed event | `placement.creative_ready` | 2–3 |
| Creative revision rounds/reasons | immutable review and version events | derived | 3 |
| Static on-schedule and delay reason | planned work order | completion/issue event | 4 |
| Proof-of-posting completion time | installation completed | proof published | 4 |
| Digital delivery discrepancy rate | raw scheduled/playback events | derived exception | 5 |
| Launches with blockers | launch transition attempt | blocker snapshot | 2–5 |
| Support requests per completed campaign | support-link event/record | campaign completed | 6/integration |
| Completion/abandonment by stage | `workflow.stage_started` | server completion or bounded inactivity definition | 2–6 |

## Baseline capture gate

Before enabling collection, define an owner, retention period (PD-009), consent/privacy notice impact, environment filtering, bot/demo/test exclusion, and deletion/export behavior. Validate event schemas in tests, deduplicate server events by `event_id`, and publish dashboards with sample size and date range. Total logins are not a primary success metric.
