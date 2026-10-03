# Emergency photo browser verification — October 1, 2026

Added optional image upload to Emergency updates and the Command centre emergency override dialog. PNG, JPEG, and WebP are accepted up to 5 MB. Images accompany the instructions with their full frame visible. The server decodes and normalizes the image, stores it with the alert, and includes its URL in player manifests. It strips metadata and bounds delivery dimensions to 1600×1600. The player caches the photo, shows the text immediately, and waits for a successfully loaded photo before reporting the alert on screen.

Manually tested the local website at `http://localhost:3001` as the fictional Lakehead institutional owner, with a temporary browser player at `http://127.0.0.1:3001/player`. Used a 480×640 silhouette labelled “FICTIONAL TEST IMAGE / No real person.” No real child's photograph, live alert, physical device, unit test, scripted browser test, or direct API test was used.

| Browser scenario | Observed result |
|---|---|
| Invalid image | Text disguised as JPEG produced “Upload a valid PNG, JPEG, or WebP photo up to 5 MB.” Publication remained disabled. |
| Replace invalid image | Valid PNG cleared the error and appeared in both the photo control and full-screen alert preview. |
| Remove/reselect | Remove photo cleared the image; selecting the file again restored its preview. |
| AMBER photo publication | Uploaded and published a harmless drill to Agora. After loading updated player code, the complete portrait appeared beside the instructions. |
| Stored image survives reload | Reloaded the Emergency updates page. The record image loaded successfully from its stored alert image URL at 480×640. |
| Text-only compatibility | Published a weather drill with no photo. It rendered without a photo column; receipt and on-screen reports appeared. Ended the drill. |
| Fresh photo delivery with updated player running | Published “TEST ONLY — photo delivery verification.” Creation was approximately 5:41:41 a.m. EDT (60-minute expiry at 6:41:41). Receipt was 5:41:42 and on-screen report 5:41:43: approximately two seconds. No player reload was needed for this update. |
| Prepared image | Browser DOM showed the full 480×640 image loaded from a blob URL, verifying that the player was using the prepared local asset. |
| Ending | Ended both photo drills and the text-only drill. Regular content returned after the photo drills. |

The player had initially retained the older development bundle and showed only text. Reloading it loaded the new photo support. Deploy the updated backend, schema, and player together; existing players must load the updated code.

Source checks cover signature validation, decoding, file size, normalization, owner/public/paired-player image access, cleanup of failed or conflicting uploads, and photo failure fallback. Physical signage, production latency, offline restoration, and photo download failures were not exercised in this browser walkthrough. French strings were added but not reviewed by a native speaker.

All drills were ended and the temporary Agora player was disconnected. Historical test alerts and fictional images remain as local QA data. Nothing was deployed.

Evidence: `/tmp/easyad-browser-qa/emergency-photo-player.jpg`. Final source checks: `npx tsc --noEmit` and `git diff --check` passed.
