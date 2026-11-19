Illustrative content: Wrenhaul, its people, customers, cities, investors and every number in this
deck are fictional. Nothing here describes a real company, person or product.

# Story bible: Wrenhaul

Every slide of the lookbook tells part of one story. Use these names, numbers and words; when you
invent a fact another slide could reuse (a person's line, a figure, a date), add it here in the
section it belongs to, in the same form, so the next author quotes the same thing.

## The organisation in one breath

**Wrenhaul** runs city deliveries on electric cargo bikes from small neighbourhood hubs, and sells
the software that plans them, so a shop can promise delivery within the hour without owning a van.

- Founded March 2022 in **Kestwick**, when the council closed the Old Town to vans.
- Live in six cities, from 14 hubs, with 310 riders who are staff, not gig workers.
- The deck is its **launch day talk, 3 December 2026**: Wrenhaul opens **Open Network** (any shop,
  platform or parcel carrier can book a Wrenhaul drop through one API) and announces its
  **€14M Series A**, led by Saltglass Capital with €8M committed.
- The audience: merchants, partners, the press and investors in one room, in Kestwick.
- The talk takes forty minutes as four questions (`agenda-plan`): Why can't a van do this? (10
  min); How does a drop reach the door? (12 min); Does it work at scale? (10 min); What will the
  €14M build? (8 min).
- The launch day's programme (`agenda-long`): 09:00 coffee at the Old Town hub (beans from
  Copperline Coffee); 09:30 the launch talk; 10:30 ride an Old Town loop (ride-alongs leave every
  20 minutes, led by Aoife Brennan); 12:30 lunch from Brightloaf Bakery; 14:00 book a drop with
  the SDK (developers); 16:00 questions from the press, with Ines and Saltglass Capital.

## The story the deck tells

1. **The change.** Old towns are closing to vans (Kestwick in 2022, Marrowgate in 2024, four more
   cities by 2028). Shops still need to deliver, and customers now expect the same hour.
2. **The problem.** A van in a dense centre makes 5.1 stops an hour and costs a merchant €6.40 a
   drop; it misses one window in eight. Gig apps are fast but cost more and drop the parcel at the
   kerb.
3. **The product, shown.** Merchants book drops; **Flock**, the batching engine, groups them into
   loops every 90 seconds; riders follow the **Rider** app; recipients watch the **Track** page;
   hub leads run the day in **Dispatch**. Open Network puts all of it behind one API.
4. **The proof.** 182,000 drops in October 2026, three times a year earlier; 97.8% on time;
   €3.10 a drop to the merchant; named customers with before and after numbers.
5. **The ask.** €14M to open four cities, make Open Network the default way to book a city drop,
   and reach 500,000 drops a month by the end of 2027.

## Product

| Name | What it is | Who uses it | Screen in `assets/screens/` |
| --- | --- | --- | --- |
| Dispatch | Web app: the live map of a hub's loops, riders and drops, with window alerts | Hub leads, merchant operations | `dispatch.svg` |
| Insights | Web app: cost per drop, on-time rate and CO2 per merchant, by week | Merchants, Wrenhaul finance | `insights.svg` |
| Open Network console | Web app for developers: API keys, test drops, webhook log | Merchants' and partners' developers | `console.svg` |
| Rider | Phone app: the loop as a list of stops, the next stop, the parcel's slot in the box, the handover | Riders | `rider-next-stop.svg`, `rider-loop.svg` |
| Track | Phone web page for the person receiving a drop: rider on the map, minutes to go, leave-with-neighbour | Recipients | `track.svg` |
| Flock | The batching engine: every 90 seconds it groups waiting drops into loops and hands each loop to a rider | Runs inside Wrenhaul | (diagrams only) |
| Open Network API | `POST /v1/drops`, webhooks such as `drop.delivered`, the TypeScript SDK `@wrenhaul/sdk` and the `wren` CLI | Developers | (code slides) |

The web apps live at `app.wrenhaul.example/dispatch` (and `/insights`, `/console`) for a browser
frame's address bar.

Delivery windows a merchant can sell: **same hour** (booked by 4 pm, at the door within 60
minutes), **two-hour** (choose a slot from 8 am to 8 pm), **evening** (6 to 9 pm).

Prices to merchants: **pay per drop** €3.40 a drop, no fee; **hub plan** €2.90 a drop with a
€190 monthly fee and 500 drops minimum; **Open Network** €3.10 a drop through the API, volume
tiers above 10,000 a month. The blended average is **€3.10 a drop**. Open Network is the cheapest
plan below 950 drops a month; above that the hub plan's fee pays for itself (the price calculator).

The API and tools as the code slides write them: `wren.drops.create({ pickup, dropoff, window })`
returns a drop with `id`, `status` and `doorEta`; a window is `{ kind: 'two_hour', from: '14:00' }`
(left out, it is the same hour); `wren.webhooks.verify(body, signature)` checks the
`wren-signature` header; the CLI has `wren quote`, `wren drops create` and `wren drops watch`.
Links: `docs.wrenhaul.example/sdk`, `status.wrenhaul.example`, and `wrenhaul.example/start`, which
opens the console with a test key.

## Cities and hubs

Six cities live, 14 hubs. A hub is a rented ground-floor unit of about 40 m² with racks, chargers
and 18 to 26 riders on its roster.

| City | Live since | Hubs | Drops a day per hub (Oct 2026) | Cost per drop | On time per hub | On time, city |
| --- | --- | --- | --- | --- | --- | --- |
| Kestwick | Mar 2022 | Old Town, Canal Yard, Northgate, Weir Street | 680, 640, 500, 580 | €1.98, €2.01, €2.32, €2.14 | 98.9, 98.7, 98.2, 98.5% | 98.6% |
| Marrowgate | Sep 2024 | Market Cross, Docks | 620, 410 | €2.06, €2.62 | 98.3, 97.3% | 97.9% |
| Port Ellis | Sep 2024 | Harbourside, Station Quarter | 560, 470 | €2.21, €2.43 | 97.4, 96.7% | 97.1% |
| Hollin | Feb 2026 | Abbey Green, Tanner Row | 530, 420 | €2.29, €2.57 | 98.5, 97.8% | 98.2% |
| Ebbsford | Feb 2026 | Bridge End, Castle Hill | 520, 370 | €2.35, €2.86 | 96.8, 95.8% | 96.4% |
| Calder Bay | Feb 2026 | Promenade, Sandgate | 380, 320 | €2.71, €3.12 | 97.2, 96.5% | 96.9% |

The per-hub drops add up to 7,000 a day, which over 26 working days is the 182,000 of
October; the cities' on-time rates, weighted by drops, come to the 97.8% of the whole network. Next cities (2027): **Saltby**, **Ardwen**, **Fallowmere**, **Tarnock**.

Per city (drops a day and cost per drop weighted by each hub's drops; `table-cities`): Kestwick
2,400 a day, €2.10; Marrowgate 1,030, €2.28; Port Ellis 1,030, €2.31; Hollin 950, €2.41; Ebbsford
890, €2.56; Calder Bay 700, €2.90. Weighted by drops, the 14 hubs come to the €2.34 network cost
per drop in the numbers below; a hub's cost is what it spends on riders, bikes, rent and software
for its own drops.
Candidate cities placed on `matrix-cities` and passed over for 2027: **Wexholm** (council willing,
centre spread out) and **Brindlemoor** (neither). Saltby leads on both density and council backing.

## Customers and partners

Logos are in `assets/logos/`. All are fictional.

| Organisation | What it is | With Wrenhaul since | Person and line |
| --- | --- | --- | --- |
| Pantry Lane Grocers | 34 grocery shops in four cities, the largest customer | Jan 2025 | Lotte Brandsma, head of operations (portrait). "We stopped turning down same-day orders at noon." |
| Brightloaf Bakery | Three bakeries in Kestwick | Apr 2022, the first merchant | Odile Ferrand, owner (portrait). "Bread that arrives warm is a different product." |
| St Brenna Hospital | Blood samples between nine clinics and the hospital lab | Jun 2025 | Dr Imogen Hale, lab services manager (no portrait). "A sample used to wait for the van; now the van is the thing that waits." |
| Calloway Pharmacy | 12 pharmacies, prescriptions the same day | Mar 2024 | |
| Fennick Florists | Flowers, the evening window's biggest user | Oct 2023 | |
| Thimble Books | Independent bookshop group, five shops | Feb 2025 | |
| Copperline Coffee | Beans and equipment for offices | Sep 2025 | |
| Okra Kitchen | Meal kits, delivered in the evening window | Nov 2024 | |
| Halyard Parcel | Parcel carrier; hands its Old Town parcels to Wrenhaul through Open Network | Sep 2026 (beta) | Kwesi Boateng, head of urban delivery. "Our vans stop at the ring road now." |
| Kestwick City Council | Closed the Old Town to vans; the first city partner | Mar 2022 | Councillor Fenna Vos, transport lead. "The Old Town got its streets back and its shops kept their customers." |
| Ostler Cycles | Builds and services Wrenhaul's cargo bikes | 2022 | |
| Marrowgate Market Hall | 60 traders who share one Wrenhaul account | Sep 2024 | |

Longer lines, as the proof slides quote them: Lotte, "We stopped turning down same-day orders at
noon. Our shops take them until four now." Odile, "Bread that arrives warm is a different product.
People order it for breakfast now, not just for the weekend." Dr Hale, "A sample used to wait for
the van; now the van is the thing that waits. Nine clinics send to one lab, and nothing sits on a
counter for an hour."

Investors: **Brackwater Ventures** (seed, €3.2M, May 2023) and **Saltglass Capital** (Series A
lead, €8M committed of €14M). Founders' previous organisations, for the team layout's
`previously:` marks: **Northline Parcel** (Ines), **Corrin Air** (Tobi), **Spoke Couriers
Co-op** (Maren).

## Competitors

Name them as kinds, not companies, on slides:

| Alternative | Cost per drop to a merchant | Window | Weakness |
| --- | --- | --- | --- |
| The merchant's own van | €6.40 | Same day, if the driver is free | Parking, 5.1 stops an hour, banned from old towns |
| Van couriers | €4.80 | Next day | Misses one window in eight (88% on time) |
| Gig delivery apps | €7.50 | Within the hour | Kerbside only, no returns, riders change every week |
| Parcel lockers | €2.20 | Next day, the recipient walks | Nothing cold, nothing heavy, nothing urgent |
| **Wrenhaul** | **€3.10** | **Within the hour** | Needs a dense area: a hub pays off above about 250 drops a day |

Heaviest parcel: the merchant's own van takes any size, van couriers up to 30 kg, a Wrenhaul bike
box 25 kg (heavier goes to a partner van). Stops an hour: own van 5.1, van courier 5.8, rider 9.4.

## People

Portraits are in `assets/people/`. Founders first.

| Name | Role | Line (an `edge`, a bio fact, a quote) | Portrait |
| --- | --- | --- | --- |
| Ines Kowalczyk | Co-founder and CEO | Ran night routing at Northline Parcel's biggest depot for eight years. Presents most of the deck. | `ines-kowalczyk.svg` |
| Tobi Adeyemi | Co-founder and CTO | Wrote crew-scheduling solvers at Corrin Air; built Flock's first version in a month. | `tobi-adeyemi.svg` |
| Maren Solberg | Co-founder and COO | Rode 11,000 drops herself and opened the first hub with a borrowed key. | `maren-solberg.svg` |
| Rafael Duarte | Head of product | Owns Dispatch, Rider and Track; spends every Friday morning on a bike. | `rafael-duarte.svg` |
| Hana Sato | Engineering lead, Flock | Cut the batching interval from five minutes to 90 seconds. | `hana-sato.svg` |
| Yusuf Demir | Head of hubs | Opened nine of the 14 hubs; knows every landlord by name. | `yusuf-demir.svg` |
| Beatriz Lund | Head of partnerships | Signed Halyard Parcel and runs the Open Network beta. | none: initials tile |
| Aoife Brennan | Rider lead, Kestwick Old Town | The first rider Wrenhaul hired (March 2022); trains every new rider: all 310 rode their first loop behind her. Leads the launch-day ride-alongs; `aoife@wrenhaul.example`. | none: initials tile |
| Lotte Brandsma | Head of operations, Pantry Lane Grocers | Customer, see above. | `lotte-brandsma.svg` |
| Odile Ferrand | Owner, Brightloaf Bakery | Customer, see above. | `odile-ferrand.svg` |
| Amara Quist | Research archetype: a recipient watching Track | Persona only; not a real customer. | `persona-recipient.svg` |
| Sofia Lindqvist | Research archetype: a hub lead in Dispatch | Persona only; not a real customer. | persona-hub-lead.svg |

Team: 64 people in the office and 310 riders, 374 in all. Contacts for closing slides:
`ines@wrenhaul.example`, `partners@wrenhaul.example`, `wrenhaul.example/network`,
`docs.wrenhaul.example`. Always the `.example` domain.

### Launch readiness snapshot

The `status-launch` review on 3 December 2026 treats Open Network as done (Tobi Adeyemi: the API
opens today), Halyard Parcel as on track (Beatriz Lund: beta traffic feeds the live network),
returns pick-up as at risk (Rafael Duarte: confirm the Q1 handover flow this month), and new city
leases as blocked (Yusuf Demir: Saltby needs board approval first). These last two decisions do
not hold up the launch. `status-next-wave` is the January 2026 review of the six funded 2026 hub
openings (see 'The 2026 openings'): leases signed, the Hollin and Ebbsford hubs fitted out, rider
training on track, Calder Bay's launch at risk without its trial run, and Sandgate's chargers
blocked for want of power.

## Numbers

Every slide quotes these. Source line for slides: "Wrenhaul operating report, October 2026"
unless the row names another.

| Figure | Value | What it means |
| --- | --- | --- |
| Drops in October 2026 | 182,000 | Deliveries completed in the month; a year earlier 61,000 (3.0×) |
| Drops since launch | 2.4 million | All drops, March 2022 to November 2026; half of them in 2026 (1.19 million January to October) |
| ARR | €6.8M | 182,000 drops × €3.10 × 12; a year earlier €2.1M (61,000 × €2.90 × 12), 3.2× |
| Average price per drop | €3.10 | Blended across plans; €2.90 in October 2025, before the hub plan's minimum and the Open Network tiers |
| Cost per drop | €2.34 | Rider time, hub, bike and software per drop; €3.40 in October 2025 |
| Gross margin | 24.5% | (€3.10 − €2.34) ÷ €3.10, October 2026: €0.76 a drop. In October 2025 a drop sold for €2.90 and cost €3.40, a loss of €0.50 (−17%) |
| On time | 97.8% | Drops at the door inside their window, October 2026 |
| Median order to door | 52 min | Same-hour window, October 2026 |
| Stops per rider-hour | 9.4 | A van in the same centres makes 5.1 (merchant survey, n = 112) |
| Van cost per drop | €6.40 | What merchants paid for their own vans (merchant survey, n = 112) |
| Loop | 9 drops, 68 min, 7.2 km | Median loop in October 2026 |
| Merchants | 420 active | Sent a drop in October 2026; 38 on enterprise contracts |
| Net revenue retention | 142% | Merchants a year ago spend 1.42× now |
| Merchant churn | 1.1% a month | Logos lost |
| CAC payback | 7 months | Sales and onboarding cost repaid by gross margin |
| Hub payback | 5 months | Median months until a new hub covers its own costs |
| CO2 avoided | 1,140 t | January to October 2026, against vans doing the same drops |
| Riders | 310 | Staff on an hourly wage of €15.40, sick pay and a bike; 4% leave a month |
| Market | €3.0B a year | 46 cities like ours × 21M drops a year each × €3.10 |
| Serviceable market | €1.0B a year | Drops under 5 kg within 4 km of a hub, a third of the market |
| Obtainable market target | €18.6M annualised | Q4 2027 goal of 500,000 monthly drops × €3.10 × 12; target run rate, not full-year revenue |
| Series A | €14M | €8M committed by Saltglass Capital; 30 months of runway |

**Use of the €14M:** new cities and hubs 45% (€6.3M), product and engineering 30% (€4.2M), riders
and bikes 15% (€2.1M), working capital 10% (€1.4M).

**What the €14M buys** (the milestones of `ask-series-a`, one per allocation): six hubs open in
four new cities by June 2027 (cities and hubs); 134 new riders on staff, each with a bike, by June
2027 (riders and bikes); parcel carriers integrated with Open Network by December 2027 (product);
break-even in Q2 2028 with a year of the 30 months' runway to spare (working capital). **The plan**
(`timeline-roadmap`, the dated outcomes): today's launch; Q1 2027 returns pick-up; Q2 2027 four new
cities, ten in all; Q4 2027 500,000 drops a month; Q2 2028 break-even for the company.

### Datasets for the charts

Drops per month, thousands:

| Month | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025 | 22 | 25 | 29 | 33 | 38 | 41 | 44 | 43 | 52 | 61 | 66 | 84 |
| 2026 | 70 | 78 | 92 | 104 | 118 | 127 | 133 | 129 | 158 | 182 | | |

The jump in September 2026 is the Open Network beta; the December 2025 peak is the holidays.

Drops by window, thousands, 2026: same hour 28, 31, 38, 45, 52, 57, 61, 58, 74, 88 (Jan to Oct);
two-hour 30, 33, 37, 41, 45, 48, 49, 48, 56, 62; evening 12, 14, 17, 18, 21, 22, 23, 23, 28, 32.
Each month sums to the 2026 row above.

Cost per drop, October 2025 to October 2026 (a waterfall): €3.40; Flock batching −€0.58; denser
hubs −€0.41; faster handovers −€0.22; rider pay rise +€0.15; €2.34.

Stops per hour by way of delivering, centre of Kestwick: Wrenhaul rider 9.4; van courier 5.8;
merchant's own van 5.1; gig car 4.2; walking courier 3.0.

On time by city, October 2025 to October 2026 (%): Kestwick 94.0 → 98.6; Marrowgate 91.2 → 97.9;
Port Ellis 89.5 → 97.1; Hollin (opened Feb 2026) none → 98.2; Ebbsford (opened Feb 2026) none →
96.4.

On time by city, March 2026 (the first full month of the three cities opened in February) to
October 2026 (%), all six on `chart-slope`: Kestwick 97.0 → 98.6; Marrowgate 95.4 → 97.9; Port
Ellis 94.1 → 97.1; Hollin 92.8 → 98.2; Ebbsford 90.2 → 96.4; Calder Bay 89.6 → 96.9. The three new
cities gained 5.4 to 7.3 points, the older three 1.6 to 3.0.

Revenue by merchant type, October 2026: grocers 38%, pharmacies and health 21%, food and bakery
17%, parcel partners 14%, other shops 10%.

**Contribution profit by merchant type.** The same shares divide October's €564,200 revenue.
Contribution margins are 19% for grocers, 45% for pharmacies, 23% for bakeries, 20% for parcel
partners and 11.2% for other shops. Pharmacies contribute €53,317 and grocers contribute €40,735.

**Retention by signup cohort.** Count the shops from each signup month still sending drops at a
given elapsed month. April began with 34, retained 28 at month three (82%) and 25 at month six
(74%). July began with 47 and retained 43 at month three (91%). The August and September cohorts
are younger than three months as of October. The rates on the slide are rounded from whole-shop
counts.

**Market movement.** Use monthly snapshots from March, June and October 2026 of merchant price
per drop and the share delivered inside its window. Wrenhaul moves from €3.52 and 94.5% to €3.31
and 96.7%, then €3.10 and 97.8%. Compare with van couriers, merchants' own vans and gig apps at
each observation date. Source the comparison to the operating report and merchant survey.

Merchants who signed up in 2026 (to October): signed up 1,480; connected their shop 910; sent a
first drop 640; still sending after 90 days 352. The biggest loss is the first step: four in ten
sign-ups never connect their shop.

Drops by merchant type, thousands, October 2025 → October 2026: grocers 26 → 69; pharmacies and
health 9 → 38 (4.2×, the fastest of the types we had a year ago); food and bakery 14 → 31;
parcel partners 0 → 26 (new with the beta); other shops 12 → 18. Each year sums to its month in
the table above, and 2026's shares are the revenue shares.

Hub density against cost (drops per km² a day, cost per drop): Old Town 410, €1.98; Canal Yard
360, €2.01; Market Cross 330, €2.06; Weir Street 300, €2.14; Harbourside 280, €2.21; Abbey Green
260, €2.29; Northgate 250, €2.32; Bridge End 240, €2.35; Station Quarter 220, €2.43; Tanner Row
190, €2.57; Docks 180, €2.62; Promenade 170, €2.71; Castle Hill 150, €2.86; Sandgate 120, €3.12
(the only hub that costs more than the €3.10 a drop earns).

Drops by weekday and time, Kestwick, October 2026 (average drops per two-hour band):

| | 8–10 | 10–12 | 12–14 | 14–16 | 16–18 | 18–20 |
| --- | --- | --- | --- | --- | --- | --- |
| Mon | 180 | 260 | 310 | 290 | 380 | 240 |
| Tue | 170 | 250 | 300 | 280 | 370 | 230 |
| Wed | 190 | 270 | 320 | 300 | 390 | 250 |
| Thu | 200 | 280 | 330 | 310 | 420 | 280 |
| Fri | 210 | 300 | 360 | 340 | 510 | 330 |
| Sat | 150 | 340 | 380 | 330 | 300 | 190 |

Recipients offered a same-hour window: 8 in 10 choose it. Series A committed: €8M of €14M.
Rider turnover by month, 2026 (%): 7.1, 6.4, 6.0, 5.5, 5.2, 4.9, 4.6, 4.4, 4.1, 4.0.

Pantry Lane Grocers, before Wrenhaul (2024) and after (2026): same-day orders per shop a week 38 →
62 (+63%); cost per delivery €6.80 → €3.20; delivery complaints per 1,000 orders 14 → 4.
St Brenna Hospital: sample transit from clinic to lab 74 min → 31 min. Brightloaf Bakery: orders
delivered warm (under 40 min) 41% → 93%; online orders a week 120 → 410 (before is 2021, the year
before Brightloaf joined; St Brenna's before is 2025, before June).

A rider's day: a shift is six loops, about 54 drops and 43 km (Aoife Brennan, Old Town, a Tuesday
in October). The Old Town hub runs about 75 loops a day (680 drops ÷ 9); an average hub about 55.

The drop the deck follows (code, sequence, hops and the motion part): `drp_7Hq2`, a loaf from
Brightloaf to 14 Weir Street, flat 2. Booked 08:42:10 in the same-hour window, quoted at the door by
09:24; batched 08:42:51 onto Aoife's loop 14 from the Old Town hub as stop 7 of 9; picked up 08:43:30; delivered 09:21:47 (the webhook log
on `console.svg`, which posts to `https://brightloaf.example/hooks`). The recipient is E. Wickham;
the loaf rides in slot B3 (one bag, 2.4 kg), as `rider-next-stop.svg` shows it, and is stop 7 of
`rider-loop.svg` and the order on `track.svg`. Scanned into its slot at the hub at 08:50; loop 14
leaves at 08:51 (`gallery-places`).
On the way: Brightloaf to the hub 0.6 km, the hub past six stops 4.1 km, the last leg 0.3 km.
That day it is one of about 7,000 drops across the network.

## Timeline

| Date | Event |
| --- | --- |
| Mar 2022 | Kestwick closes its Old Town to vans; Wrenhaul founded, first hub (Old Town), Brightloaf is the first merchant |
| May 2023 | Seed round, €3.2M, Brackwater Ventures |
| Sep 2024 | Marrowgate and Port Ellis open |
| Jun 2025 | Flock replaces batching by hand; St Brenna Hospital signs |
| Feb 2026 | Hollin, Ebbsford and Calder Bay open (Calder Bay's second hub slipped from November 2025) |
| Sep 2026 | Open Network beta with 60 merchants and Halyard Parcel |
| 3 Dec 2026 | Open Network launch and the Series A (this talk) |
| Q1 2027 | Returns pick-up: riders collect returns on their next loop; cold boxes for pharmacies |
| Q2 2027 | Saltby, Ardwen, Fallowmere and Tarnock open |
| Q4 2027 | 500,000 drops a month |
| Q2 2028 | Company break-even |

Open Network's rollout, 12 weeks from beta to launch: 10 Sep 2026 the beta opens (60 merchants
and Halyard Parcel); 8 Oct the SDK and the CLI reach 1.0; 12 Nov webhooks retry, so no event is
lost; 3 Dec the launch; Q1 2027 returns pick-up, the first thing added after it. **Launch means
open to all:** from 3 December 2026 any shop, platform or carrier in the six cities can book through
Open Network, the beta ends that day, and there is no later "generally available" step (never write
"generally available" or "out of beta" for a later date).

Roadmap board (Now / Next / Later): **Now** (Q1 2027) returns picked up on the next loop,
Track leave-with-neighbour, cold boxes for pharmacies; **Next** (2027) four new cities, Saltby's
second hub (Mill Green), carrier integrations; **Later** (2028) night consolidation hubs, kerb data for councils,
bikes shared between hubs.

The 2026 openings: leases for the six new hubs signed in September 2025; the four Hollin and
Ebbsford hubs were fitted out in December 2025; **Sandgate** (Calder
Bay's second hub) was to open early, in November 2025, as the city's trial run, and slipped to
February 2026 because the unit had no power supply for the chargers; 132 riders trained in
Kestwick in January 2026, four weeks each; all six hubs opened in February 2026.

The 2027 cities at opening (merchants signed ahead are letters of intent, November 2026):

| City | Opens | Hubs at opening | Riders | Merchants signed ahead |
| --- | --- | --- | --- | --- |
| Saltby | April 2027 | Quayside (Mill Green follows in the autumn) | 22 | 31 |
| Ardwen | May 2027 | Cathedral Close, Ropewalk | 48 | 24 |
| Fallowmere | May 2027 | Weavers Yard | 20 | 12 |
| Tarnock | June 2027 | Northbridge, Fishmarket | 44 | 19 |

On `matrix-cities` and `columns-four`: Saltby has the densest centre and the keenest council;
Ardwen is dense and its council is still deciding; Fallowmere is a small centre with a willing
council; Tarnock is dense but its council is wary.

Six hubs and 134 riders at opening, 20 hubs in all. **Saltby's first hub** (Quayside, 40 m²) is a
board decision of **€380k**: lease signed January 2027, first loops April 2027 with 22 riders and
22 bikes, covering its own costs by September 2027 (the five-month median payback).

## Architecture

Merchant systems (shop platforms, tills, carriers) call the **Open Network API**; drops land in
the **drops store**; **Flock** batches waiting drops every 90 seconds into loops; the **route
solver** orders each loop's stops; the **Rider** app receives the loop; every change goes on the
**event stream**, which feeds **webhooks** to merchants, the **Track** page and **Insights**.
Overflow (a parcel over 25 kg, or a window no rider can make) goes to a partner van. Stack, top to
bottom: merchants and carriers; Open Network API and SDK; Flock and the route solver; Dispatch,
Rider and Track; hubs, riders and bikes.

The hub's day is a loop: collect from merchants, batch, ride, hand over, return (empties and
returns back to the hub). A hub of 500 drops a day runs it about 56 times.

Routing, October 2026: 93% of drops go on a bike loop, 5% overflow to a partner van, and 2%
that no van can make in time either move to the next day with the recipient's agreement. Flock's
config: a batch every 90 seconds (300 before Hana Sato's change), at most 9 drops and 75 minutes a
loop. Webhooks reach the merchant 0.4 s after the rider's tap at the median; a failed one is
retried after 2, 4 and 8 seconds, then hourly for a day. The Dispatch demo: at 09:56 Flock batches
18 waiting drops at the Old Town hub into loop 17 (Aoife, 66 min, 7.0 km) and loop 18 (Jonas,
70 min, 7.4 km).

## Vocabulary and voice

- A **drop** is one delivery to one door. A **loop** is one rider's round from a hub and back. A
  **hub** is a neighbourhood base. A **window** is the time a drop is promised for. The
  **handover** is the moment at the door. **Merchants** send drops; **recipients** receive them.
- Riders are **riders**, never couriers or drivers; they are staff.
- Plain, specific, calm. Short sentences, numbers with units, euros (€3.10, €6.8M), sentence case,
  British spelling. No "revolutionary", "seamless", "game-changing". Say what changed and by how
  much.
- Wrenhaul says "we". Customers speak in their own words, about their own shop.

## Visual world

- **Colours** of the brand's own pictures (logo, screens, illustrations): ink `#1d2a33`, rust
  `#c8553d` (the wren), cream `#f5efe4`, slate `#5f6c74`, sage `#3f8a68` for "delivered", amber
  `#e0a43a` for "at risk". Slides themselves take the deck brand's colours; only pictures use
  these.
- **Logo:** a small wren in one stroke-like shape, tail up, beside the wordmark "wrenhaul" in
  lower case. The mark alone is used as an app icon.
- **Drawn scenes** (see "Scenes" below) take the brand's image treatment like a photograph would
  (rounded in `default`, `tidewater` and `fieldnote`, duotone in `nocturne`, as drawn in
  `kinetic`), so a run of them reads as one set in every brand. The exception is a scene on a
  `bento` tile: at that size the `nocturne` duotone turns the box, the goods and the hub sign to
  mud, so bento picture tiles take `treatment: plain` (the tile keeps its rounded corners from
  the layout). Product screens, whose colours mean something (sage delivered, amber at risk),
  also take `treatment: plain`.
- **Editorial photographs** illustrate one fictional delivery and one possible December 2027
  neighborhood. They use the same visual language as the drawings. They depict fictional people
  and illustrate product scenarios, with the disclosure on the slide.
- **Screens** are light, cream and white, with ink text, rust for the selected loop or primary
  button, sage for delivered and amber for at risk. Maps are drawn as soft street grids with a
  river, never a real city.
- **Portraits** are drawn stand-ins on soft coloured grounds, head and shoulders, in the same hand
  as the framework's other decks.
- **Motion:** the aurora video is shown as "the launch film's title sequence": light alone, one
  band sweeping the frame like a clock hand over a day, in three cued parts (it cuts the dark,
  swings upright, sets as amber fills the frame). Describe what is on screen; it shows no riders.
  The check animation is the Rider app's handover confirmation.

## Assets

Everything is in `decks/lookbook/assets/`; sources and licences are in `assets/CREDITS.txt`.

| File | What it shows |
| --- | --- |
| `logo/wrenhaul.svg` | The logo in colour: rust wren and ink wordmark, transparent |
| `logo/wrenhaul-mono.svg` | The same in one tone (ink), for mono logo walls and dark tinting |
| `logo/wrenhaul-mark.svg` | The wren alone, rust on transparent, square: app icon, morph subject |
| `people/ines-kowalczyk.svg` | Ines: short dark hair, round glasses, rust jacket, sand ground |
| `people/persona-recipient.svg` | Amara: swept dark hair, earrings, sage shirt, lilac ground; composite recipient |
| `people/persona-hub-lead.svg` | Sofia: long dark hair, glasses, slate top, sage ground; composite hub lead |
| `people/tobi-adeyemi.svg` | Tobi: close-cropped hair, beard, ink sweater, sage ground |
| `people/maren-solberg.svg` | Maren: blond hair tied back, cycling jacket in sage, blue ground |
| `people/rafael-duarte.svg` | Rafael: curly dark hair, slate shirt, peach ground |
| `people/hana-sato.svg` | Hana: black bob with fringe, cream top, lilac ground |
| `people/yusuf-demir.svg` | Yusuf: short hair, moustache, amber jacket, grey-blue ground |
| `people/lotte-brandsma.svg` | Lotte (Pantry Lane): long auburn hair, navy blazer, mint ground |
| `people/odile-ferrand.svg` | Odile (Brightloaf): grey hair in a bun, white apron over rust, cream ground |
| `logos/*.svg` | One mark each for the 12 customers and partners above, the two investors and the founders' three previous organisations (17 files, named after the organisation in kebab case) |
| `screens/dispatch.svg` | Dispatch, 1600×1000: hub map with three loops, rider list, a window alert, KPI strip |
| `screens/insights.svg` | Insights, 1600×1000: cost per drop chart, on-time tiles, CO2, merchant table |
| `screens/console.svg` | Open Network console, 1600×1000: API keys, a test drop request and response, webhook log |
| `screens/rider-next-stop.svg` | Rider app, 780×1688: next stop card, slot B3 in the box, map strip, handover button |
| `screens/rider-loop.svg` | Rider app, 780×1688: the loop as a list of nine stops, six done and the seventh next |
| `screens/track.svg` | Track page, 780×1688: rider on the map, "6 min away", leave-with-neighbour |
| `screens/rider-and-track.svg` | `rider-loop.svg` and `track.svg` side by side in two drawn phones, 1840×1748, at the same minute (09:18), for `split-phones` |
| `maps/kestwick-loops.svg` | A drawn map of Kestwick Old Town for `<Svg>`: river, streets, the Old Town hub, three loops and their stops, with ids (`streets`, `hub`, `loop-1` to `loop-3`, `stops-1` to `stops-3`, `labels` for the legend) for steps and drawing; its colours are the kit's recolor set: `{ "#e4572e": "accent", "#9aa1ae": "edge", "#d5d9e0": "border", "#ffffff": "bg", "#f4f5f8": "group", "#161920": "fg", "#555c6a": "label" }` |
| `media/aurora.webm` | Nine seconds of slow colour, dawn blue to amber: the launch film's title sequence, 1600×900 |
| `media/aurora-poster.jpg`, `media/aurora-part-1.jpg` to `-3.jpg` | Its poster and the still at the end of each of three cued parts |
| `media/check.json` | Lottie: a ring and a check mark drawing themselves (the handover confirmation) |

### Scenes

Illustrated scenes in `assets/scenes/`, 2400×1600 (3:2), drawn for full-bleed slides in the
palette above: Aoife (sage jacket, cream helmet, auburn ponytail) on a long-john cargo bike with
the rust box and the cream wren. They show Wrenhaul at work, so caption them as Wrenhaul (a
place and a time: "Aoife on loop 14, Kestwick Old Town, 08:55"). `focal` is given as frontmatter
(`75% 55%`) and as `<Image focal={[75, 55]} />`; tall means the 3:4 picture of `cover`, `section`
and `split` (`ratio: 7:5`), checked by shooting. The `image` layout's `focal:` applies to a
Markdown image; in `title`, `section` and `split` a Markdown image (`![…](…)`) carries no focal
and crops at the centre, which cuts the hero's rider out of the tall `cover` picture, so use
`<Image src=… alt=… focal={[100, 50]} />` there. Where each scene is used, one scene per part at
most: `rider-old-town` on `cover`, `image-bottom` and `gallery-places`; `old-town-above` on
`title-full` and `split-photo-right`; `hub-square` on `section-photo` and `bento-hub`;
`evening-street` on `image-left` and `bento-inverse`; `inside-the-hub` on `image-right` and
`gallery-places`; `van-at-the-bollards` on `image-alone`; `handover` on `split-photo-left-bleed`
and `gallery-places`; `what-merchants-send` on `bento-reveal`.

| File | What it shows | Calm area (for text) | Focal |
| --- | --- | --- | --- |
| `scenes/rider-old-town.svg` | The hero: Aoife riding left through an Old Town street in morning sun, a Brightloaf bag and a baguette on the box; facades in shade on the left | Left 45% (shaded facades, sky) and the bottom quarter (road in shade) | wide: `center`; tall: `100% 50%` / `[100, 50]` (the bike fills the frame); square: `92% 50%`; wide tiles (bento, gallery 2:1): `75% 55%` |
| `scenes/hub-square.svg` | The Old Town hub: a shop front with the rust wren sign on a square, a bike being loaded, one parked, the hub lead in the door with a crate | The top third (sky); the bottom has bikes, so not for `image` with `text: bottom` | wide: `center`; tall: `40% 50%`; bento 2:1: `40% 60%`; gallery: `30% 60%` |
| `scenes/handover.svg` | The handover: Aoife hands a warm Brightloaf bag to an older woman at her front door, the hall lit behind her, a cat at her feet | The left third (a plain wall in shade) | wide: `center`; tall: `66% 50%` / `[66, 50]` |
| `scenes/old-town-above.svg` | The Old Town from above: roofs, the river, three loops and the hub, on the geometry of `maps/kestwick-loops.svg`, contrast kept low | Even all over; meant to sit under a title with the layout's scrim | `center`; tall: `50% 50%` (the hub and two of the loops) |
| `scenes/inside-the-hub.svg` | Inside a hub: racks of labelled boxes, chargers, a parked bike, a rider scanning a parcel's label with a phone | The right third (the hub's dark painted wall), for `image` with `text: right` | wide: `center`; tall: `40% 50%` / `[40, 50]` |
| `scenes/evening-street.svg` | Evening: the street at dusk, windows and lamps lit, the rider's light on the road | The left half (dark sky and facades); dark overall, for evening slides and inverse surfaces | wide: `center`; tall: `100% 50%` / `[100, 50]`; square: `90% 50%` |
| `scenes/van-at-the-bollards.svg` | The problem: a van stopped at the bollards and a no-vans sign at the edge of the Old Town, its driver's hand to his forehead, while Aoife rides on | The top third (sky); full-bleed text overlaps the bike, so best in `split`, `gallery` or `bento` | wide: `center`; tall: `22% 55%` / `[22, 55]` (the bike and the van's cab); square: `55% 50%` |
| `scenes/what-merchants-send.svg` | A still life: an open Wrenhaul box holding a Brightloaf bag, a Calloway pharmacy bag, Fennick flowers and two Thimble books | The left 40% (dark ground), for `image` with `text: left` | wide: `center`; tall: `85% 50%` / `[85, 50]` |

The three `vision-*.jpg` scenes follow one kraft bakery bag. Odile packs the order at 08:42,
Aoife crosses the canal around 09:02, and the recipient takes it at 09:21. The
`future-back-district.jpg` image imagines the everyday December 2027 outcome. Its near-term test
is one shared delivery window across six shops for four weeks, measured in late drops and empty
loop slots.

For the Saltby opportunity map, Market Row and Quayside share the west bank. Mill Green sits
across the tidal river, with a single short crossing. Quayside opens first and the bridge queue
has to fit the hour before Mill Green can share the route. `maps/saltby-expansion.svg` is a drawn
map of that scenario. For the strategy canvas, the six buyer factors use qualitative offering
levels from 1 to 5. Wrenhaul focuses on reliable windows and Old Town access, while van couriers
can take heavier parcels across a wider radius.

The transit roadmap uses January, March, May and July 2027. In May, a live proof feed from Open
Network would let Hub Operations verify a returns handover and prepare for a July rollout. The
hill uses two qualitative scope reviews, on 29 October and 12 November 2026. Returns proof moves
to execution once the team agrees who records the handover. Shop enrollment remains in discovery.

## Complete lookbook edition

The kit has 63 layouts. This reference edition has 204 slides and 427 steps in twelve parts.
Slide budgets total 142 minutes 20 seconds within a 147-minute duration. The forty-minute launch
talk above selects from this edition.
