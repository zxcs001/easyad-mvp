# Institutional local browser walkthrough — October 1, 2026

Tested the current working tree through the website at `http://localhost:3001`, using the fictional Lakehead University institutional owner and its existing delegated operator. A separate browser player used `http://127.0.0.1:3001/player` against the same local server. These were browser interactions: no unit tests, scripted test runner, direct API calls, or database queries were used to verify the workflows. Source inspection and TypeScript compilation supplemented the browser checks.

## Browser results

| Scenario | Observed result |
|---|---|
| Institutional sign-in and scope | Owner saw its four existing campus screens, excluding the government fixture fleet. Sign-out and subsequent owner/operator sign-ins worked. |
| Command centre | Map, screen selection, name search, previews, and next/previous content controls worked. Searching for the law screen returned one of four existing screens. |
| Owner content publication | A text file disguised as JPEG was rejected. Valid PNG replacement published immediately and appeared as approved screen content. Selecting a replacement cleared the old error after the fix. |
| Display settings | Image duration zero produced the specific whole-number, 2–60 seconds error. Eight seconds saved successfully; the original Agora setting was restored to ten seconds afterward. |
| Screen creation and publication | Empty screen name blocked the first step with an explanation. Created a fictional digital QA screen, published/unpublished it, and verified five managed screens versus four published after cleanup. The management header now includes zero-priced screens. |
| Location picker | Normal left-click was accepted and the location settings saved after the click-handler fix. Geographic accuracy and a non-central pin movement were not independently measured. |
| Library and schedule | Library search, resource selection, detail previews, and the rolling eight-week calendar loaded. Approved media on an unpublished screen now explicitly says “Approved — screen unpublished.” |
| Campaign approval | Approved fictional booking `BK-TB-1202`, “Kolstad Boxing Week Retail 2026.” It left the pending queue, appeared in the audit trail, and showed Scheduled in the billing ledger. |
| Delegated operator upload | Existing operator uploaded “LOCAL QA — delegated campus notice” to the QA screen. It entered review. Owner approved it in Approvals; it left the queue and remained approved after navigating between pages. |
| People and access | Existing operator and seat counts loaded. Empty Create operator submission produced the name/email/password validation explanation. No account or credential was created or deleted. |
| Performance and billing | Institution-scoped reports and the ledger loaded. Payments were disabled in this local configuration; no transaction was attempted. |
| Emergency targeting | Backend screen search returned the four published campus screens and excluded the unpublished QA screen. Searching Agora narrowed the selection to one. Search no longer incorrectly labels the publish button “Publishing…”. |
| Emergency playback | Published the explicitly harmless “TEST ONLY — campus emergency drill” weather notice to Agora. UI recorded creation at 4:22:25 a.m., player receipt at 4:22:28, and rendering at 4:22:29: approximately four seconds. Visually inspected the full-screen alert in the paired browser player. |
| Emergency ending | Ended the drill through the confirmation dialog. Delivery report subsequently recorded “Regular content restored.” No test alert remains active. |
| Normal playback and unpublishing | Paired the isolated QA screen, visually saw its approved PNG, and observed received/prepared/applied revision 1/1/1, a recent playback timestamp, and no reported player error. Unpublishing changed the player to “This screen is unpublished. Waiting for approved content.” on its next refresh; revision 2/2/2 applied. |
| Pairing revocation | Disconnected both temporary institutional player pairings through the UI. Reloaded player returned to the pairing flow. |
| Narrow layout and languages | At the browser's 666 px viewport, owner Sign out was initially inaccessible. It is now visible and was used successfully. Checked the approved/unpublished label in French and English. |
| Weather widget | The initial player produced duplicate React keys and extra forecast tiles after hydration. After fixing stable forecast keys and reloading, exactly four day tiles rendered. Seeded weather now says “Sample weather” and “Sample data — not a live forecast.” |

## Fixes made during this walkthrough

- Clear stale owner-upload errors when selecting a replacement file, and lock upload fields while submission is in progress.
- Show institutional/operator inventory counts from their managed inventory rather than advertiser price filters.
- Accept the normal click advertised by the precise location picker, retaining right-click support and matching fallback behavior.
- Keep account identity and Sign out accessible in the narrow sidebar layout.
- Distinguish approved media from the publication status of its screen.
- Separate emergency publication state from target-search loading state.
- Use stable forecast tile keys and identify synthetic weather data accurately, including French labels.
- Explain normal loop waits and hidden-tab pauses in the browser player. Existing fail-closed schedule checks now also provide actionable conflict/capacity explanations; those conflict branches were source-inspected and compiled, but were not reproduced in the browser.

## Remaining scope and local data

The test validates the local browser player, not physical signage hardware or production delivery times. Offline restoration, multiple-device fan-out, automatic expiry, AMBER-specific artwork, MP4/WebM uploads, account creation, payment, exports, and destructive actions were not exercised in this walkthrough.

Left the clearly named `LOCAL QA — campus test screen` (`INV-45E218B06B`) unpublished with its approved test PNG. The owner-uploaded campus notice and approval of fictional `BK-TB-1202` remain as local QA data. Both temporary institutional players were disconnected, all test alerts ended, and the four original campus screens remain published. No live-site deployment was performed.

Screenshots saved locally during the walkthrough:

- `/tmp/easyad-browser-qa/institution-emergency-player.jpg`
- `/tmp/easyad-browser-qa/institution-emergency-ended.jpg`
- `/tmp/easyad-browser-qa/institution-account-controls.jpg`
- `/tmp/easyad-browser-qa/institution-approved-media.jpg`
- `/tmp/easyad-browser-qa/institution-normal-playback.jpg`

Final source checks: `npx tsc --noEmit` and `git diff --check`.
