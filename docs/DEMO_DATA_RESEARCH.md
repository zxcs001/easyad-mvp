# Demo data research: Thunder Bay

Why the demo data looks the way it does, and where every number comes from.

Read this before you change a figure in `scripts/seed-demo-data.cjs`. Each
number below is either **published**, with a source, or an **estimate**, with
the arithmetic that produced it. Nothing is invented.

Researched 2026-09-18. Money is Canadian dollars.

---

## 1. Why the data changed

The old demo had eight screens, no bookings, no invoices and no delivery. So
Find screens, Performance and Invoices all showed empty states, and the demo
never showed the product doing its work.

Three faults in the old numbers would fail in front of a media buyer.

| Old value | Problem | New value |
|---|---|---|
| City Hall: 57,000 daily traffic, 88,000 impressions | A municipal lobby cannot see 57,000 people a day. The figure is a month or a whole-city number on a single face. | 2,600 traffic, 1,800 impressions, daily |
| Memorial Avenue face: 126,000 impressions | This counts the whole road against one advertiser. A digital slot earns only its share of the loop. | 10,000 impressions for the screen; a 10-second slot in a 60-second loop earns about 1,670 |
| $540 a day for one static face | About ten times the market. A small-market static face runs near $1,400 for four weeks. | $50 a day |

---

## 2. The market

| Item | Value | Year | Source |
|---|---|---|---|
| City population | 108,843 | 2021 | Statistics Canada census |
| Census metropolitan area | 123,258; 133,063 estimated at 1 July 2024 | 2021, 2024 | Statistics Canada; TBNewsWatch |
| Median age | 44.0 | 2021 | NOSM University community profile |
| Median household income | $66,163 | 2021 census (2020 income) | NOSM University community profile |
| Lakehead University, Thunder Bay campus | 6,800 students | 2024-25 | Lakehead University |
| Confederation College | 3,456 full time | 2025-26 | TBNewsWatch |
| Transit | 20 routes, about 9,000 riders a day; 46% of riders are students on a UPass | 2024-26 | City report 352-2024; GTFS feed |
| Commuting | 88% by private vehicle (82% driver, 6% passenger) | 2016 census, in the city's 2019 plan | City Transportation Master Plan |

---

## 3. How the screen numbers are built

### Roadside faces

```
daily impressions = AADT × 0.50 × 1.4 × visibility index
```

- **0.50** because a published average annual daily traffic count is two-way,
  and a single-facing screen is seen by one direction only.
- **1.4 people per vehicle — estimate.** Thunder Bay commuting gives 1.073
  people per commuting vehicle (88 ÷ 82). The Canadian Vehicle Survey gives
  1.62 across all trip purposes. A weekday arterial is roughly 30% commuting
  and 70% other: (0.30 × 1.073) + (0.70 × 1.62) = 1.456, rounded down to 1.4.
- **Visibility index — estimate.** 0.55 for a large roadside digital face and
  0.20 for a shelter face seen from a moving car. COMMB, the Canadian joint
  industry committee, publishes the method but not its coefficients, so these
  are stated openly as estimates.

### Venue and indoor faces

```
daily impressions = daily footfall × pass-by share × visibility index
```

- **Pass-by share** is how many visitors cross the screen's sightline: 1.00 at
  a single-door theatre lobby, 0.70 in an open park.
- **Visibility index** is 0.95 where people wait (a bus terminal, a lobby),
  0.85 to 0.90 in a corridor, and 0.80 outdoors.

### What a booking earns

A screen's daily impressions belong to the screen, not to one advertiser. A
digital advertiser earns its share of the loop:

```
booking impressions per day = screen impressions × (slots booked × spot length ÷ loop length)
```

With a 10-second spot in a 60-second loop, one slot is one sixth of the screen.
A static face has no loop, so the advertiser earns the whole face.

---

## 4. The thirteen screens

Every address is real. Coordinates come from the City of Thunder Bay municipal
address layer, or from the transit GTFS feed for stops. Traffic and impressions
are annual-average weekdays.

| # | Screen | Owner | Daily traffic | Daily impressions | Basis |
|---|---|---|---|---|---|
| S1 | City Hall Civic Screen | City | 2,600 | 1,800 | Estimate from terminal bus arrivals and counter visitors |
| S2 | Waterfront Transit Terminal | City | 2,250 | 1,900 | 635 weekday bus arrivals, the network's busiest stop |
| S3 | Prince Arthur's Landing | City | 1,890 | 1,050 | Estimate: 690,000 visits a year, about 4,800 on an August day |
| S4 | Canada Games Complex | City | 1,233 | 1,050 | Published: 450,000 visitors a year ÷ 365 |
| S5 | Community Auditorium lobby | City | 411 | 390 | Published: 150,000 patrons a year ÷ 365 |
| S6 | Fort William Gardens concourse | City | 413 in season | 310 | Estimate: 99,000 season visits over a 240-day season |
| S7 | Waverley Resource Library | City | 299 | 260 | Published: 269,000 library visits in 2024, 40% share estimated |
| S8 | Memorial Ave at Harbour Expressway | City | 26,000 | 10,000 | Estimate anchored on the published 24,400 AADT for Highway 61 |
| S9 | Lakehead Agora | Lakehead | 4,920 | 3,300 | Estimate: 8,200 campus population × 0.60 weekday attendance |
| S10 | Lakehead Athletics Centre | Lakehead | 1,148 | 980 | Estimate: 14% of campus population uses athletics on a weekday |
| S11 | Bora Laskin Faculty of Law | Lakehead | 760 | 620 | Estimate: law faculty plus other building users |
| S12 | Lakehead transit shelter | Lakehead | 14,000 vehicles + 2,300 riders | 4,100 | Two streams added: waiting riders and passing vehicles |

The seed ships thirteen screens: these twelve, plus the illuminated static
bulletin that the demo already had and that this research kept. The bulletin is
the only face with no loop, so it is the one screen an advertiser buys whole.

**The city does not publish traffic counts.** Its open data portal holds 85
datasets and none of them is a traffic or pedestrian count, and the 2019
Transportation Master Plan carries no volume tables. Only provincial highways
have published counts. So every municipal street figure is an estimate anchored
to the Ministry of Transportation's 2019 highway counts, and each screen records
that in `measurement_source`.

### Map placement

The map stores `x` and `y` as percentages, not coordinates. The convention was
recovered from the four old records that carry real addresses:

```
x = 0.6281 × longitude + 123.3508
y = -1.3916 × latitude  + 108.2789
```

Three of the four match to within 0.006. `y` runs downward, so latitude rises as
`y` falls. The map is about 32% narrower than true geography; the new screens
use the same transform, so they sit consistently beside the old ones. The
`latitude` and `longitude` columns, which existed and were never filled, now
carry the real coordinates.

---

## 5. Prices

Thunder Bay pays about 40% of a Toronto rate. Rates do not fall with population
as fast as audience does, because an operator holds a floor price per face.

| Format | Booking unit | Daily rate | Four weeks | Impressions a day | CPM |
|---|---|---|---|---|---|
| Digital roadside | 2 of 6 slots (33% share of voice) | $30 | $840 | 1,930 | $15.55 |
| Digital roadside | whole loop | $90 | $2,520 | 5,800 | $15.52 |
| Static bulletin, illuminated | whole face | $50 | $1,400 | 5,800 | $8.62 |
| Static poster | whole face | $20 | $550 | 3,300 | $5.95 |
| Transit shelter | whole face | $21 | $600 | 2,800 | $7.65 |
| Indoor place-based digital | 1 of 9 slots, 90-second loop | $14 | $390 | 770 | $18.09 |

Sources for the bands: published Canadian rate guides for Toronto and for rural
and small-market faces, and Canadian place-based and campus screen rates. No
Canadian rate card is public, so each rate here is an estimate derived from an
audience figure and a CPM inside a published band.

### A face rate and a slot rate are not the same

The rates above are **face rates**: one day of the complete loop, or of the
poster. The application bills `price x days x slots`, so the price each screen
stores is the rate for **one 10-second spot**, which is the face rate divided by
the spots in the loop: six on a 60-second roadside loop, nine on a 90-second
indoor loop, and one on the static face.

The demo first shipped the face rate as the slot rate. A buyer then paid for the
whole loop and received one spot of nine, and the product's own Results panel
reported a $66 CPM against a band near $15. It now reports $10 to $14. A floor
of $3 a day for one spot holds on the smallest faces, because no operator sells
a spot below the cost of handling it; that floor is why a 260-impression library
screen prices above the band and why such faces sell packages, not single spots.

Other traded values used by the seed:

| Value | Setting | Why |
|---|---|---|
| Platform fee | 15% | The long-standing out-of-home agency commission. The app already used 15%. |
| Spot length | 10 seconds | Divides cleanly into both a 60-second and a 90-second loop |
| Loop | 60 seconds roadside, 90 seconds indoor | Canadian street-level screens rotate 6 to 8 messages a minute |
| Cycle | 4 weeks, starting Monday | The industry's minimum booking and post-date convention |
| Occupancy | Measured, 12% to 54% per screen | 65% is the only published worked figure, but a declared number that the calendar contradicts is worse than a true one. The seed counts the slot-days it sold over the past year and writes that figure on each screen. |
| Proof of play | 98.0% to 99.5%, alarm below 95% | Screen uptime of 99.0–99.5% less 0.3–1.0% failed plays |
| Static lead time | 15 days from booking to live | 5–10 business days to print, plus a 5 business day posting window |
| Digital lead time | 2 business days | No print, no installation |

---

## 6. The advertisers are fictional

**Every advertiser in the demo is invented.** No real business may appear to
have bought advertising it did not buy.

Rules the roster follows:

1. Build a name from a real local place word plus a trade word: Slate River,
   Neebing, Bare Point, Current River, Hazelwood.
2. Never use the words that belong to real institutions and firms: Lakehead,
   Superior, Sleeping Giant, Nor'Wester, Kakabeka, Port Arthur, Fort William.
3. Search each candidate against Thunder Bay business directories before use.
4. Label the roster in the product. The seed writes "Demo advertiser" into the
   account records, because a name check lowers the risk of a collision, it
   does not remove it.
5. Check the list again before each public demo. A real business can take a
   name later.

Three candidates were dropped because the search found a real business: a
heating company name that matched a real ski area, an injury-law partnership
that matched a real firm, and a furniture name tied to a real store location.

The screens themselves sit at real civic and campus places. That is honest: the
city and the university own those buildings, and the demo says they own the
screens.

---

## 7. What a year of bookings looks like

420 bookings over 16 months, with today in the middle, so the charts have a full
past year, a live present and two quarters ahead.

| State | Share | Why |
|---|---|---|
| completed | 45% | Most records in a working marketplace are finished flights |
| scheduled | 15% | Approved and dated ahead; fills the forward calendar |
| pending approval | 12% | A visible queue for the operator |
| creative review | 9% | Enough that the review screen is not empty |
| approved | 8% | Approved, not yet placed |
| live | 6% | Few flights overlap any one day. A large live count reads as generated. |
| rejected | 5% | Rejections must exist, but stay rare, or the platform looks broken |

Other shape rules, so the data does not read as generated:

- **Spend has a long tail.** 47% of bookings are $100 to $500, the smallest is
  $21 and the largest is $2,100. Only 3% pass $1,000. These are small-market
  figures because the network is small: nine of the thirteen faces are indoor
  screens with an audience under 1,100 a day.
- **Revenue concentrates.** The top three advertisers take a third of spend.
- **Months differ.** Revenue peaks September to November, with the tire,
  enrolment and flu seasons stacked, and falls in December to February.
- **Flights vary.** 1, 2, 3, 4, 6 and 8 weeks, with two and six weeks the most
  common. Every flight starts on a Monday.
- **One campaign holds several bookings** across screens and dates: 420 bookings
  across 172 campaigns, 2.4 each. A one to one ratio reads as generated.
- **A loop is never oversold.** The generator holds the slots it sells and
  refuses a screen that is full for those dates, so no screen shows a state the
  application itself would refuse.
- **City notices take inventory at no cost.** They are 15% of bookings and none
  of the revenue, which is what makes an owned network different from a
  marketplace.

**What the seed produces.** 420 bookings from 2025-09-01 to 2027-01-10, and
$75,068 booked over those sixteen months. The ceiling is arithmetic: the
thirteen face rates add up to $314 a day, so a network sold out every day of
the year earns $114,610. At the occupancy the bookings produce, about a
quarter of each loop, $75,068 is what the rate card gives. Any larger claim
needs more faces, not a larger number.
- **Rejections carry different reasons**: resolution below the screen, text too
  small for the viewing distance, content not allowed on municipal screens, no
  French version for a French screen, an expired offer date, a venue
  exclusivity held by another advertiser, and an unsupported file type.

---

## 8. Seasonality

A flat annual rate misprices a campus screen by nearly four times between July
and September.

| Month | City centre | Campus |
|---|---|---|
| January | 0.78 | 1.45 |
| February | 0.82 | 1.30 |
| March | 0.88 | 1.40 |
| April | 0.95 | 1.05 |
| May | 1.02 | 0.45 |
| June | 1.12 | 0.40 |
| July | 1.25 | 0.40 |
| August | 1.28 | 0.45 |
| September | 1.10 | 1.50 |
| October | 1.00 | 1.45 |
| November | 0.90 | 1.40 |
| December | 0.95 | 0.90 |

Both series average about 1.00. The city centre moves 1.64 to 1 across the year,
because transit, municipal offices and retail run all year and only the
waterfront is strongly seasonal. The campus moves 3.75 to 1, because Lakehead
holds 6,800 students in term and a small spring intake in the summer.

---

## 9. Facts that changed the plan

- **Victoriaville Centre is gone.** It closed 18 July 2025 and demolition began
  11 August 2025. Streets reopen in autumn 2026 and landscaping finishes in
  spring 2027. No demo screen is placed there.
- **The Blues Festival left Marina Park.** It ran there to 2019 and returns as
  "Blues in the Ballpark" on 21–22 August 2026 at Port Arthur Stadium. Marina
  Park keeps RibFest in August, so the August peak stays but the reason changed.
- **Confederation College is the strongest site the demo ignores.** Its transit
  stop takes 308 weekday bus arrivals on five routes, 60% more than Lakehead's,
  and it is the third busiest stop in the network. It is left out only because
  it belongs to neither of the demo's two owners.

---

## 10. What the data changed in the application

Honest data found four faults that empty tables had hidden.

1. **Impressions ignored the loop.** `expectedImpressions` treated the screen's
   figure as a 14-day total and gave every advertiser the whole screen. A buyer
   of one spot in six was credited with six times what the spot earns. It now
   takes a daily figure and multiplies by loop share.
2. **The marketplace was empty.** The seed never set `content_visibility` or
   `advertising_opt_in`, so Find screens showed "No screens are available yet"
   and every campaign row lost its screen name. Both fields are now set.
3. **Proof of play averaged campaigns that had not run.** A flight starting next
   month reported 0%, which pulled "Confirmed playback" down to 50%. The metric
   now covers the flights that played, and reports 96%.
4. **CPM divided across different sets.** It put all spend over delivered
   impressions, so future bookings raised the rate above any rate card. Both
   sides now cover the same flights.

---

## 11. What is still missing

1. **Real municipal counts.** The Ministry of Transportation's Thunder Bay
   regional traffic section can supply site counts, and sells 2021–2024 data.
   Until then the municipal figures stay estimates.
2. **The published highway counts are from 2019.** Later editions are not free.
3. **COMMB does not publish its visibility coefficients.** Ours are estimates.
4. **No public occupancy benchmark survives checking.** 65% comes from the one
   published worked example.
5. **No Canadian rate card is public.** Every rate here is derived, not quoted.

If a client asks where a number comes from, this document is the answer. If we
cannot answer, the number should not ship.
