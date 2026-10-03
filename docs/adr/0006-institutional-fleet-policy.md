# ADR 0006: Institutional fleet publishing and privacy

Status: accepted for the local P4 implementation; production rollout remains gated.

Owners publish directly. Delegated operators submit media for owner approval and receive an explicit set of screen IDs. Building/department filters select concrete targets; they do not confer permission. Every bulk target has its own transaction, version check and result. Retry rejected targets after refreshing; a changed version prevents accidental replay of a successful operation. Existing null operator scope preserves legacy institutional access until the owner assigns a scope; an empty scope grants no screen access. Scope changes and revocation invalidate sessions immediately.

Privacy and advertising eligibility are independent. Existing screens retain public compatibility; institutional screens require explicit advertising opt-in. Changing visibility requires an empty screen, and policy changes are blocked while active commercial commitments exist. Uploads lock the screen against concurrent visibility changes. Existing downloaded public content cannot be recalled; migrate private material to a fresh private screen and upload it there. Private content cannot be copied to a public target.

Private players use authenticated manifest and asset endpoints and a maximum 60-second manifest lease. Expired offline players stop displaying content; cached bytes are not a remote-wipe guarantee. Public profiles and public media endpoints deny private screens. Use managed, physically secured devices for private material. Existing commercial commitments continue to play while their policy is unchanged.

Owners explicitly opt in to advertising, identify restricted content categories, and reserve institutional seconds per loop. Confirmation rechecks policy and capacity. Categories are normalized and compared against the advertiser-declared category; this is not automated content classification.

Emergency alerts interrupt ordinary rotation. Received, applied, browser-rendered and restored timestamps are distinct; missing reports stay unknown, and stale connections are shown explicitly. Visible browser reports do not verify the physical panel and do not deliver to official public-alert networks. Interrupted advertising is recorded as interrupted, never completed. Compensation, credits and refunds remain blocked pending an approved commercial policy.

Fleet audit rows record actor, target scope, resource, revision, priority, result and timestamp, without creative or alert bodies. Audit retention is marked seven years; player alert state is marked 90 days. These are retention metadata, not a deployed deletion job; P5 must approve operational retention and cleanup.

The pilot owner confirmed that no institutional SSO/MFA provider is currently required. Provider selection/integration is deferred as an explicit rollout gate. Before broad rollout, obtain the institution's identity requirements, select a maintained provider if required, verify MFA/SSO and recovery, and review legacy unrestricted memberships. Do not treat local session revocation as MFA.
