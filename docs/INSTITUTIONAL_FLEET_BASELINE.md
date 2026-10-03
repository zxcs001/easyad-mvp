# Institutional fleet baseline (P4)

P4 software is implemented and verified locally. No production rollout was performed. The identity-provider requirement is deferred by the pilot owner, with an explicit gate before broader rollout.

## Implemented behavior

- Building/department filters and explicit screen selection; per-target transactions and stale-version rejection expose partial failures.
- Saved announcements reuse media, with exact start/end timestamps. Owners publish copies directly; scoped editors require approval and cannot act on other screens.
- Owner privacy controls are separate from marketplace advertising opt-in. Private screens deny public profiles/media and use authenticated player assets with a maximum 60-second offline lease.
- Advertising policy supports declared-category restrictions and reserved institutional airtime. Existing commercial commitments prevent conflicting policy changes.
- Per-player alert receipt, application, browser-render and restoration reports, with missing/stale states. Expiration and early cancellation restore ordinary rotation.
- Metadata-only audit records; scope changes and operator revocation invalidate existing sessions. Booking, creative and billing lists respect department scope.

## Local verification

The database integration scenario verifies cross-institution partial failure, stale retries, owner/editor capabilities, private asset denial, visibility migration rejection, reusable scheduled media, reserved capacity, alert reporting, and credential revocation. Timestamp tests cover inclusive starts and exclusive ends.

The Chrome scenario exercises owner policy controls, actual authenticated image playback, live alert rendering and restoration, saved announcements, scope changes and reauthentication, public endpoint denial, French labels, keyboard navigation, phone width and forced-color/200% zoom controls. The [phone capture](verification/p4-fleet-phone.png) was visually inspected. It does not establish WCAG certification or physical-panel visibility.

Final test counts and commands are recorded in [machine-readable verification](verification/p4-local-verification.json).

## Rollout gates and operating limits

- Confirm institutional identity requirements before broader rollout. Select and validate a maintained SSO/MFA provider if required; no provider was selected or integrated in P4, per the owner's instruction.
- Review legacy null operator scopes, which retain institution-wide compatibility until explicitly narrowed. Explicit empty scope grants no screen access.
- Private migration requires a fresh/empty screen. Publicly downloaded material cannot be recalled. The 60-second lease stops playback on expiry, but cached files are not remotely wiped; use managed devices and private durable storage.
- Fleet snapshot is bounded to 500 screens and 500 media records; a bulk action accepts up to 100 explicit targets. Larger deployments need pagination and P5 load validation.
- Browser reports are not physical display proof or official public-alert delivery. Offline reports may remain unknown; the dashboard must not infer success.
- Interrupted advertising is not completed delivery. Compensation remains disabled pending commercial policy; no credits or payment actions are introduced.
- Retention timestamps are recorded (audit seven years; alert state 90 days), but operational approval and deletion jobs remain P5 work.
- Physical 24-hour P2 soak, production migration/rollback rehearsal, native Canadian-French review and broader P5 release hardening remain open.

See [ADR 0006](adr/0006-institutional-fleet-policy.md) for policy and compatibility decisions.
