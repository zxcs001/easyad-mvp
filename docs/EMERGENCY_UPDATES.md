# Emergency screen updates

Government workspace: `/government?view=emergency`.

Institution accounts publish AMBER, severe weather, evacuation, or public safety messages to their own published digital screens. Super Admin chooses one institution. The backend resolves all screens or a text search over name, address, building, and department. This is a text search, not a geographic radius or automatic weather-feed integration. Static billboards are excluded. Each update supports up to 100 targets and a duration of up to 24 hours.

Users review the matching screens, message preview, and authorization acknowledgment before publishing. Publishing resolves the targets again and rejects a changed target list. The database transaction locks and rechecks target ownership, publication, and digital delivery, and rejects overlapping active alerts. End update stops the message on all its targets.

The Emergency updates page provides eight editable message templates: missing person, officially issued AMBER Alert, severe weather, evacuation, shelter in place, emergency closure, water advisory, and all clear. Selecting one fills the headline, instructions outline, and alert type; users supply verified details in the `{{...}}` prompts. The form lists outstanding prompts and blocks publishing until they are replaced. The backend also rejects unfinished prompts. Start blank supports custom messages. Template changes retain area, duration, and screen scope, clear authorization, and remove the previous photo; edited messages and photos require an in-app replacement confirmation. Missing-person notices use public safety by default, while the AMBER template is explicitly for officially issued alerts.

An optional photo can accompany any emergency type, including AMBER alerts. Both the Emergency updates page and Command centre override dialog accept PNG, JPEG, or WebP files up to 5 MB. The form previews the photo and supports removal; changing it clears authorization. The server checks the file signature and decodes it, then normalizes orientation, strips embedded metadata, and resizes within 1600×1600 without cropping. The player shows the entire photo beside the instructions. Text-only alerts remain supported.

Run the database migration for the new optional image metadata and storage path columns. Images use the configured local/S3 media storage. Owning institutions and Super Admin can view the historical image; anonymous access requires an unexpired active alert on a published public target. Private targets require an authenticated paired player. Ending/expiry removes public access to the image.

## Device delivery

Enable `FEATURE_PLAYER_CONTROL=true`, run `npm run db:migrate`, and pair each display through Screen control and `/player`. Deploy the updated player along with the backend. Existing paired browsers need to load the updated player code to benefit from priority delivery.

The authenticated player fetches manifests at most every 10 seconds while connected. This is polling rather than a push notification transport. Polling runs independently of regular media download and cache restoration. A new alert aborts pending preparation and displays self-contained text immediately, without waiting for ordinary media or local storage. Emergency manifests omit regular slides; ending the alert loads the current regular-content manifest again.

The dashboard refreshes delivery status every eight seconds. Receipt, application, browser rendering, and restoration reports are separate. Rendering reports require a visible player tab. The two-minute delivery goal is flagged when no rendering report arrives; missing evidence is never success. Unpaired screens and stale/offline players are identified explicitly. A software rendering report does not prove that a physical panel is illuminated.

Photo alerts show the instructions immediately, then prepare and cache only the alert photo, independently of regular campaign media. The rendering report waits for the photo to load successfully. A failed photo retains the emergency instructions, displays a specific photo failure message, and retries preparation. Cached photos share the manifest's offline lease and alert expiry. Existing players must reload the updated player code to display photos and gate their rendering reports on photo loading.

Offline screens cannot receive new messages until reconnecting. They receive the currently active message if it has not expired. Cached emergency text obeys the offline manifest lease and alert expiry; offline expiry may leave the screen without normal media until a fresh manifest is available. Delivery time depends on connectivity and the player running. Network failures retry with bounded backoff.

This feature distributes manually entered institution messages to owned screens. It does not issue an official public alert or ingest an external AMBER/weather feed.

## Local browser verification — September 30, 2026

Used the current local website at `http://localhost:3001`, a fictional government demo account, and one paired browser player. All messages were explicitly labelled TEST ONLY, and both alerts were ended. No live service was deployed or real device addressed. No unit tests or automated browser scripts were run for this feature.

| Scenario | Observed result |
|---|---|
| Government access with an advertiser session | Access boundary appeared; government sign-in required an institution account. |
| Find all owned digital screens | Eight matching digital screens; static billboard and another institution's inventory excluded. |
| Search City Hall | One matching published digital screen. |
| Publish weather drill | Regular public-information content replaced by fullscreen weather text; observed within 6.48 seconds of clicking Publish. |
| Device evidence | Weather receipt at 11:25:50 p.m. and rendering report at 11:25:55 p.m.; update published at 11:25:45 p.m. |
| End weather drill | Regular public-information content returned; dashboard showed Regular content restored. |
| Publish AMBER drill to eight targets | Paired City Hall player displayed the message; seven targets were correctly marked Not paired. |
| Overlapping update | Specific error: End the active override on the selected screens before publishing another. |
| Reload paired player during alert | AMBER message returned after the initial connection screen. |
| End AMBER drill | Regular content returned; restoration report confirmed on the dashboard. |

TypeScript compilation and whitespace checks passed. Physical-device latency, background-tab throttling, offline reconnection, long pending downloads, and fleet-scale load were not exercised in this browser walkthrough. Canadian French copy still requires native review before production signoff.

Screenshots: `/tmp/easyad-browser-qa/emergency-weather-player.jpg`, `/tmp/easyad-browser-qa/emergency-delivery-status.jpg`, and `/tmp/easyad-browser-qa/emergency-amber-player.jpg`.
