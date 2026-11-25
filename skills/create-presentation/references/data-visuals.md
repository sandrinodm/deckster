# Data visuals: numbers, charts and tables on slides

A data slide has one job: make one quantitative point believable at a glance. An exploratory chart invites the viewer to find patterns; a presentation chart has already found the pattern and shows it. This file gets you from "what am I trying to say" to a form, and then through the details that decide whether the point lands.

Check names, props and limits in the installed `deckster charts --json` or `deckster diagrams --json`. Read the component's entries and examples before writing the slide. Use the chart catalog's `messages` map to match the form to the claim. [Lookbook examples](https://sandrinodm.github.io/deckster/examples/lookbook/)

Evidence labels: see the top of `narrative.md`. Sources: `sources.md`.

## Contents

1. The five-step method
2. Decision guide: message to form
3. Number, table or chart?
4. Titles
5. Highlight one thing, mute the rest
6. Labels and annotation
7. Axes and honesty
8. Color
9. Progressive reveal
10. Common mistakes
11. Data-slide checklist
12. Worked examples
13. Putting a figure on a slide: layouts and the chart API
14. What lint tells you about a chart
15. Diagrams: when a picture of the mechanism beats bullets

## 1. The five-step method

1. **Write the takeaway as a sentence.** "Support tickets fell 40% after the redesign." This becomes the slide title. If you cannot write it, you are not ready to choose a form.
2. **Name the relationship** the sentence expresses: a single number, a comparison, a change over time, a share of a whole, a distribution, a correlation, a flow, a ranking, a deviation from target.
3. **Pick the simplest form** that shows that relationship (section 2). Simplest often means not a chart.
4. **Cut the data to what the point needs.** The slide shows the evidence for one claim, not the dataset. Aggregate the long tail into "other", drop series that are not part of the comparison, move the full table to the appendix.
5. **Direct the eye:** highlight the data that carries the point, mute the rest, label directly, annotate the "why".

## 2. Decision guide: message to form

| What you are saying (the catalog's `messages` name)      | Use                                                                                                   | Avoid                                         | Notes                                                                                       |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **One number matters** (single number)                   | `<BigNumber>` with `label` and `from` or `context`                                                    | A chart with one or two bars                  | A number needs its comparison: versus what, over what period                                |
| **Two to four headline numbers** (single number)         | `<StatRow>` (at most four stats), or the `stats` layout for plain figures (two to four)                                                  | A table, a dashboard                          | Mark the one the point rests on (`highlight: true`); more than four is a `<Table>`          |
| **Before versus after, A versus B** (change between two points) | `<Comparison>`                                                                                 | A line with two points, two bars              | The delta is the message; the component writes it                                           |
| **Compare categories** (comparison)                      | `<BarChart>`, horizontal when labels are long, `sort`                                                 | Donut, radar, 3D                              | Sort unless the categories have a natural order                                             |
| **Ranking** (ranking)                                    | `<BarChart sort highlight="…">`                                                                       | Unsorted bars, a table                        |                                                                                             |
| **Change over time** (trend)                             | `<LineChart>`; `<BarChart>` columns for a few discrete periods; `<AreaChart>` when the volume matters | A donut per period                            | Time on the x-axis, left to right; one highlighted line among muted context lines           |
| **Change between two points for several items**          | `<Slope>`                                                                                             | Grouped bars                                  | Shows who rose and who fell at a glance                                                     |
| **Part of a whole, one or two parts matter** (part-to-whole) | `<BigNumber>` ("62% of…"), `<Donut>` with one slice highlighted, `<Progress>`                     | A donut with many slices                      | People judge "about a quarter" and "more than half" well from a donut, not fine differences |
| **Part of a whole, many parts**                          | `<BarChart sort>` (bars need not sum visually)                                                        | A donut over five slices (lint warns)         | Combine the tail into "Other"                                                               |
| **Composition changing over time**                       | `<AreaChart stacked>` or `<BarChart stacked>`, the series of interest at the baseline                 | Many stacked series                           | Only the bottom series and the total read well                                              |
| **How a total builds up or breaks down** (flow)          | `<Waterfall>`                                                                                         | A stacked bar with many colors                | Bridges: last year to this year, cost today to cost after                                   |
| **A number built from its parts**                        | The `equation` layout: two to four terms, the operators, the result                                   | Nested circles; `stats` that do not add up    | Market size as customers × price, unit economics; each term carries its source             |
| **Positions on two trade-offs**                          | The `matrix` layout, the subject marked `us`                                                          | A `<Scatter>` with invented coordinates       | You and the competition. Positions are judgement and show no values; use `<Scatter>` only when both axes were measured |
| **A named customer's before and after**                  | The `proof` layout: their quote beside one to three metrics with `from`                              | A `quote` slide, then a `stats` slide          | The strongest result first, with the timeframe                                              |
| **Drop-off through stages** (flow)                       | `<Funnel>`                                                                                            | Donut                                         | The share that carries on between stages is usually the point                               |
| **Distribution, spread, outliers** (distribution)        | `<Scatter>` of the items, `<Heatmap>` for two dimensions, or `<BarChart>` over ordered bins           | An average alone                              | Averages hide the shape; for lay audiences a few example values                             |
| **Relationship between two measures** (correlation)      | `<Scatter trend>` with the notable points labeled                                                     | Dual-axis lines                               |                                                                                             |
| **Pattern across two dimensions**                        | `<Heatmap>` with the cell that matters highlighted                                                    | 3D surface                                    |                                                                                             |
| **Retention at the same age since signup**               | `<RetentionCohorts>`                                                                                 | Comparing cohorts in their latest month      | Include starting counts and leave unobserved months blank                                   |
| **Profit from both sales and margin**                     | `<ProfitPool>`                                                                                       | Area alone without values or units           | Revenue sets width, contribution margin sets height and profit sets the signed area         |
| **One entity changes position against peers**             | `<MarketMovement>`                                                                                   | Rescaling the axes at each date              | Keep the two axes fixed and label the selected entity's first and last observations          |
| **Values against a threshold** (a target, break-even, an SLA) | `<BarChart>` or `<LineChart>` with a `reference` annotation at the threshold, the item on the wrong side highlighted | Plain numbers that leave the threshold to a caption | The line is the message: show it                                              |
| **Progress to a goal**                                   | `<Progress target>` or `<BigNumber>` with the target as context                                       | Gauge, speedometer                            |                                                                                             |
| **A proportion that should feel human**                  | `<Pictogram>` ("3 in 10"; `total` is at most 100 units, so reduce 340 of 1,000 to about 1 in 3), on the full-width `chart` layout with no `<Aside>` and a label of about four words                                         | Decimal percentages                           | Icon arrays help low-numeracy audiences grasp risk and proportion; in a narrow column the grid gets cramped |
| **Exact values must be read or looked up** (exact values) | `<Table>` with the row, column or cell highlighted                                                   | A chart with value labels on everything       | See section 3                                                                               |
| **Trend as context beside a number**                     | `spark` on a stat, `trend` on a `<BigNumber>`, or `<Sparkline>` in a sentence                         | A full chart                                  |                                                                                             |
| **Movement through a system, steps in a process**        | A diagram (section 15)                                                                                | A chart                                       | It is not quantitative data                                                                 |

If a form you want has no component (a box plot, a Sankey, small multiples), say the message with the nearest listed one or with numbers, and mention the gap in the handoff. Do not hand-draw a chart in SVG: it will not take the brand's data colors, will not export as a native chart, and lint cannot check it.

Why these choices: people judge quantities most accurately from position along a common scale, then length, then angle and slope, then area, with color intensity last **[evidence]** (Cleveland and McGill 1984; replicated by Heer and Bostock 2010). Bars and dots use position and length; pies use angle and area; bubbles and heatmaps use area and color. Use the accurate encodings for the comparison that matters most. Accuracy of reading is not the only goal on a slide, though, which is why a pie or a pictogram is sometimes right for a simple part-to-whole message.

## 3. Number, table or chart?

- **A big number wins** when the message is one value or one change. A chart with a single bar, or two bars the audience must subtract in their heads, is slower than "38% lower". If the title can already contain the number, ask what a chart would add; if the answer is "nothing", use the number. Make the title and the hero figure agree: if the slide shows "3 days", the title says 3 days (and what it was before), not a third, derived number. Keep that slide nearly empty: the number, a label of about six words, one context line (versus what, over what period). Do not repeat the same figures in a footnote; sample sizes and definitions fit in one short caption or in the notes.
- **A table wins** when the audience needs exact values, will look up their own row, or must compare across several different units (price, seats, uptime) that cannot share an axis **[practice; Few, Gelman]**. On a slide keep it small (about five rows by four columns), right-align numbers with consistent decimals, and emphasize the row or cell that carries the point. The full table goes in the appendix or a handout.
- **A chart wins** when the message is a pattern across many values: a trend, a gap, a ranking, an outlier, a shape.

A quick test: say the takeaway aloud. If it is about a number, show the number. If it is about a shape ("rising", "concentrated", "diverging", "far ahead"), show a chart.

## 4. Titles

The title states the takeaway; the chart proves it. "Tickets fell 40% after the redesign", not "Support tickets by month".

- Viewers recall a chart's title more than any other element, and titles that state the message improve recall of that message **[evidence]** (Borkin et al. 2016).
- The message people remember follows the title's framing, often without their noticing any slant **[some evidence]** (Kong et al. 2018). This is why the title must be something the data really supports: an overclaiming title misleads effectively.
- Presenters assume the audience sees the pattern they see. They do not: people who know the story rate "their" pattern as obvious to others when it is not **[some evidence]** (Xiong et al. 2019). State it.
- Put the descriptive label (measure, unit, period, source) in a small subtitle or caption so the title is free to make the claim.
- Put the number in the title when there is one: "caused 51% of the ARR we lost" is stronger and more checkable than "caused half".
- Name the measure precisely. Churned ARR is not churned customers, median is not average, a share of revenue is not a share of accounts. If the user's phrasing and the data's measure differ ("the main reason we lose customers" over ARR data), title the slide with what the data measures and tell the user about the gap.

## 5. Highlight one thing, mute the rest

Give the data that carries the point the accent color and render everything else in a muted neutral. One highlight per chart.

- In an experiment comparing cluttered, decluttered and decluttered-plus-focused versions of the same charts, adding focus (a message headline, one highlight color, a short annotation) strongly shaped which pattern viewers remembered and raised clarity ratings; decluttering alone mainly improved how professional the chart looked **[some evidence]** (Ajani et al. 2021). Focus is the part that changes what the audience takes away.
- The same study found some viewers trust a heavily focused chart slightly less because it appears to argue. With skeptical or expert audiences keep the context visible (muted, not deleted) and cite the source.
- Every chart takes `highlight` for exactly this: a series name, a category (or `max`, `min`, `first`, `last`), several, or an object for a single point or a range of categories. Everything else drops to the brand's context color. A chart with several series or many categories and no highlight is a lint warning (`chart-no-highlight`), and usually a sign the takeaway has not been decided. On a line chart `highlight={{ range: [first, last] }}` colors the segments between those points and leaves everything after the last muted, so end the range where the title's claim ends. In a `<Table>` the highlight is a row, column or cell; in a `<StatRow>` it is `highlight: true` on one stat.

## 6. Labels and annotation

- **Label directly.** Put series names at the end of lines and values on or beside bars instead of using a legend the eye must travel to and decode **[evidence]** (spatial contiguity; Franconeri et al. 2021 recommend integrating text with the graphic). The charts do this by default and show a legend only when they cannot; leave `legend` alone unless lint says a legend is avoidable.
- **Label values selectively.** Label the highlighted values and perhaps the endpoints. Labeling every bar turns the chart back into a table. If you do label every value, drop the axis: both is redundant. The `labels` prop does this (`auto` by default; `highlight`, `ends`, `all`, `none`).
- **Annotate the why** with `annotations`: a `callout` on the event that explains the change ("Pricing change, March"), a `reference` line for the target or the average, a `range` shading the period under discussion, a `bracket` that writes the change between two points (the catalog lists them as `Annotation.callout`, `.reference`, `.range`, `.bracket` under `types`). One or two per chart; each is a few words.
- **Always state units**: `unit` or `format` on the values, and the measure and period in `caption` (lint warns on `chart-missing-unit`). Format for humans: `$4.2M`, not `4213877.12`; one or two significant figures unless precision is the point; signs and color on deltas; consistent decimals.
- **State the denominator and period** somewhere on the slide: n and timeframe in `caption`, the source in `source` or the layout's `<Footnote>`.
- Minimal non-data ink: light gridlines or none, no borders, no backgrounds, no 3D, no shadows. Note the evidence here is weaker than its reputation: memorable embellishment does not necessarily hurt comprehension and can aid recall (Bateman et al. 2010). The reason to remove clutter on slides is that the audience has seconds, not that decoration is inherently harmful. A relevant pictogram is fine; gridlines competing with the data are not.

## 7. Axes and honesty

- **Bars start at zero.** Bar length encodes the value, so a truncated bar axis exaggerates differences, and the exaggeration persists even when viewers are told the axis is truncated **[evidence]** (Correll et al. 2020). A `<BarChart>` with `min` above zero is a lint error (`chart-truncated-axis`) unless it sets `truncate`, which draws an axis break and a note; reach for a `<LineChart>` or a `<Comparison>` before you reach for `truncate`.
- **Lines and dots may use a non-zero baseline** when the meaningful variation is small relative to the values, because they encode position, not length. Choose a range that makes meaningful differences visible and trivial ones look trivial. A `<LineChart>` hugs the data by default and says where its axis starts; `zero` starts it at zero. Starting at zero is not automatically more honest: it can flatten a change that matters **[evidence]** (Franconeri et al. 2021).
- **Avoid dual axes.** The two scales are arbitrary, so the crossing points and relative slopes are artifacts the viewer will read as meaning. Use two aligned charts, index both series to a common start, or plot one against the other. (The experimental evidence on dual axes is thin; the logic is sound.)
- **Keep scales consistent** across charts the audience will compare, and across small multiples.
- **Consistent time intervals** on the x-axis; do not skip periods silently.
- **Show uncertainty when it changes the conclusion.** For lay audiences, error bars are often misread; prefer a range in words ("between 30 and 45%") or a few example outcomes **[some evidence]**.
- **Do not cherry-pick the window.** If the trend reverses just outside the chosen period, the chart is misleading no matter how well it is drawn.
- **Percent versus percentage points, relative versus absolute.** "Conversion rose from 2% to 3%" is one point and 50 percent; say which, and give the base.
- **Small samples:** say n. A percentage of 12 people should not be dressed as a trend.

## 8. Color

- **Color carries meaning, not decoration.** Default everything to a neutral and spend color on the highlight.
- **The brand's data palettes do the coloring** (categorical for series, sequential and diverging for heatmaps, a context color for everything a highlight mutes; see `data` in `deckster brand <name> --json`). Charts take no color props, so there is nothing to hard-code: you choose what is highlighted and the brand decides how it looks.
- **Few categories.** Past five or six colors, viewers cannot hold the mapping, and lint warns when a chart needs more colors than the brand's categorical palette has (`chart-too-many-series`). Reduce series, group into "Other", or highlight one and let the rest go to context.
- **Color-blind safety.** Roughly 8% of men and 0.5% of women have a color vision deficiency, mostly red-green. Never rely on red versus green alone; pair color with position, direct labels, shape or a sign. Charts pair their good and bad tones with a sign or an arrow, but an encoding you invent ("the green ones are ours") is still your problem.
- **Keep meaning stable.** The same entity has the same color on every slide. Do not reuse the highlight color for something else nearby.
- **Follow convention** where one exists (darker or higher means more; red means bad in most business contexts) and state it where it might not be shared.

## 9. Progressive reveal

Complex data slides overload when shown all at once. Build them **[evidence for segmenting; expert audiences need less]**:

1. Show the axes and say what they are.
2. Add the baseline or context series, muted.
3. Add the highlighted series or point, and make the claim.
4. Add the annotation that explains why.

Charts build with the deck's steps: `at` on a series in `y` (`y={['2025', { field: '2026', at: 1 }]}`), on `highlight` (`{ series: '2026', at: 2 }`, or `{ category: 'EMEA', at: 1 }`) and on each annotation; `reveal="series"` or `"categories"` builds mark by mark from step 1, and `reveal={{ by: 'categories', from: 2 }}` starts later (`from` is 1 or more; the catalog lists it as `types.RevealOption`). The presenter drives each step. The last step must be a complete, self-explanatory chart, since exports and static mode show only the end state; check the order with `deckster shot <deck> <slide> --steps`. Do not animate for its own sake: an animation should correspond to something the presenter is saying at that moment.

Which build fits which chart:

- **A comparison of a few bars** (us against the average, before against after): `reveal="categories"` with the context category first in the data, so the bar the title is about rises last. Step 0 shows the empty axes and the caption, which is when you say what is measured.
- **A trend with a turning point:** the line from the start, then `highlight` with a `range` and a `callout` at the turning point on step 1. Before its step the line shows its own colour, so the highlight arriving is itself the signal.
- **A funnel or a waterfall:** `reveal="categories"` brings a funnel in one stage per step, and a waterfall one change per step between totals that show from the start (`reveal="series"` brings all the changes at once). When the build would be more clicks than the point is worth, show the whole figure on arrival, then `highlight={{ category: …, at: 1 }}` on the stage or bar the title is about; the `<Aside>` that explains why can follow in a `<Step>` inside it.
- **A big number, a `<StatRow>`, a `<Comparison>` or `<Progress>`:** they count up on arrival, which is the build. Add a step only for the context that comes after the number (an aside, a second figure).
- **A table:** whole. Exact values are read, not built.

## 10. Common mistakes

- A topic title ("Revenue by region") over a chart that leaves the audience to find the point.
- Pasting the analysis chart or spreadsheet export instead of redrawing for the one message.
- Charting one or two numbers.
- Everything in different bright colors, so nothing stands out.
- A legend far from the data, or a legend for a single series.
- Pie or donut with many slices, or two pies side by side for comparison.
- Truncated bar axes; dual axes; inconsistent scales between adjacent charts.
- Too many series on a line chart ("spaghetti"). Highlight one and grey the rest, or use small multiples.
- Unsorted bars.
- Missing units, period, or source.
- False precision (`37.4821%`) and unformatted large numbers.
- Averages that hide a split or an outlier that is the real story.
- 3D, gradients, shadows, heavy gridlines.
- Two charts on a slide making two different points. Split them.
- Data the presenter cannot source when asked.
- Inventing or "rounding up" numbers. Use only what was supplied; where a value is missing write `[NEEDS: ...]`.

## 11. Data-slide checklist

Run this on every slide with numbers.

- [ ] The title is a sentence stating the takeaway, and the data supports it as worded.
- [ ] The form matches the message (section 2), and a number or table was considered before a chart.
- [ ] Only the data needed for this point is shown; the rest is cut, grouped or in the appendix.
- [ ] One element is highlighted; everything else is muted.
- [ ] Series and key values are labeled directly; no legend unless unavoidable.
- [ ] Units and period are on the slide; n is stated where it matters. The source is on the slide if known; if unknown it is a `[NEEDS]` in the notes and handoff, not a bracket in the caption.
- [ ] The title's noun matches the measure (ARR versus customers, median versus average).
- [ ] Numbers are formatted for reading and precision is no higher than the data justifies.
- [ ] Bars start at zero; any non-zero baseline on a line chart is deliberate and labeled; no dual axes.
- [ ] No meaning depends on red versus green alone; nothing is hand-colored.
- [ ] Categories are sorted meaningfully and number six or fewer per color encoding.
- [ ] If built in steps, the final state stands alone.
- [ ] Every value came from the user's material; gaps are marked `[NEEDS: ...]`.
- [ ] The notes say where to look, what it means, and the source and caveats under "If asked".
- [ ] `deckster lint` reports no chart finding for the slide.
- [ ] Five-second test on the screenshot: someone seeing the rendered slide cold could state the point.

## 12. Worked examples

**One number.** Brief says: "Onboarding took 14 days on average before the new flow and 3 days after."

- Takeaway and title: "New customers are live in 3 days instead of 14."
- Relationship: before versus after, two values. A chart adds nothing.
- Form: `<BigNumber value={3} unit="days" label="from signup to live" from={14} better="down" relative={false} />` on the `chart` layout, or a `<Comparison>`. Not a two-bar chart.
- Notes: period, sample, what "live" means.

**Trend with a cause.** Brief includes monthly ticket counts for 12 months and says a redesign shipped in June.

- Takeaway: "Tickets fell 40% in the three months after the June redesign."
- Form: `<LineChart>` with last year as a muted context line, this year highlighted and revealed at step 1, a `callout` annotation at June at step 2 and a `bracket` from June to September at step 3 that writes the change. `caption="Support tickets per month"`. Check that the 40% is computed from the supplied data and say from which months.

**Ranking with one of interest.** Brief includes a table of eight regions with revenue and growth.

- If the point is "EMEA is now our second-largest region": `<BarChart data={regions} x="region" y="revenue" format="currency" sort highlight="EMEA" />`.
- If the point is "EMEA is growing fastest": sort and chart growth instead. Same table, different message, different chart. The table itself goes to the appendix.

**Exact values across mixed units.** Brief includes three pricing plans with price, seats, storage and support level.

- Form: `<Table>` with `highlight={{ row: 'Team' }}` on the recommended plan and an `<Aside>` that states the recommendation. Mixed units cannot share an axis.

**A cost case.** Brief says the current setup costs $1.9M a year, the alternative $1.4M, with a one-off $350k.

- If the point is the saving: `<Comparison>` of the two run rates (the component writes the difference), or a `<BigNumber>` of the saving with the two figures as context.
- If the point is how the saving survives the one-off cost: `<Waterfall>` from today's cost through the one-off and the saving to the first-year cost. Compute every bar from the supplied figures and say in the notes how.
- Do not draw a multi-year line unless the user gave you the years: a projection you extrapolated is invented data. Offer it as a `[NEEDS]`.
- If the audience will ask "what if it runs late or over?", answer with a small `<Table>` of scenarios (on plan, late, late and over budget) with the break-even for each and the pessimistic row highlighted. State the assumptions in the `<Footnote>` and the arithmetic in the notes or on a backup slide.

**Retention cohorts.** Each row identifies the signup cohort, elapsed age, starting population
and observed retention in percentage points. Leave future ages absent or give them a null rate.
Read one mature row left to right on the first click. On the next click, read down one age column
so the comparison holds the time since signup constant.

```mdx
<RetentionCohorts data={retention} sizeLabel="Shops" focus={{ cohort: 'April', age: 3, from: 1 }} />
```

**Profit pool.** Use positive revenue in a shared currency and scale. Pass contribution margins
in percentage points so `45` means 45%. Show the size of the sales segments first, then their
margin heights and finally the highest contributor. Name the profit in money to support the area
comparison. Include negative margins when segments made a loss.

```mdx
<ProfitPool data={segments} format="currency" highlight="Pharmacies" buildFrom={1} />
```

**Market movement.** Supply a row for each measured entity and `YYYY-MM-DD` observation date.
Choose metrics measured the same way across dates and peers. Advance the observation date, keep
the axes fixed and connect the selected entity's measured positions. Direct labels at both ends
keep the final trail interpretable on a still slide.

```mdx
<MarketMovement
  data={market}
  x="price"
  y="onTime"
  xLabel="Price per drop"
  yLabel="On-time delivery"
  xFormat="currency"
  format="percent"
  highlight="Wrenhaul"
  buildFrom={1}
/>
```

## 13. Putting a figure on a slide: layouts and the chart API

Read the layout catalog for the current list. At the time of writing the choices are:

- **`chart` layout:** an assertion title, then one figure filling the slide: any chart, a `<BigNumber>`, a `<StatRow>`, a `<Table>`. `<Aside>` holds the "so what" in a sentence or a key number; `<Footnote>` the source and definitions. This is the default home for a data slide.
- **`stats` layout:** two to four plain numbers from the `stats:` frontmatter, when the point is the size of things and no chart is needed.
- **`equation` layout:** two to four figures joined by operators and the result they come to, when the point is how a number is built (a bottom-up market, a business model).
- **`proof` layout:** one to three before-and-after metrics beside a named customer's words, when the numbers are a customer's result.
- **`split` layout:** a short paragraph or a few bullets beside a figure in `<Media>`, when the figure needs words next to it. Its title column is narrow, so the title must be short.
- **`content` layout with `width: full`:** a figure under a sentence of text.

One figure per slide. Two charts making two points are two slides.

Write numbers in text the way the charts write them. Charts format values in the brand's number style (compact: `$350K`, `$1.4M`); a title that says `$350k` over a chart that says `$350K` looks careless. Shoot a chart first and copy its style into titles, bullets and notes.

What every chart shares (the catalog's `shared` and `insight` sections have the detail):

| Prop          | What it is for                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| `data`        | Plain rows inline, an imported JSON or CSV file from the deck folder, or a dataset named in the slide's `data:` frontmatter. Pass numbers, not formatted text. A CSV whose header names a column twice, or with a line that has more or fewer fields than the header, is a build error: fix the file |
| `x`, `y`      | The category field and the value field or fields (one series each)                                          |
| `highlight`   | What the chart is about; everything else is muted                                                           |
| `annotations` | `callout`, `reference`, `range`, `bracket`                                                                  |
| `caption`     | The measure, unit and period, so the slide title is free to state the takeaway                              |
| `source`      | Where the data comes from                                                                                   |
| `format`, `unit` | How values are written: `currency`, `percent`, `compact`, a delta; percent values are already in percent (34 is 34%) |
| `labels`, `legend` | Direct labels and the legend; the defaults are usually right                                           |
| `at`          | The step that reveals the figure, a series, the highlight or an annotation                                  |

Each chart also documents `nulls` (how it draws a missing value: leave a gap rather than inventing a point) and `limits` (the numbers lint holds it to). Props are checked: a name the chart does not list fails the build and names the closest one, so read the entry rather than guessing.

After writing a data slide, shoot it and look. The questions that matter: is the highlighted element unmistakable, do labels collide, is the caption there, and can you state the point in five seconds from the picture alone?

## 14. What lint tells you about a chart

`deckster lint` checks the measurable half of this file. Each finding names its fix; this is what each usually means about the thinking.

| Rule                        | What it usually means                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `chart-topic-title`         | The title names the data ("Revenue by region"). Write what the data shows                               |
| `chart-no-highlight`        | The takeaway is undecided, or the chart is exploratory. Decide the point and set `highlight`            |
| `chart-too-many-series`     | More series than the brand has colors. Cut to what the point needs, group, or highlight one             |
| `chart-too-many-categories` | The dataset, not the evidence. Show the top few and "Other", or move the full table to an appendix      |
| `chart-pie-slices`          | A donut over five slices. Use sorted bars                                                               |
| `chart-truncated-axis`      | A bar axis above zero exaggerates. Use a line, a `<Comparison>`, or `truncate` when the break is honest |
| `chart-missing-unit`        | Nobody can tell what is measured. Add `unit` or `format`, and a `caption`                               |
| `chart-legend-avoidable`    | Direct labels would do. Drop `legend`                                                                   |
| `chart-funnel-grows`        | The stages are not a funnel (a later stage is larger). Use bars, or check the data                      |
| `chart-empty`               | Field names do not match the rows, or a line has one point. Check `x` and `y`                           |

Lint cannot tell whether the title's claim is true of the data, whether the measure in the title is the measure in the chart, or whether a number was invented. Those stay with you (section 11).

## 15. Diagrams: when a picture of the mechanism beats bullets

A list of steps or components makes the audience build the picture in their heads while they listen. When the claim is about how things connect, in what order, or who owns what, draw it. Use bullets when the items are parallel and unordered (three requirements, four benefits); use a diagram when the relationships between the items are the point.

| The claim is about                                             | Use (see `deckster diagrams --json`)                                  |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| A path through a system: a request, an order, a ticket         | `<Flow>` with a `<Journey>` that walks it one hop per step             |
| How parts connect: an architecture, a pipeline, a hand-off     | `<Flow>` with `<Node>`s on a grid, `<Edge>`s, `<Group>`s for boundaries |
| Rules that route a case to an outcome: a policy, a triage      | `<Tree>` (a decision at the root, outcomes as leaves), or a `<Flow>` with `decision` nodes when branches rejoin |
| Who calls whom, in order: a protocol, a handshake, an approval | `<SequenceDiagram>`                                                    |
| A plan in time, and where we are in it                         | `<Timeline>` with the `current` milestone marked                       |
| A loop that repeats: a feedback cycle, an operating rhythm     | `<Cycle steps>`                                                        |
| A stack and its owners                                         | `<Layers>`                                                             |
| A drawing someone made: a floor plan, a product sketch         | `<Svg>`                                                                |

How to make one that works:

- **Title the mechanism, not the picture.** "Every refund over $200 passes a team lead before Finance sees it", not "Refund flow". Use the `diagram` layout: a full-width assertion title over one diagram, with an optional `<Aside>` for the "so what".
- **Draw the claim, not the inventory.** Show the path or structure the title asserts and leave out what is not on it. Five to seven nodes is comfortable; lint warns past twelve nodes or sixteen edges shown at once (`diagram-too-dense`), and a diagram with more than 60 nodes or 120 edges does not build at all (the numbers are `limits` in `deckster diagrams --json`; read them there). For a bigger system, show an overview, then one region per slide.
- **Place a flow on the grid.** Give its nodes `col` and `row` so neighbors, stages and reading order are clear. Check the catalog's grid limits. Since v0.8.0 the [diagram design controls](#diagram-design-controls) also set preferred node widths and minimum heights.
- **Make it big enough.** A diagram fills its region, but three or four small nodes in one row leave a thin strip across a mostly empty slide. If the mechanism really is that small, it may be a sentence, or the diagram needs the part that makes it interesting (the branch, the exception path, the return trip) on a second row.
- **Keep words short.** A node title of two or three words, an edge label of one or two ("HTTPS", "approves"). Long text is broken or cut and lint reports it (`diagram-long-word`). Detail goes in the notes or the `<Aside>`.
- **Mark the few nodes that matter with a card.** A node, actor, item or layer takes `card`, a node style the brand defines. A diagram-wide `card` supplies the default for its nodes, actors or layer items. A layer band takes its own explicit `card`. Use one card to set apart the two or three nodes the title is about (the new service, the step that fails, the system you own) and leave the rest on the default. A card on every node, or a different card per node, is decoration and hides the point. Use the standard names (`default`, `outline`, `solid`, `tint`, `raised`): every brand has them, so the deck keeps working when it is rendered in another brand. Use a brand's own card (`deckster brand <name>` lists them) only when the deck belongs to that brand. A name the brand does not have falls back to the next card and lint warns (`diagram-card-missing`). `cards` in `deckster diagrams --json` says how a node picks its card; states such as `highlighted` and `error` still win over it.
- **Stage it.** Reveal in the order you will explain (`at` on nodes, groups and edges; `at` on each `<Message>` of a `<SequenceDiagram>`, one message per step; `steps` on a `<Cycle>`, whose step 0 is the whole loop and step 1 the move to the second stage), and let one thing carry the point at each step: a `<Journey>` for something travelling hop by hop (with `focus` to dim what is off the path; check the last step, because a journey that ends focused leaves the final picture dimmed, and the final picture is what exports show), a `<State>` to turn a node into an error or a success at a step, a `<Focus>` to dim everything but a region, a `<Packet>` for traffic on an edge. One accent at a time; everything else stays quiet.
- **Walk one concrete case.** "A $450 refund on day 12" travelling through the routing rules teaches more than the rules shown all at once. Put the case in the notes and step through it.
- **The last step stands alone.** Static mode and exports show the final state, so it must read without the animation. Shoot with `--steps` and check each step shows exactly what the presenter is saying at that moment.
- **Look at it.** Lint catches overlaps and density; only the screenshot shows crossing edges, a lopsided layout or a path the eye cannot follow. Rearrange cells until the main path runs straight.

In the notes, write the walk: what to say at each step, in order, with `[click]` cues that match the step count. A diagram that the notes do not walk (one structure shown for orientation) can stay whole.

### Keep connectors attached in PowerPoint

Use `<Flow>` and connect named nodes with `<Edge>` if the recipient needs to move boxes in PowerPoint and keep the links attached. Prefer straight routes or simple orthogonal routes that PowerPoint can reproduce as connectors. Curved or complex routes can export as freeform lines, and imported `<Svg>` paths carry no node attachment information.

Run `deckster export <deck> --pptx --dry-run` in native or hybrid mode and review any reported route simplifications. Such a finding can include the count of connectors “glued at both ends”. Open the exported file in PowerPoint and move each connected node in turn to check that the connector follows it. [PowerPoint export](https://sandrinodm.github.io/deckster/export-and-publish/powerpoint/)

### Diagram design controls

The controls below need v0.8.0 or newer. In `deckster diagrams --json`, check each component's `props` and its `shared` list. For example, Flow lists `align` and Edge lists `lineStyle` under `shared`, and Node lists `width` under `props`. Earlier releases support the grid, cards and kind or Iconify icons only.

| Aim | Where to set it |
| --- | --- |
| Place a compact drawing left, center or right within its region | `align` on `Flow`, `Cycle`, `Tree`, `SequenceDiagram`, `Layers` or `Timeline`. The diagram's grid and direction still place its parts. |
| Make a box wide enough for its label or give it a minimum height | `width` and `height` on `Node` or `Actor`, in canvas pixels. Layout can shrink the preferred width and increase the minimum height to fit the text. |
| Distinguish one connector or boundary | `strokeWidth` and `lineStyle` (`solid`, `dashed`, `dotted`) on a flow or cycle `Edge`, a flow `Group`, or a sequence `Message`. Zero hides the stroke. A flow edge flagged `dashed` or `async`, a sequence message flagged `reply` or `async`, and an error edge still draw dashed. Use a short label so the meaning survives without the line pattern. |
| Use a product or system image as an icon | On a `Node`, `Actor`, `Item` or `Milestone`, use a bundled asset such as `icon="../assets/parcel-mark.svg"` in MDX, or pass a `?url` import in MDX or TSX. An HTTPS image URL must be reachable when presenting and exporting. Prefer a bundled file for offline use. Supply a title with the icon's meaning. |

Use a slide prop for one drawing and the brand for defaults across slides. Tree branches and the timeline track take their stroke settings from the brand. The brand's `diagram.nodes.subtitle` styles node subtitles and `diagram.notes` styles timeline milestone detail. Card and icon tile borders also belong to the brand. Run `deckster brand check <name>` and inspect the resolved defaults with `deckster brand <name> --json` after a brand change. Use the `brand-import` skill if brand work is in scope. [Diagram design guide](https://github.com/sandrinodm/deckster/blob/eb1bc3cf9f0528bac13090e193abc671fe7c4ab6/src/content/docs/data-and-diagrams/diagram-design.mdx) · [Dispatch example](https://github.com/sandrinodm/deckster/blob/be8cc95edb8db522f084f7f8b3a89ef46e9efd5b/decks/diagrams-demo/slides/dispatch-handoff.mdx)

After using a control, run `deckster lint` and inspect every `deckster shot --steps` frame. For PowerPoint, check the output as well. In native and hybrid modes the exporter draws diagram shapes, connectors and icon borders as editable elements, and embeds image icons as pictures when it can load and embed them. SVG artwork supplied to `<Svg>` keeps the placement and styling authored in the file.
