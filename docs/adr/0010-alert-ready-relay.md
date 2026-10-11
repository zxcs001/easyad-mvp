# ADR 0010: Relay Alert Ready alerts to institution screens

- Date: 2026-10-09
- Status: Accepted. Software implemented and tested against synthetic CAP-CP messages. Not yet run against the live NAAD System feed (see Release gates).
- Authority: Yuchen asked for automatic emergency alerts from the official Canadian alert feed (Alert Ready)
- Scope: The institution workspace (Emergency updates) and paired players. It changes nothing for the marketplace.

## Context

Institutions publish their own emergency overrides today (see [Emergency updates](../EMERGENCY_UPDATES.md)). Screen-management competitors (ScreenCloud, Rise Vision) take alerts from Common Alerting Protocol (CAP) sources so a person does not retype them in a crisis.

In Canada the official source is the **NAAD System** (National Alert Aggregation & Dissemination), operated by Pelmorex. It carries every Alert Ready message as CAP-CP XML. Pelmorex makes it available to Last Mile Distributors (LMDs) at no charge. The facts below come from the [NAAD System LMD User Guide R10.0](https://alerts.pelmorex.com/wp-content/uploads/2019/12/NAADS-LMD-User-Guide-R10.0.pdf) and the [Pelmorex FAQ](https://alerts.pelmorex.com/frequently-asked-questions/):

- TCP streams at `streaming1.naad-adna.pelmorex.com:8080` (Oakville) and `streaming2.naad-adna.pelmorex.com:8080` (Montreal), raw XML, each message from `<alert` to `</alert>`.
- A heartbeat (`sender` NAADS-Heartbeat, `status` System) every 60 seconds. It lists the last 10 alerts. Missed alerts are fetched from `http://capcp1|capcp2.naad-adna.pelmorex.com/[date]/[sent]I[identifier].xml`.
- `layer:SOREM:1.0:Broadcast_Immediately` = Yes marks alerts meant for immediate broadcast. The guide asks LMDs to triage every message, because cancels and some updates are not flagged.
- Areas carry polygons (strongly recommended) and Statistics Canada SGC geocodes.
- Alerts carry a NAAD XML signature; the guide asks LMDs to verify signatures for alerts shown to the public.
- Using the feed means accepting Pelmorex's Terms and Conditions. Registration on the User Resource Centre is free and brings certificate updates.

## Decision

1. **A separate listener process** (`scripts/naad-listener.cjs`) holds both TCP streams, splits messages, drops duplicates between the two sites, reconnects after 150 seconds without data, and fetches alerts a heartbeat names but the app has not stored. It posts each message to `POST /api/alert-ready/ingest` with a bearer token. The web app stays stateless; the listener has no dependencies beyond Node.
2. **The app stores every message** (`official_alerts`), with the raw XML when it is 512 KB or smaller, for the record. Only `status` Actual with `msgType` Alert, Update or Cancel acts on screens. Test, Exercise, Draft and System messages are stored and ignored.
3. **Area matching.** When an area has a polygon, only the polygon decides (screen latitude and longitude, or the stored map position). Without one, SGC codes decide: `35` is all of Ontario, a 4-digit code is a census division, and a 7-digit census subdivision is widened to its census division and marked *approximate*, because the platform holds census-division boundaries only. Matches are stored per screen (`official_alert_matches`).
4. **Each institution chooses** (`alert_ready_settings`):
   - **Off** — nothing is shown or listed.
   - **Ask me first** (default) — the alert is listed with its matched screens; a person chooses *Show on screens*.
   - **Show automatically** — a Broadcast Immediately alert goes on the matched screens at once, **only when its signature verifies** against a certificate in `ALERT_READY_SIGNING_CERTS`. Anything else waits, as in Ask me first, and the page says why.
5. **Signature check.** A signature counts only when it is a direct child of `<alert>`, covers the whole document (enveloped reference `URI=""`) and validates with a configured certificate. Without a configured certificate nothing is automatic.
6. **On screens** a relayed alert is an ordinary `device_alerts` row with `source = 'alert-ready'` and `official_alert_key`, one per display language, so a French screen shows the French text. Instructions come before the description. Expiry is the CAP `expires`, capped at 24 hours like other overrides. A relayed alert skips the overlap check: it takes the screen over an institution's own override, which returns when the official alert ends. The player footer names the source ("Alert Ready (NAAD System)" / "En Alerte (système ADNA)").
7. **Update and Cancel** end the screen messages of every alert in `references`. When an institution's screens were showing the replaced alert, the Update goes on that institution's matched screens straight away in either Ask me first or Show automatically, so a person never re-approves an update to an alert already on screen. Off still shows nothing.
8. **Wording.** EasyAD relays and never issues. The page says so, and an institution's own override still says it is not an official alert.

## Configuration

| Variable | Purpose |
|---|---|
| `FEATURE_ALERT_READY=true` | Turns on the relay, the ingest route and the Emergency updates panel. |
| `ALERT_READY_INGEST_TOKEN` | At least 32 random characters, shared by the app and the listener. |
| `ALERT_READY_SIGNING_CERTS` | Pelmorex signing certificate(s), PEM or Base64 PEM. Required for Show automatically. |
| `ALERT_READY_INGEST_URL` | Listener only. Defaults to `APP_ORIGIN` + `/api/alert-ready/ingest`. |
| `NAAD_STREAMS`, `NAAD_ARCHIVES` | Listener only. Override the Pelmorex hosts, for example to point at a test server. |

Run the listener as one long-running task beside the web service, for example a second ECS service with the same image and the command `node scripts/naad-listener.cjs`. Run exactly one, or two in different zones: the ingest route drops duplicates.

## Release gates

- Accept the Pelmorex Terms and Conditions and register on the NAAD User Resource Centre. Confirm with Pelmorex (Support-PublicAlerting@Pelmorex.com) that relaying to digital signage is within the terms.
- Allow outbound TCP 8080 to the two streaming hosts and HTTP to the two capcp hosts. The development and Cowork environments could not reach them, so no live message has been processed yet.
- Obtain the current NAAD signing certificate, set `ALERT_READY_SIGNING_CERTS`, and confirm a live alert verifies before anyone chooses Show automatically. The signature code is tested only against signatures made with xml-crypto.
- Watch one semi-annual public awareness test (May and November) end to end on a paired screen.

## Rejected alternatives

- **Polling the GeoRSS feed.** The guide calls it auxiliary and unsuitable for a 24/7 automated system, and it has no geocodes.
- **A TCP socket inside the web app.** Next.js on Fargate scales and restarts tasks; a feed connection belongs to one long-lived process.
- **Automatic display without a signature.** The TCP feed is plain TCP; a spoofed message would take over public screens.
