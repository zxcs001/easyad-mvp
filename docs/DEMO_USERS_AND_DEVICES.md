# Demo Users and Devices

## Phase 1 static inventory

| Stable ID | Inventory unit | Delivery mode | Specification |
|---|---|---|---|
| `INV-DEMO-STATIC-001` | Memorial Avenue Bulletin Face | Static | `SPEC-INV-DEMO-STATIC-001`, face-specific 3048 × 1524 mm trim |

The static face keeps its own production requirements. It must not be consolidated into a universal static-art specification. The Balmoral Campus Poster Face (`INV-DEMO-STATIC-002`) no longer ships: the research found no such face, and the seed removes the record if an older seed created it.

This is the canonical reference for the local demo identities and device ownership graph. The data is intentionally fictional and may be recreated with:

```bash
npm run seed:demo-data
```

Login emails and passwords are stored only in the ignored local file `DEMO_ACCOUNTS.md`. That file must never be committed or uploaded. The seed refuses non-local and production databases unless `ALLOW_REMOTE_DEMO_DATA=1` is explicitly set. Rerunning it is idempotent: it restores the accounts, passwords, active status, memberships, and device fields. It replaces its own demo campaigns, which all carry a `BK-TB-` identifier, and removes `INV-DEMO-` devices that the current seed no longer ships. It does not touch media or any other application data, and it never touches a booking you made by hand.

## Role model

- Governmental and other institutional owners both use the persisted `institutional` role. The governmental distinction is expressed by the organization identity and device tags because the current database has no separate `governmental` role.
- An `institutional` account owns every device whose `institution_id` equals that account's user ID. The owner can manage and directly publish across its complete fleet.
- An `operator` belongs to one owner through `users.institution_id`. It can manage that owner's devices, but its new devices and media follow operator approval rules.
- A common ad buyer uses the `advertiser` role. Advertisers can discover inventory, book placements, pay, and submit creative; they do not own devices.
- `inventory.created_by` records the person who initially manages the seeded record. Authorization is based on the owning `inventory.institution_id`, so the owner and all of its delegated operators can manage the device.

## Governmental users

| Stable user ID | Name | Role | Membership / capacity |
|---|---|---|---|
| `USR-DEMO-GOV-TB` | City of Thunder Bay Screen Operations | `institutional` | Government owner; 4 operator seats |
| `USR-DEMO-GOV-OP-01` | Maya Chen — Civic Screen Operator | `operator` | Member of `USR-DEMO-GOV-TB` |
| `USR-DEMO-GOV-OP-02` | Noah Martin — Civic Communications | `operator` | Member of `USR-DEMO-GOV-TB` |

The governmental owner signs in at `/government/login`. Delegated operators use `/login`.

## Institutional users

| Stable user ID | Name | Role | Membership / capacity |
|---|---|---|---|
| `USR-DEMO-INST-LU` | Lakehead University Campus Media | `institutional` | Institution owner; 3 operator seats |
| `USR-DEMO-INST-OP-01` | Priya Singh — Campus Media Operator | `operator` | Member of `USR-DEMO-INST-LU` |

The institutional owner signs in at `/government/login` because that route is the product's shared institutional-owner workspace. The delegated operator uses `/login`.

## Common users (ad buyers)

| Stable user ID | Name | Role |
|---|---|---|
| `USR-DEMO-ADV-01` | Northline Fitness Marketing | `advertiser` |
| `USR-DEMO-ADV-02` | Atlas Grocery Campaign Team | `advertiser` |
| `USR-DEMO-ADV-03` | North Shore Media Buying | `advertiser` |

North Shore Media Buying is also an `agency` organization fixture with client `CLI-DEMO-NORTH-SHORE-01` (Harbour Dental Group) and brand `BRD-DEMO-HARBOUR-01` (Harbour Smiles). This provides a stable agency/client planning path when `FEATURE_AGENCY_WORKSPACE=true`.

Ad buyers sign in at `/login`.

## Government-owned devices

All nine devices have `institution_id = USR-DEMO-GOV-TB` and are manageable by the governmental owner and both of its delegated operators. Every address, latitude and longitude is real, and every audience figure has its basis in `docs/DEMO_DATA_RESEARCH.md`.

| Stable device ID | Device | Format | Daily impressions | Spots in loop | Rate, one spot a day | Whole face a day | Initial manager | State |
|---|---|---|---|---|---|---|---|---|
| `INV-DEMO-GOV-001` | Thunder Bay City Hall Civic Screen | digital | 1,800 | 9 | $3 | $14 | `USR-DEMO-GOV-OP-01` | approved, published inventory |
| `INV-DEMO-GOV-002` | Waterfront Transit Terminal Screen | transit | 1,900 | 9 | $3 | $21 | `USR-DEMO-GOV-OP-01` | approved, published inventory |
| `INV-DEMO-GOV-003` | Prince Arthur's Landing Waterfront Screen | digital | 1,050 | 9 | $3 | $18 | `USR-DEMO-GOV-OP-02` | approved, published inventory |
| `INV-DEMO-GOV-004` | Canada Games Complex Entrance Screen | digital | 1,050 | 9 | $3 | $14 | `USR-DEMO-GOV-OP-01` | approved, published inventory |
| `INV-DEMO-GOV-005` | Community Auditorium Lobby Screen | digital | 390 | 9 | $3 | $12 | `USR-DEMO-GOV-OP-02` | approved, published inventory |
| `INV-DEMO-GOV-006` | Fort William Gardens Concourse Screen | digital | 310 | 9 | $3 | $12 | `USR-DEMO-GOV-OP-02` | approved, published inventory |
| `INV-DEMO-GOV-007` | Waverley Resource Library Entrance Screen | digital | 260 | 9 | $3 | $12 | `USR-DEMO-GOV-OP-01` | approved, published inventory |
| `INV-DEMO-GOV-008` | Memorial Avenue at Harbour Expressway Digital | digital | 10,000 | 6 | $15 | $90 | `USR-DEMO-GOV-OP-01` | approved, published inventory |
| `INV-DEMO-STATIC-001` | Memorial Avenue Bulletin Face | static | 8,470 | 1 | $50 | $50 | `USR-DEMO-GOV-OP-01` | approved, published inventory |

`INV-DEMO-STATIC-001` is the only face with no loop. An advertiser who books it earns all of its impressions; on every other screen an advertiser earns its share of the loop. The application bills `price x days x slots`, so the stored price is always the rate for one spot. The whole-face column is the researched rate the spots add up to, and $3 is the floor for the smallest faces.

## Institution-owned devices

All four devices have `institution_id = USR-DEMO-INST-LU` and are manageable by the university owner and its delegated operator.

| Stable device ID | Device | Format | Daily impressions | Spots in loop | Rate, one spot a day | Whole face a day | Initial manager | State |
|---|---|---|---|---|---|---|---|---|
| `INV-DEMO-INST-001` | Lakehead University Agora Screen | digital | 3,300 | 9 | $3 | $24 | `USR-DEMO-INST-OP-01` | approved, published inventory |
| `INV-DEMO-INST-002` | Lakehead Athletics Centre Entrance Screen | digital | 980 | 9 | $3 | $14 | `USR-DEMO-INST-OP-01` | approved, published inventory |
| `INV-DEMO-INST-003` | Bora Laskin Faculty of Law Screen | digital | 620 | 9 | $3 | $12 | `USR-DEMO-INST-OP-01` | approved, published inventory |
| `INV-DEMO-INST-004` | Lakehead University Transit Shelter Screen | transit | 4,100 | 6 | $4 | $21 | `USR-DEMO-INST-OP-01` | approved, published inventory |

## Demo campaigns

`npm run seed:demo-data` also writes 420 bookings across 172 campaigns, from 2025-09-01 to 2027-01-10, with their creatives, invoices, proof-of-play rows and approval events. Every advertiser is fictional. The rules that shape the mix are in `docs/DEMO_DATA_RESEARCH.md` section 7.

## AI generation contract

When generating fixtures, tests, screenshots, campaigns, media, alerts, or narratives from this dataset:

1. Treat the stable IDs in this file as immutable identifiers. Read local login details from the ignored `DEMO_ACCOUNTS.md` only when credentials are required.
2. Use `USR-DEMO-GOV-TB` for government-owned records and `USR-DEMO-INST-LU` for university-owned records.
3. Keep delegated operators inside their documented institution; do not attach advertisers to an institution.
4. Use `inventory.institution_id` as the ownership boundary and `inventory.created_by` only as provenance.
5. Use the application coordinate fields `x` and `y` as map percentages, not longitude and latitude.
6. Keep all names and credentials fictional and local-development-only.
