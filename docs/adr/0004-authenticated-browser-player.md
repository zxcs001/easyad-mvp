# ADR 0004: Authenticated browser player control

- Date: 2026-09-05
- Status: Implemented for the P1 pilot; field-hardware qualification remains a release check
- Authority: User request to implement P0 and P1 of the technical improvement plan
- Scope: Publishing synchronization and acknowledgments, not campaign scheduling or proof of play

P2 amendment: [ADR 0005](0005-player-scheduling-and-evidence.md) supersedes this ADR’s P1-only caching, scheduling, alert restoration, playback evidence and lease rules. The original P1 decisions below are retained as historical context; pairing, credential and owner boundaries remain in force.

## Identity and authorization

A player is a registered runtime bound to one digital inventory unit. A partial unique index permits one active player per inventory unit. Only the owning Institution account or Super Admin can create a pairing code, inspect player status, or disconnect the player. Delegated operators retain their existing publishing/review workflow and cannot enroll players.

Pairing codes contain 48 random bits, expire after ten minutes, are stored as SHA-256 hashes, and can be redeemed once. Generating a replacement code invalidates the previous unused code. Database row locks serialize enrollment and replacement. Pairing checks that the issuing user still has owner/admin authority and an active account.

The paired browser receives a random 256-bit credential in an HTTP-only, SameSite=Strict cookie scoped to `/api/player`, with Secure enabled in production. Only its SHA-256 hash is stored in PostgreSQL. Credentials are never returned in JSON, placed in URLs, or persisted in browser JavaScript storage. The browser cookie expires after one year; server-side revocation takes effect on the next authenticated request. The current origin/CSRF checks apply to pairing and player mutations. P1 does not expose a bearer-token integration for external devices.

Each authenticated request resolves its inventory binding server-side and rechecks revocation, current institution ownership, digital delivery mode, and institution account status. A regular account session never grants device authority. Disconnect requires the expected player ID so a stale confirmation cannot revoke a newly paired replacement.

Pairing attempts are rate-limited in PostgreSQL across application instances: ten attempts per minute per hashed ingress client key and a global ceiling of 300 per minute. The proxy must normalize incoming forwarding headers; the global bound remains effective independently. Expired rate-limit buckets are transient operational state and are removed after ten minutes. No raw client address is retained.

## Content and revisions

`/player` is the authenticated runtime. Existing public `/devices/[id]`, inventory profiles, and public media APIs retain their current contracts. Opening them never sends acknowledgments or heartbeats.

Manifest generation reuses the public media eligibility builder and database selectors with the active transaction connection. It therefore preserves current owner-media approval and legacy advertiser campaign/date eligibility, supports a one-connection database pool, and does not introduce a separate content-approval policy. Campaign-v2 scheduling remains P2 work.

Manifests snapshot display settings, approved media references and ordering, source dates, image duration, advertiser date boundaries, and the active institution-owned override. Media IDs plus creation time and URL identify the asset version; this reference hash is not a cryptographic measurement of the underlying media bytes. Uploaded files must continue to receive new immutable identities when replaced. Video duration follows the existing media-ended behavior and is not a guaranteed delivery allocation.

Revisions are monotonic per player and stored with a content hash. Unchanged, valid content produces an authenticated 304 response to the matching ETag. A new lease creates a new revision even if content is otherwise unchanged. Removing content, ending an alert, or unpublishing changes the manifest.

P1 polls every ten seconds with jitter and bounded backoff; heartbeat defaults to 30 seconds and connectivity becomes stale after 90 seconds. Settings have bounded server-side configuration. Heartbeats update current state, not an unbounded heartbeat-history table.

## Acknowledgments and failure behavior

The stages are `received`, `validated`, and `applied`, in that order. The server accepts only the current, unexpired revision belonging to that player. Repeated acknowledgments are idempotent and do not advance the original applied timestamp. `validated` means media elements loaded sufficiently for this online runtime; it does not mean a complete offline cache. `applied` means React committed the revision to its display component; it is neither a completed media play nor proof that a physical panel is illuminated.

The owner sees expected and acknowledged revisions, contact time, applied time, and allow-listed error state/time. Last playback is explicitly unavailable in this release. Neither `pop_logs` nor `digital_delivery_events` is populated by this feature.

The runtime prepares replacement media before switching. Explicitly removed/replaced assets, unpublishing, and overrides clear the prior renderer immediately upon receipt, including when new media fails to prepare. Eligible last-known-good content can remain during a connection/preparation failure only until its lease expires.

A manifest lease lasts at most five minutes and is capped by UTC date rollover and alert expiration. UTC preserves the existing legacy date-eligibility convention. The runtime enforces expiry locally and shows a neutral waiting screen. It does not restore manifests after a browser restart. Immediate cancellation is impossible while disconnected; the maximum stale-content window is the remaining lease, assuming the device clock/timers function. Hardware sleep and substantial clock changes remain field-qualification risks.

If a pairing response is lost after commit, the runtime first retries its connection to discover whether the cookie arrived. If it did not, the owner disconnects the waiting player and issues a new code. No hidden automatic replacement invalidates an already-paired device.

## Rollout, data, and rollback

`FEATURE_PLAYER_CONTROL` defaults off and is independent of campaign/agency/static flags. P1 enables it only in an explicitly configured pilot environment; it is not a per-organization cohort flag. Public content is still public. This work does not introduce a private-content storage promise.

Players and manifests use additive tables. Existing records, approvals, quotes, and media are preserved. Historical manifests are retained for pilot review; no new destructive retention job or production telemetry retention policy is introduced. Production volume/retention review belongs to later hardening. Operator-visible status never displays credentials or raw transport exception messages.

Rollback disables player control and/or restores the prior app image while retaining tables and evidence. An online runtime clears when the disabled endpoint returns 404. An unreachable runtime clears at lease expiry. Existing public displays continue to work and may be used deliberately as the previous operating mode; they do not inherit device authority.

## Verification

See [P0/P1 verification record](../PLAYER_PILOT_BASELINE.md) for commands, observed results, constraints, and hardware scope.
