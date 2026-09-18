# EasyAD product decision register

Last reviewed: 2026-09-17  
Owner: Product (named owner to be assigned)  
Rule: engineering must not infer an answer. Unresolved choices block only affected branches.

| ID | Decision | Status | Needed before |
|---|---|---|---|
| PD-001 | Is a placement request an inquiry, temporary hold, or binding reservation? | Provisional: inquiry; binding after operator confirmation and offline acceptance | ADR 0003 |
| PD-002 | Who creates holds, how long do they last, and what releases them? | Provisional: no holds in first release | ADR 0003 |
| PD-003 | Is static inventory exclusive for the posting period, and how are posting cycles represented? | Provisional: confirmed dates are exclusive; removal/replacement work orders close cycles | ADR 0003 |
| PD-004 | Which party has final content authority for each content category? | Provisional: separate client and operator decisions; media owner has final placement authority | ADR 0003 |
| PD-005 | May an agency approve for a client, and how is authority recorded? | Provisional: explicit revocable authorization plus immutable actor audit | ADR 0003 |
| PD-006 | Which cost lines are estimates versus operator-confirmed terms? | Provisional: all plan costs estimated until operator-confirmed quote | ADR 0003 |
| PD-007 | Who procures print and installation? | Provisional: media owner by default, assignable vendor | ADR 0003 |
| PD-008 | Which proof photos may be shared with clients or publicly? | Provisional: private by default, explicit client share, never public initially | ADR 0003 |
| PD-009 | What are retention periods for masters, comments, proof photos, and private installation notes? | Provisional: seven years for masters/approvals/proofs/audit; two years for comments/private notes | ADR 0003 |
| PD-010 | Which content categories require external preclearance or specialist review? | Provisional: operator manual checklist; no legal-clearance claim | ADR 0003 |
| PD-011 | What is the source and permitted use of audience/circulation data? | Provisional: operator-reported with source/freshness; audited requires evidence | ADR 0003 |
| PD-012 | Who is merchant of record and who receives payouts? | Deferred with payments | Phase 7 only |
| PD-013 | Which geocoding provider serves address autocomplete, and who pays for it? | Deferred 2026-09-17: Google Places needs a billed key; an OpenStreetMap geocoder is free but weaker on Canadian civic numbers | Address autocomplete only |

Accepted decisions must be recorded in a superseding ADR or maintained product brief with owner, date, rationale, affected capabilities, migration impact, and rollback/exception policy.
