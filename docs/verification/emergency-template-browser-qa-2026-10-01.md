# Emergency template local browser verification — October 1, 2026

Manually used the current local website at `http://localhost:3001/government?view=emergency` as the fictional Lakehead institutional owner. No unit tests, scripted browser test runner, or direct API requests were used. Source inspection and TypeScript compilation supplemented browser interaction.

| Scenario | Observed result |
|---|---|
| Template gallery | Eight named templates, descriptions, and icons appeared; the selected template was visibly marked. |
| Missing person | Filled a name/age/last-seen/description/contact outline, showed the outstanding prompts, and used Public safety rather than automatically issuing AMBER. |
| AMBER | Selected AMBER type and filled agency/child/location/description/reporting prompts. |
| Weather and evacuation | Selected their respective alert types and filled time/action/source or hazard/route/destination/assistance outlines. |
| Shelter, closure, water, all clear | Each produced its own headline and relevant instructions outline. |
| Outstanding prompts | With an area, reviewed Agora target, and checked authorization, Publish remained disabled while template prompts remained. |
| Edited draft protection | Choosing another template opened a replacement dialog. Keep current message preserved the edited headline and instructions. |
| Completed publication | Replaced all-clear prompts with an explicitly harmless TEST ONLY message. Publication succeeded, and the public Agora device view displayed the completed message. |
| Ending | Ended the TEST ONLY alert. Reloading the public device view showed no emergency overlay. No test alert remains active. |
| Start blank | Confirmed replacement; headline and instructions cleared, authorization reset, and area/duration/reviewed scope remained. |
| French | All eight card names and descriptions rendered in French. Choosing Personne disparue generated a French outline and French prompt list. Returned to English and chose Evacuation. |

The templates are editable drafting outlines. No agency instructions or contacts were invented for a real emergency. The browser run did not test physical devices or repeat player latency/offline tests from the previous photo walkthrough. Backend prompt rejection was source-inspected and compiled; it was not bypassed through a direct API test.

The ended all-clear drill remains in local history. Nothing was deployed. Screenshot: `/tmp/easyad-browser-qa/emergency-templates.jpg`. Source checks: `npx tsc --noEmit` and `git diff --check`.
