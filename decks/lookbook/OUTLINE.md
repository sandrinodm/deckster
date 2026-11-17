Illustrative content: Wrenhaul and every number in this deck are fictional (see `BRIEF.md`).

# Outline: the lookbook

The lookbook is Wrenhaul's launch day talk (3 December 2026: Open Network opens and the €14M
Series A is announced), cut into parts by the job a slide does, so an author looking for "a way to
compare options" or "a way to show a number" finds every form of it in one part. Within a part the
slides still follow the story: read a part top to bottom and it makes sense as a run of a talk.

## How to use this outline

- **Your rows.** Each row names its group (G1 to G6). Write the slides of your group's parts in
  the order given, with the ids given, and add each id to `deck.config.ts` inside your part's
  comment block after the file exists. The cover and the twelve dividers (`part-*`) are written;
  do not change them.
- **The claim column is the title**, in spirit: keep the claim, fit the layout's title budget,
  and use `BRIEF.md` for every name and number. A row's "Shows" column is what the slide must
  demonstrate; the coverage test checks most of it.
- **Layouts the kit added last** (`screen`, `equation`, `ask`, `proof`, `matrix`, `columns`,
  `statement`'s `size: giant` and `team`'s founders form): their field names below were read from
  the catalog when this outline was written. Read `pnpm deck layouts lookbook --json` when you
  start, since a field may have changed, and plan from the contract's description and example.
- **Builds** follow `skills/create-presentation/references/slide-craft.md` section 7: build in
  the order the notes speak, the last step carries the whole claim, every step has a `[click]`.
  "Whole" means no build.
- **Known kit weaknesses** to plan around: `effect="blur"` keeps the treatment of the kit's
  `<Image>` and media, but a raw element whose own `style` sets a filter is not blurred; words
  inside a sentence fade, blur or wipe but cannot `rise` or `scale`, so wrap block content (a
  paragraph on its own lines, an image, a list) and leave blank lines inside the `<Step>`; a
  `<Morph>` suits a photo, logo or screenshot whose box is its own size, never a chart or a big
  number that fills its region.
- **Repetition.** `deck lint` warns on three slides in a row with the same layout on the same
  surface. The order and surfaces below avoid it; if you change a surface, check your neighbours,
  including the first and last slides of the parts beside yours.
- **Pictures.** There are no photographs: eight drawn scenes (`assets/scenes/`, listed in
  `BRIEF.md` with each one's calm area and tested `focal`) show Wrenhaul at work, and screens carry
  the product. Use a scene at most once per part, put text only on its calm area, and caption it
  with a place and a time ("Aoife on loop 14, Kestwick Old Town, 08:55"). Scenes take the brand's
  image treatment, except on a `bento` tile, where they take `treatment: plain` to stay legible;
  screens take `treatment: plain`.
- **Budgets.** Give every slide a `budget:` (dividers 10s, statements and pictures 20s to 30s,
  evidence 45s to 1m30s). The deck's `duration` is the sum of the budgets rounded up with a little
  slack (`100m` for 94m35s); raise it with any slide you add, or `deck lint` reports the deck over time.

## Dividers

Every part opens with a `section` slide: `numeral: large`, `align: left` (the default), on the
accent surface (the default), `transition: cover`, with an eyebrow `Part N`, the part number, the
part's job as its title and one sentence of summary. The alternative divider forms (small
numeral, centred, with a picture) are specimens in part 1, on other surfaces so they never read as
real dividers.

## Parts and groups

| # | Part (divider id) | Job | Slides | Group |
| --- | --- | --- | --- | --- |
| 1 | Open (`part-open`) | Covers, agendas, the speaker, divider forms | 12 | G1 |
| 2 | Say one thing (`part-say`) | Statements, quotes, a picture across the slide | 12 | G1 |
| 3 | Explain (`part-explain`) | Text, text beside a picture, peers, processes, facets | 18 | G2 |
| 4 | Compare and decide (`part-compare`) | Options, a change, a map of the market, exact values | 11 | G3 |
| 5 | Prove it with a number (`part-numbers`) | Big numbers, before and after, a sum | 13 | G3 |
| 6 | Show the pattern (`part-charts`) | One chart each: trend, ranking, flow, spread | 11 | G4 |
| 7 | Show how it works (`part-how`) | Diagrams, code, live demos | 18 | G5 |
| 8 | Show the product (`part-product`) | Framed screens, galleries, a morph, video | 11 | G6 |
| 9 | People and proof (`part-people`) | Founders, team, customers' logos, case studies | 11 | G6 |
| 10 | Plan ahead and ask (`part-ahead`) | History, roadmap, the ask | 8 | G4 |
| 11 | Motion (`part-motion`) | The five step effects side by side, and focus | 7 | G2 |
| 12 | Close (`part-close`) | Links, a code to scan, the last slide | 5 | G5 |

Slides to write per group (the cover and dividers are done): G1 21, G2 23, G3 22, G4 17, G5 21,
G6 20.

## Slides

Columns: **Id**; **Layout and options** (frontmatter beyond `title`, `eyebrow`, `budget`);
**Claim** (the title's point); **Shows** (what the slide demonstrates); **Build**; **Group**.

### Part 1: Open (G1)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `cover` | `title`, `<Media>` with an `<Image>` of the rider scene, `focal={[100, 50]}` (`picture: side`, `align: left`, defaults) | Same hour, no van | The cover with a picture bleeding off the right edge, gradient surface | whole | done |
| `part-open` | `section`, divider form | Open | Divider | whole | done |
| `title-full` | `title`, `picture: full`, the Old Town from above in `<Media>`, `transition: fade` | Open Network opens today | The picture cover: text over a full-bleed picture on scrims; fade transition | whole | G1 |
| `title-center` | `title`, `align: center`, `surface: inverse`, no photo | Every shop, every street, within the hour | The type-only keynote cover, centred, on inverse | whole | G1 |
| `agenda-plan` | `agenda`, four items phrased as questions, with times | Four questions in forty minutes | The plan of the talk, 3 to 4 items | whole | G1 |
| `agenda-long` | `agenda`, six items with `detail` and times, `surface: inverse` | The launch day, hour by hour | The 5 to 7 item variant (the day's programme) | whole | G1 |
| `bio-founder` | `bio`, Ines's portrait, two `contacts` | Ines Kowalczyk, who presents | A speaker with a portrait, three facts, two contacts | whole | G1 |
| `agenda-current` | `agenda`, the four items of `agenda-plan` with `current: 3` | Part three: the proof | Where we are: the marked item, earlier ones faded | whole | G1 |
| `section-numeral-small` | `section`, `numeral: small`, `surface: gradient` | The first hub, March 2022 | The small-numeral divider form, as a chapter opener in a story | whole | G1 |
| `bio-initials` | `bio`, Aoife Brennan, no `photo`, one contact | Aoife Brennan, the first rider | The initials tile when there is no portrait | whole | G1 |
| `section-center` | `section`, `align: center`, `numeral: large`, `surface: inverse` | Why the last mile is a bike ride | The centred divider form | whole | G1 |
| `section-photo` | `section`, `<Media>` with an `<Image>` of the hub on its square, `focal={[40, 50]}`, `numeral: large`, `surface: default` | The hub on the square | The divider with a picture filling the right five columns | whole | G1 |

### Part 2: Say one thing (G1)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-say` | `section`, divider form | Say one thing | Divider | whole | done |
| `statement-claim` | `statement`, `emphasis: underline` (inverse, left, defaults) | A shop should promise *the same hour* without owning a van | The big idea with two marked words over the accent rule | whole | G1 |
| `quote-portrait` | `quote`, Odile's `photo` with `focal`, `transition: fade` | Bread that arrives warm is a different product | A customer quote beside her portrait; fade transition | whole | G1 |
| `image-bottom` | `image`, the rider in the Old Town, `text: bottom` (default), a caption | A rider stops at nine doors an hour | A picture edge to edge, title and a line along the bottom | whole | G1 |
| `statement-center` | `statement`, `align: center`, `surface: accent` | Vans are leaving the old towns. Deliveries are not. | The centred turn in the story, on accent | whole | G1 |
| `quote-plain` | `quote`, Dr Imogen Hale, no photo, `surface: inverse` | A sample used to wait for the van | The quote without a portrait, on inverse | whole | G1 |
| `image-left` | `image`, the evening street, `text: left`, `focal` | We deliver until nine at night | Text in the left third over a calm part of the picture | whole | G1 |
| `statement-giant` | `statement`, `size: giant` (up to five words), `transition: none` | Same hour. No van. | The giant statement; a hard cut | whole | G1 |
| `image-right` | `image`, inside the hub, `text: right` | Every parcel leaves the hub in its own slot | Text in the right third, on the hub's dark wall | whole | G1 |
| `statement-quote` | `statement`, `<Attribution>` (Councillor Fenna Vos), `surface: gradient` | The Old Town got its streets back and its shops kept their customers | A statement set as a quote; the attribution arrives with `<Step at={1} effect="fade">` | 0 the quote; 1 who said it (fade) | G1 |
| `quote-accent` | `quote`, Lotte's `photo`, `surface: accent` | We stopped turning down same-day orders at noon | The quote with a portrait on the accent surface | whole | G1 |
| `image-alone` | `image`, the van at the bollards, `text: none`, `transition: zoom` | The van stops here, the bike rides on (title only, not shown) | The picture alone, no text; zoom transition | whole | G1 |

### Part 3: Explain (G2)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-explain` | `section`, divider form | Explain | Divider | whole | done |
| `default-heading` | `default`, a `#` heading (display size) and a lead paragraph | A drop is one parcel, one door, one promised window | The plainest layout, its heading at display size; the lead paragraph arrives with `effect="blur"` (text only) | 0 the heading; 1 the definition (blur) | G2 |
| `content-text` | `content` (`width: text`, default), a sentence and four bullets, each starting with an inline `<Icon>` | A hub is a shop front, not a warehouse | Prose and bullets set large in the middle; `<Icon>` inline in text | whole | G2 |
| `split-photo-right` | `split`, `ratio: 1:1`, `side: right` (defaults), `<Image>` of the Old Town from above with `focal` | Riders know their streets by name | Text beside a picture in the brand treatment; the `<Image>` component | whole | G2 |
| `cards-three` | `cards`, three cards with icons | Open Network does three things for a shop | Three peers with icons | whole | G2 |
| `default-list` | `default`, a heading and four bullets, each in `<Step focus>` | Flock makes four decisions every 90 seconds | `focus`: each new point at full strength, earlier ones recede | 1 to 4 one decision each (focus) | G2 |
| `split-photo-left-bleed` | `split`, `ratio: 7:5`, `side: left`, `bleed: true`, the handover as an `<Image>` with `focal` | People are home when the drop arrives | A picture bled to the slide's edges on the left, 7:5 | whole | G2 |
| `steps-loop` | `steps`, five steps (collect, batch, ride, hand over, return), `reveal: true` | Every loop runs the same five steps | A process; `reveal: true` | 1 to 4 one step each | G2 |
| `content-aside` | `content`, a short paragraph, `<Aside>` with the definition of a loop | A loop is the unit we plan, staff and cost | The content layout's aside variant | whole | G2 |
| `cards-four-reveal` | `cards`, four cards (what riders get: wage, sick pay, a bike, training), `reveal: true` | Riders are staff, with everything that comes with it | The four-card variant, one per step | 1 to 3 one card each | G2 |
| `split-screen` | `split`, `ratio: 5:7`, `side: right`, `rider-next-stop.svg` as `<Image fit="contain">` | The rider sees one stop at a time | A phone screen as the evidence beside text, 5:7 | whole | G2 |
| `bento-hub` | `bento`, four tiles: lead figure (680 drops a day), a heading tile with an icon (€1.98 a drop, in the wide tile under the title), a second figure (98.9% on time) and the hub on its square as the last, narrow tile; one icon tile only, because a small tile sets its icon above the heading below 440 px and the four-column tile falls under that in some brands | One hub, Old Town, seen from four sides | Bento with a figure, a picture and headings | whole | G2 |
| `steps-current` | `steps`, four steps of onboarding a merchant, `current: 2`, `surface: inverse` | A new merchant sends a first drop in four steps | The line filled up to the current step, on inverse | whole | G2 |
| `split-lottie` | `split`, `ratio: 1:1`, `side: left`, `<Lottie size="full">` check in `<Media>`, not in a step, a `<Caption>` | Every handover ends with a check | `<Lottie>` drawing itself as the slide arrives | whole | G2 |
| `cards-accent` | `cards`, three cards (the three windows), `surface: accent` | Three windows cover every kind of shop | Cards on the accent surface | whole | G2 |
| `bento-reveal` | `bento`, five tiles about the launch (lead figure, the open box of what merchants send, headings), `reveal: true` | Open Network launches in six cities today | The five-tile bento, `reveal: true` | one tile per step | G2 |
| `steps-three` | `steps`, three steps of opening a hub, `surface: gradient` | A new hub takes three steps and five months | Three steps, gradient surface | whole | G2 |
| `bento-inverse` | `bento`, three tiles (a figure, the evening street, a heading) about Aoife's day, `surface: inverse` | A rider's day is six loops | The three-tile bento on inverse | whole | G2 |

### Part 4: Compare and decide (G3)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-compare` | `section`, divider form | Compare and decide | Divider | whole | done |
| `comparison-modes` | `comparison`, three options (own van, van courier, Wrenhaul), four rows with `winner`, `recommended: true` on Wrenhaul | A bike beats a van on every row that matters | Three options, winners per row, the recommended panel | whole | G3 |
| `shift-window` | `shift`, from "Next day by van" (€6.40) to "Within the hour by bike" (€3.10), `reveal: true`, `transition: wipe` | Shops move from next day to the same hour | The old and new state; the new arrives on a click; wipe transition | 1 the new state | G3 |
| `matrix-market` | `matrix`, `x` cost per drop (high to low), `y` window (next day to within the hour), four `quadrants` captions, the five alternatives as `items` with Wrenhaul `us: true`, `reveal: true` | Only Wrenhaul is fast and cheap at once | The two-by-two with labelled axis ends, quadrant captions, the subject marked; `reveal: true` | 0 the axes; 1 the alternatives; 2 Wrenhaul and the note | G3 |
| `table-hubs` | `table`, Markdown table of the 14 hubs or the six cities (drops a day, cost, on time), `highlight: { row: ... }`, `numbers: right` (default), `<Aside>` | Density sets the cost of a drop | Numbers right-aligned, a highlighted row, the aside variant | whole | G3 |
| `comparison-before-after` | `comparison`, two options (Pantry Lane in 2024, in 2026), four rows with true/false and text, `reveal: true` | Pantry Lane now delivers at half the cost | Before and after with checks and dashes; one option per click | 1 the after column | G3 |
| `shift-cost` | `shift`, from €6.40 to €3.10 a drop with labels and lines, `surface: inverse` | A drop costs half of what a van costs | The shift on inverse with figures | whole | G3 |
| `matrix-cities` | `matrix`, `x` drops per km² (low to high), `y` council support (low to high), no quadrant captions, six candidate cities as `items` with Saltby `us: true` | Saltby is the next city to open | The matrix as a decision without quadrant captions | whole | G3 |
| `table-plans` | `table`, the three price plans as rows with text figures ("€190 a month", "from 10,000"), `numbers: left`, `highlight` on the per-drop column | Three ways to pay, one price per drop | `numbers: left` for a grid of mixed text; a highlighted column | whole | G3 |
| `comparison-plans` | `comparison`, three plans, `recommended: true` on Open Network, `badge: Most merchants`, `surface: inverse` | Most merchants should start on Open Network | A custom badge, on inverse | whole | G3 |
| `table-cities` | `table`, six cities × five columns (live since, hubs, drops a day, cost, on time), highlight a column | Every city is on time above 96% | A wider table, highlighted column | whole | G3 |

### Part 5: Prove it with a number (G3)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-numbers` | `section`, divider form | Prove it with a number | Divider | whole | done |
| `stats-traction` | `stats`, four stats (drops, ARR, merchants, on time), `highlight: true` on ARR, `transition: rise` | Revenue grew 3.2× in a year, faster than the drops | Four stats, one highlighted; figures count up; rise transition | whole (count-up) | G3 |
| `chart-bignumber` | `chart`, `<BigNumber value={2400000} context=... at={1}>` in compact format, `surface: accent` | 2.4 million drops since the first loaf in 2022 | One number with its context; it counts up at its step | 1 the number (count-up) | G3 |
| `equation-arr` | `equation`, three terms (drops a month, price, 12 months) and the result €6.8M, `reveal: true` | Our revenue is drops times €3.10 | A sum built term by term, the result counting up last | terms one per step, result last | G3 |
| `stats-three` | `stats`, three stats about riders (310, €15.40 an hour, 4% leave a month), `surface: inverse` | Riders stay because the job is a job | Three stats on inverse | whole | G3 |
| `chart-comparison` | `chart`, `<Comparison>` of our cost per drop, €3.40 to €2.34, `better="down"` | A drop costs us €2.34, a euro less than a year ago | Before and after as one comparison figure | whole | G3 |
| `equation-market` | `equation`, three terms (46 cities, 21M drops, €3.10) and €3.0B | The market is €3.0B a year in 46 cities | Bottom-up market size | whole | G3 |
| `content-statrow` | `content`, `width: full`, a sentence and `<StatRow>` of four stats with changes | Every number moved the right way this year | `width: full`; `<StatRow>` with changes and a highlight | whole | G3 |
| `split-pictogram` | `split`, `ratio: 1:1`, `side: left`, `<Pictogram value={8} total={10}>` | Given the choice, people pick the hour | A proportion as people beside text | whole | G3 |
| `stats-two` | `stats`, two stats (52 min, 0 g tailpipe CO2), `surface: accent` | Fast and clean are the same promise | Two stats on accent | whole | G3 |
| `chart-progress` | `chart`, `<Progress>` of the round (€8M of €14M, target marked) or the 2026 goals as `items` | €8M of the €14M is committed | Progress toward a target | whole | G3 |
| `content-sparkline` | `content`, a paragraph on rider turnover, `<Aside>` with a `<Sparkline>` and the figure; the last sentence in `<Step effect="wipe">` | Rider turnover fell every month this year | `<Sparkline>` as context in an aside; `wipe` on a sentence read left to right | 1 the closing sentence (wipe) | G3 |
| `equation-loop` | `equation`, two terms (9 drops × €0.76), result €6.84, `surface: inverse` | Every loop earns €6.84 before overheads | Unit economics as a two-term sum, on inverse | whole | G3 |

### Part 6: Show the pattern (G4)

One chart per slide, each with a takeaway title, a highlight, a unit and a source. Datasets are in
`BRIEF.md`.

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-charts` | `section`, divider form | Show the pattern | Divider | whole | done |
| `chart-line` | `chart`, `<LineChart>` 2025 and 2026, highlight 2026, a callout at September (Open Network beta) | Drops tripled in a year, and the Open Network beta bent the curve | Two lines, one highlighted, a callout annotation | 0 the lines; 1 the highlight; 2 the callout | G4 |
| `chart-bar` | `chart`, `<BarChart>` stops per hour, horizontal, sorted, highlight Wrenhaul | A rider makes 9.4 stops an hour, nearly twice a merchant's own van | Sorted bars, one highlighted | whole | G4 |
| `split-donut` | `split`, `ratio: 5:7`, `side: right`, `<Donut>` revenue by merchant type, `centerLabel` | Two kinds of shop pay 59% | A donut beside its explanation | whole | G4 |
| `chart-waterfall` | `chart`, `<Waterfall>` cost per drop €3.40 to €2.34, `reveal="series"` | Batching saved more than any other change | A bridge between two totals, built totals first | 0 the totals; 1 the changes; 2 Flock batching highlighted, with the aside | G4 |
| `chart-area` | `chart`, `<AreaChart>` stacked by window, `surface: inverse` | Same-hour drops tripled this year, faster than any other window | A stacked composition over time, on inverse | whole | G4 |
| `chart-slope` | `chart`, `<Slope>` on time by city for all six cities, March to October 2026, the three newest highlighted, an `<Aside>` | The three newest cities closed the gap by October | Change between two points for several items, a group highlighted | whole | G4 |
| `chart-funnel` | `chart`, `<Funnel>` 2026 sign-ups, highlight "Connected their shop" | Four in ten sign-ups never connect their shop | Drop-off through stages, the biggest loss highlighted | whole | G4 |
| `chart-table` | `chart`, `<Table>` of drops by merchant type (October 2025, October 2026, growth as a bar column), highlight the pharmacies row, `surface: inverse` | Pharmacies grew fastest, four times in a year | The kit `<Table>` with a bar column | whole | G4 |
| `chart-scatter` | `chart`, `<Scatter>` hub density against cost, `trend`, highlight Old Town and Sandgate | The denser the hub, the cheaper the drop | Correlation with a trend line and labelled points | 0 the points; 1 the trend and highlight | G4 |
| `chart-heatmap` | `chart`, `<Heatmap>` weekday by time band, highlight Friday 16–18 | Friday from four to six is the busiest two hours of the week | A two-dimensional pattern with one cell outlined | whole | G4 |

### Part 7: Show how it works (G5)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-how` | `section`, divider form | Show how it works | Divider | whole | done |
| `diagram-architecture` | `diagram`, `<Flow>` with `<Node>`s in two `<Group>`s (merchant side, Wrenhaul), `<Edge>` labels, `<Journey path=... focus>` | Every drop crosses five systems on its way to a rider | Flow, Node, Group, Edge; a journey that dims everything off its path | 0 the systems; 1 to 5 the journey, one hop per step | G5 |
| `code-sdk` | `code`, fenced TypeScript (`@wrenhaul/sdk`, `drops.create`) with `{2-4\|6-8}` and a `title` | Booking a drop is one call | A fenced block with stepped highlights | 1 and 2 one range each | G5 |
| `diagram-sequence` | `diagram`, `<SequenceDiagram>` with `<Actor>`s (merchant, API, Flock, rider, recipient) and `<Message>`s | A drop is booked, batched and handed over in 52 minutes | A sequence, one message per step | one message per step | G5 |
| `code-terminal` | `code`, `<Terminal>` with `<Cmd>` and `<Out>` (the `wren` CLI: quote a drop, book it) | You can book a drop from a terminal | A typed session; each command a step | one command per step | G5 |
| `diagram-events` | `diagram`, `<Flow>` with `<Packet>`s on the event stream, a `<State>` (a webhook endpoint failing, then retried) and `<Focus>` | Every change reaches the merchant within a second, or is retried until it does | Packets, a state change, focus on part of the flow | 0 the flow; 1 packets; 2 the failing state; 3 focus on the retry | G5 |
| `code-move` | `code`, `<CodeMove>` between two fenced versions (v1 single drop, v2 with `window`) | Windows are one new field | Tokens moving between versions | 1 the second version | G5 |
| `diagram-hops` | `diagram`, `<Flow>` of five nodes in a loop of three rows, a `<Journey>` of `<Hop>` children with their own labels and a reply, the last hop a `path` back through Open Network, an `<Aside>` | A drop's trip from shop to door, hop by hop | Journey with Hop children, labels and a reply; a diagram beside an aside | one hop per step | G5 |
| `code-codestep` | `code`, `<CodeMove>` with two `<CodeStep>`s (a `curl` in bash, then the SDK in TypeScript) | The SDK is the same call, typed | CodeStep across languages | 1 the TypeScript | G5 |
| `diagram-layers` | `diagram`, `<Layers>` of five `<Layer>`s with `<Item>` chips, `surface: inverse` | Merchants touch one layer; riders another | A stacked architecture, on inverse | one layer per step, top down; Open Network and Streets marked `highlighted`, the two lit at the end | G5 |
| `code-diff` | `code`, a fenced YAML with `diff` (Flock's interval 300s to 90s) and an `<Aside>` | Batching every 90 seconds was a one-line change | A diff fence beside notes | whole | G5 |
| `diagram-cycle` | `diagram`, `<Cycle steps>` (collect, batch, ride, hand over, return) with an `<Edge>` label on the return | A hub's day is one loop, run 56 times | A loop walked one stage per step | one stage per step | G5 |
| `code-webhook` | `code`, fenced TypeScript webhook handler with `lineNumbers` and `words`, `surface: inverse` | A webhook tells you the parcel is home | Line numbers and marked words, on inverse | 1 the signature check; 2 the event | G5 |
| `diagram-tree` | `diagram`, `<Tree>` of the routing decision (bike, partner van, next day) | Flock sends nine drops in ten to a bike | A decision tree, a branch revealed at a step | 1 the overflow branch | G5 |
| `diagram-cards` | `diagram`, `<Flow>` whose `<Node>`s pick a `card`: three partners on `outline`, Open Network on `solid`, Wrenhaul's own systems on the brand default | Three kinds of partner, and one door into Wrenhaul | Cards picked by name, standard names only, so it reads the same in every brand | 0 the partners and Open Network; 1 the systems behind it | G5 |
| `diagram-timeline` | `diagram`, `<Timeline>` with `<Milestone>`s of Open Network's rollout (beta to launch, then returns pick-up), `current`, `surface: inverse` | Open Network went from beta to launch in 12 weeks | The diagram timeline (explicit `<Timeline>`/`<Milestone>`, not the timeline layout) | one milestone per step | G5 |
| `diagram-svg` | `diagram`, `<Svg src="../assets/maps/kestwick-loops.svg">` with `steps` (hub, then each loop with its stops), `draw` and the `recolor` map from `BRIEF.md` (checked: it lints clean in three brands) | Three loops cover the Old Town from one hub | A drawn map revealed by id and drawn on | 1 the hub; 2 to 4 one loop each | G5 |
| `demo-appframe` | `demo`, `<AppFrame app="dispatch-sim">` with a poster and `<Aside>`; build the mini app in `apps/dispatch-sim/` (`pnpm deck new app`) and a poster in `assets/` | Watch Flock build a loop | A mini app in a sandboxed frame, with a poster | as the app's steps | G5 |
| `demo-live` | `demo`, a **TSX slide** with `<Live>` (a drop price calculator in `lib/`), a poster, an `<Aside>` | Price your own drops | `<Live>`: a React widget inline, with a poster | whole | G5 |

### Part 8: Show the product (G6)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-product` | `section`, divider form | Show the product | Divider | whole | done |
| `screen-dispatch` | `screen`, `frame: browser`, `address`, `dispatch.svg`, three or four `callouts`, `reveal: true`, `transition: zoom` | A hub lead runs the whole day from one map | The browser frame with numbered callouts, one per step; zoom transition | one callout per step | G6 |
| `split-phones` | `split`, `ratio: 5:7`, `side: right`, `screens/rider-and-track.svg` (the Rider loop and the Track page in two drawn phones, one picture) at `fit: contain`, `treatment: plain`, `transition: slide` | One loop, seen from saddle and door | Two phone screens of one moment side by side; slide transition | whole | G6 |
| `screen-rider` | `screen`, `frame: phone`, `rider-next-stop.svg`, callouts, `reveal: true` | The rider never has to think about the route | The phone frame | one callout per step | G6 |
| `morph-dispatch-overview` | `split`, `ratio: 5:7`, `side: right`, `<Morph id="dispatch">` around `<Image>` of `dispatch.svg` | Dispatch shows every loop at once | The first half of a `<Morph>` pair | whole | G6 |
| `morph-dispatch-detail` | `split`, `ratio: 5:7`, `side: left`, the same `<Morph id="dispatch">` | A window turns amber before it is missed | The screenshot flies to its new place and size | whole | G6 |
| `screen-insights` | `screen`, `frame: laptop`, `insights.svg`, callouts | Merchants see their cost per drop every week | The laptop frame | whole | G6 |
| `gallery-screens` | `gallery`, four pictures (dispatch, insights, console, a phone) with captions | Four screens run on one stream of events | The four-picture variant with captions | whole | G6 |
| `screen-console` | `screen`, `frame: none`, `console.svg`, two callouts, `surface: default` | Developers test a drop before they ship | The screen alone without a frame, on default | whole | G6 |
| `split-video` | `split`, `ratio: 5:7`, `side: right`, `<Video>` of `aurora.webm` with `cues={[0, 3, 6]}`, a poster and `posters` per part; the words describe the abstract title sequence as it is | The launch film opens in light alone | A cued video in three parts with stills for export | one part per step | G6 |
| `gallery-places` | `gallery`, three scenes of the loaf the deck follows (the handover as the lead, the hub, the street) with captions, `surface: default` | Booked at 08:42, at the door at 09:21 | Three pictures with captions on the default surface | whole | G6 |

### Part 9: People and proof (G6)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-people` | `section`, divider form | People and proof | Divider | whole | done |
| `team-founders` | `team`, three founders with `edge` and `previously:` marks | Each founder has run one part of this before | The founders form: larger portraits, an edge each, past organisations | whole | G6 |
| `logos-customers` | `logos`, five customers, `tone: mono` (default) | Five of our merchants, from warm bread to blood samples | One row of mono logos | whole | G6 |
| `proof-pantry-lane` | `proof`, Lotte's quote, photo, logo, three `metrics` with `from`, `timeframe`, `reveal: true` | Pantry Lane takes 63% more same-day orders | The case study, metrics one per step | 1 to 3 one metric each | G6 |
| `team-row` | `team`, four people (Rafael, Hana, Yusuf, Beatriz with initials) | Four people build what riders, hubs and partners use | A row of four, one initials tile | whole | G6 |
| `logos-color` | `logos`, eight customers and partners, `tone: color` | Eight kinds of shop already send drops | Logos in their own colours | whole | G6 |
| `proof-st-brenna` | `proof`, Dr Imogen Hale without photo, St Brenna logo, one metric, `surface: inverse` | Samples reach the lab in 31 minutes, not 74 | One metric, no portrait, on inverse | whole | G6 |
| `team-grid` | `team`, six people | Six leads run the company day to day | The grid of six | whole | G6 |
| `logos-wall` | `logos`, the 14 marks of customers, partners and investors (not the founders' former employers) | Fourteen organisations stand behind the launch | The 13 to 18 logo wall | whole | G6 |
| `proof-brightloaf` | `proof`, Odile, photo, logo, two metrics, `surface: accent` | Brightloaf delivers 93% of its bread warm | Two metrics, on accent | whole | G6 |
| `team-roster` | `team`, eight people | Eight people opened the first six cities | The roster of eight in two columns | whole | G6 |

### Part 10: Plan ahead and ask (G4)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-ahead` | `section`, divider form | Plan ahead and ask | Divider | whole | done |
| `timeline-history` | `timeline`, five milestones March 2022 to September 2026 with `state: success`, `transition: push` | Four years from one hub to six cities | A history, all done; push transition | whole | G4 |
| `columns-roadmap` | `columns`, Now, Next, Later with notes and items, `current: 1` | We finish the network before we widen it | The board with one column lit | whole | G4 |
| `timeline-roadmap` | `timeline`, five milestones from today's launch to Q2 2028 (returns pick-up, four cities, 500,000 drops, break-even), `current: 1`, the targets `state: muted`, `reveal: true` | Eighteen months from today's launch to break-even: the plan | `current`, tentative milestones, one per click | one milestone per step | G4 |
| `ask-series-a` | `ask`, `amount: €14M`, `label: Series A`, four milestones of what the money buys, one per allocation (`text`, `by`), `funds` (45, 30, 15, 10), `reveal: true` | Fund four new cities, then break-even: the ask | The amount, what it buys and the allocation bar; `reveal: true` | 0 the amount; 1 to 4 the milestones; 5 the bar | G4 |
| `columns-four` | `columns`, four columns (the four new cities, each with its hubs, riders, merchants and why), `reveal: true`, a footnote on the plan | Four cities and six hubs open between April and June | Four columns, one per step | one column per step | G4 |
| `timeline-slipped` | `timeline`, four milestones of the 2026 openings, one `state: error` (Calder Bay's second hub) | One opening slipped, and we said so | A slipped milestone next to done ones | whole | G4 |
| `ask-pilot` | `ask`, `amount: €380k`, `label: Saltby hub`, two or three milestones, no `funds`, `surface: inverse` | Approve Saltby's first hub this month | The ask without the bar, as a board decision | whole | G4 |

### Part 11: Motion (G2)

The same three beats on each slide (a drop is booked, batched, at the door), so the effects can be
compared, each in content it suits: a log that rises, messages that fade in, a zoom from 7,000
drops to one door, an arrival time coming into focus, a route drawn across, statuses where only
the latest is lit. Each is a `statement`, so the beats are set at display size where the eye goes;
the surface and alignment change from slide to slide. Effects that act on a block (rise, scale,
focus) take one paragraph per beat; fade, blur and wipe also step words inside one sentence.

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-motion` | `section`, divider form | Motion | Divider | whole | done |
| `motion-rise` | `statement`, `surface: default`, three lines, each its own paragraph in `<Step>` (default effect) | Rise: each entry of the log rises into place | `rise`, the default effect | 1 to 3 one beat each | G2 |
| `motion-fade` | `statement` (inverse), three messages, each a paragraph in `<Step effect="fade">` | Fade: each message appears where it stands | `fade` | 1 to 3 | G2 |
| `motion-scale` | `statement`, `align: center`, `surface: accent`, three lines in `<Step effect="scale">` (block content), 7,000 drops to one door | Scale: each beat grows a step closer | `scale`, growing from the middle of the words | 1 to 3 | G2 |
| `motion-blur` | `statement`, `align: center`, `surface: gradient`, one sentence with three phrases in `<Step effect="blur">` | Blur: the arrival time comes into focus | `blur` on words inside a line | 1 to 3 | G2 |
| `motion-wipe` | `statement`, `surface: inverse`, one sentence with three phrases in `<Step effect="wipe">` | Wipe: each leg is drawn from shop to door | `wipe` travelling across the words | 1 to 3 | G2 |
| `motion-focus` | `statement`, `surface: default`, three Track statuses, each a paragraph in `<Step focus>` | Focus: only the latest status is lit | `focus` with the default effect | 1 to 3 | G2 |

### Part 12: Close (G5)

| Id | Layout and options | Claim | Shows | Build | Group |
| --- | --- | --- | --- | --- | --- |
| `part-close` | `section`, divider form | Close | Divider | whole | done |
| `content-links` | `content`, `width: full`, three `<LinkCard>`s with descriptions in a row (docs, the SDK, status) and a `<Download>` of the slides under them | Everything you need to ship a drop today | LinkCard in a row and Download (needs `deck build --with-exports` to work) | whole | G5 |
| `split-qr` | `split`, `ratio: 7:5`, `<QR>` in `<Media>`, a sentence, three bullets and a `<Button>` in the text, a `<Caption>` | Book a test drop from your phone, now | `<QR>` with a caption and a `<Button>` | whole | G5 |
| `closing-ask` | `closing`, two `contacts` and a `qr:` | Send us your first drop this week | The closing slide with a QR code | whole | G5 |
| `closing-questions` | `closing`, three `contacts`, no QR (the last slide) | What should we deliver next? | The three-contact variant, as the questions slide | whole | G5 |

## Coverage map

Where each capability lives. The coverage test lists what is still missing; this is the plan.

- **Surfaces:** default (most slides), inverse (`title-center`, `agenda-long`, `section-center`,
  statements, `quote-plain`, images, `steps-current`, `bento-inverse`, `shift-cost`,
  `comparison-plans`, `stats-three`, `equation-loop`, `chart-area`, `chart-table`,
  `diagram-layers`, `code-webhook`, `diagram-timeline`, galleries, `proof-st-brenna`,
  `motion-fade`, `motion-wipe`),
  accent (dividers, `statement-center`, `quote-accent`, `cards-accent`, `chart-bignumber`,
  `stats-two`, `proof-brightloaf`, `motion-scale`), gradient (`cover`, `section-numeral-small`,
  `statement-quote`, `steps-three`, `motion-blur`, screens, closing).
- **Transitions:** none `statement-giant`; fade `title-full`, `quote-portrait`; slide
  `split-phones`; rise `stats-traction`; push `timeline-history`; cover every divider; wipe
  `shift-window`; zoom `image-alone`, `screen-dispatch`.
- **Step effects:** rise (default, everywhere, `motion-rise`); fade `statement-quote`,
  `motion-fade`; scale `motion-scale`; blur `default-heading`, `motion-blur`;
  wipe `content-sparkline`, `motion-wipe`; focus `default-list`, `motion-focus`.
- **Count-up:** `stats-traction`, `chart-bignumber`, `equation-arr`.
- **Morph pair:** `morph-dispatch-overview` and `morph-dispatch-detail` (a screenshot).
- **Layout options:** title picture side/full, align left/center (`cover`, `title-full`,
  `title-center`); section numeral small/large, align left/center (`section-numeral-small`,
  dividers, `section-center`); statement emphasis underline, align left/center, `size: giant`
  (`statement-claim`, `statement-center`, `statement-giant`); content width text/full; split
  ratio 1:1, 5:7, 7:5, side left/right, bleed; image text bottom/left/right/none; table numbers
  right/left; logos tone mono/color; screen frame browser/phone/laptop/none; `reveal: true` on
  cards, bento, steps, comparison, shift, timeline, equation, proof, screen, columns, matrix,
  ask; agenda,
  steps and timeline `current`; team founders.
- **Charts:** BigNumber, StatRow, Comparison, Progress, Pictogram, Sparkline (part 5); LineChart,
  BarChart, Donut, Waterfall, AreaChart, Slope, Funnel, Table, Scatter, Heatmap (part 6).
- **Diagram components:** Flow, Node, Group, Edge, Journey (`diagram-architecture`); Packet,
  State, Focus (`diagram-events`); Hop (`diagram-hops`); SequenceDiagram, Actor, Message;
  Layers, Layer, Item; Cycle; Tree; Timeline, Milestone; Svg.
- **Slide components:** Code (fences), CodeMove, CodeStep, Terminal, Cmd, Out (part 7); Icon
  (`content-text`), Image (`split-photo-right`), Lottie (`split-lottie`) (part 3); Video,
  Morph (part 8); Live (TSX), AppFrame (part 7); LinkCard, Download, QR, Button (part 12); Step
  and Notes everywhere.
- **TSX slides:** only `demo-live`. **Apps:** only `apps/dispatch-sim` for `demo-appframe`.
