# Data visualisation: chart style, numbers and data palettes

The framework ships brand-themed charts and number components (`<BarChart>`, `<LineChart>`, `<Donut>`, `<BigNumber>`, `<StatRow>`, `<Table>`...). Every chart takes a `highlight` and mutes the rest, prefers direct labels to legends, and takes its colours from the brand's **data palettes**: categorical, sequential and diverging, validated for contrast and colour-vision safety by the brand compiler. A brand import therefore has to deliver two things:

1. The **style** the source uses for charts, tables and big numbers, when it has any.
2. **Data palettes** that pass the checks, whether or not the source has charts.

## Contents

- [Reading the source's style](#reading-the-sources-style)
- [What to record](#what-to-record)
- [Deriving the palettes](#deriving-the-palettes)
- [Checks](#checks)
- [When the source's own chart colours fail](#when-the-sources-own-chart-colours-fail)
- [Specimen comparison](#specimen-comparison)

## Reading the source's style

`extraction.json` `dataviz` and the `CHARTS`, `BIG NUMBERS` and `NUMBER FORMAT` lines of the analysis digest hold what was measured. How much to trust it depends on the origin:

| Origin | Trust | Still check by eye |
|---|---|---|
| `ooxml-chart` (native PowerPoint chart) | Series colours and order, gridlines, axes, legend, number formats are exact. | Whether the chart was *designed* or left on defaults (see below). |
| `svg` (website) | Fills, strokes, dash patterns and label styles are exact. Kind is a guess. | Which fill is the series and which is decoration. |
| `vector-heuristic` (PDF) | Colours and stroke widths exact; kind, series and label roles are guesses with a confidence. | Everything structural. Dashes may be lost. |
| `canvas`, images | Palette of the element only. | Everything. |

**Designed or default?** A native chart whose series are `color_source: "theme-order:accentN"`, with a legend on the right, a grey border and gridlines at default weight, was never styled. It tells you the theme's accent order and nothing about taste. Record that the source has no deliberate chart style and derive one from the rest of the brand. Explicit series colours, removed chart junk, direct labels or a highlighted bar are signs of intent: follow them closely.

**Charts pasted as images** (common in Slides exports and consulting decks) are invisible to the extractor. Find them on the contact sheet, read their colours from that page's `palette`, and mark the result as read from pixels.

## What to record

Record it in `brand-draft.json` under `dataviz` (fields in `brand-draft-format.md`). The emitter turns the parts the brand schema has a place for into the brand's `charts` section: gridlines and axis (shown or not, colour as the nearest role, weight as the nearest stroke, solid, dashed or dotted), label colour, number format (locale, compact notation, currency, fraction digits, signed deltas), the colour of big numbers, and how a table marks its emphasised row (fill, text or bar), its rule weight and zebra banding. Mark geometry (bar radius, line width, markers) belongs to the chart components; record it anyway so a strong mismatch can go on the review list. Record:

- **Series colours in order**, and whether the source highlights one series against a neutral. If a neutral grey or beige fills the non-highlighted bars, that neutral is the source's **context colour**: reuse it.
- **Gridlines**: shown or not, colour, width in canvas pixels, solid or dashed, horizontal only or both.
- **Axes**: line shown or hidden, tick marks, label colour and type style (often the mono or caption style in the muted colour), axis titles used or not.
- **Labels**: direct labels on marks or a legend, legend position if any, label weight, where bar values sit (outside end, inside), whether line series are labelled at their ends.
- **Mark shape**: bar corner radius, bar gap, line width, markers (none, end only, all points), area opacity.
- **Number formatting**: decimal places, decimal and thousands separators, compact notation (`11k`, `1.2bn`, `412m`), unit placement and whether a space precedes it (`4.1 min` but `62%`), currency position, how deltas are written (`+12%`, `▲ 12%`, colour for up and down). OOXML charts give format codes such as `0.0"x"` and `#,##0"m"`; translate them into those terms.
- **Big numbers**: family, size and weight of the figure, colour (one accent for all, or a different colour per stat), the label's style and position, whether stats sit in cards, alignment.
- **Tables**: header fill and text, rule colour and weight, horizontal rules only or a full grid, zebra banding, how the emphasised row or cell is marked, numeric alignment.

Give each a provenance entry. Where the source is silent, choose the quiet default (hairline horizontal gridlines in the border colour, no axis line, direct labels, tabular numerals) and mark it as chosen.

## Deriving the palettes

```bash
uv run $SKILL_DIR/scripts/brand_tools.py data-palette \
  --bg '#F7F4EE' --fg '#0F1B2D' \
  --colors '#FF5A36,#7A2CF5,#12B5A5' \
  --source-series '#FF5A36,#7A2CF5,#12B5A5' \
  --inverse-bg '#0F1B2D' --n 6
```

`--colors` are the brand's chromatic colours with the lead (usually the accent) first. `--source-series` are the chromatic series colours seen in the source's charts, in their order (leave the neutral context colour out and set it in the draft by hand); they are kept first and in that order (colours that fail 3:1 are adjusted in place). The tool returns a proposal with its checks. Treat it as a starting point and apply judgement with the rules below.

### Categorical

For series that have no order (products, regions, teams).

- **Start with what the source uses.** If its charts have a clear series order, keep it. Otherwise lead with the accent, then the supporting brand colours.
- **Most brands have too few colours.** Two or three chromatic colours is normal; a categorical palette wants about six. Fill the gap with hues that stay apart from the existing ones *under simulated colour-vision deficiency*, at a chroma similar to the brand's. The tool searches hue and lightness for the candidate farthest from everything already chosen. Generated colours are marked `origin: "generated"`: review them for brand fit, since a technically distinct olive can still look wrong next to a coral brand, and swap in a nearby hue if so.
- **Vary lightness, not only hue.** Colour-vision deficiency removes hue differences; lightness survives. A palette with all colours at the same lightness fails however different the hues look.
- **Order so neighbours differ.** The first two or three colours are used far more than the rest: they should be brand colours and clearly distinct from each other. Put any generated colours last.
- **Fewer is better.** Report `categorical_safe_count`: how many colours from the start of the list stay distinguishable for everyone. Charts with more series than that should use the highlight pattern instead.
- **Dark surfaces.** Colours tuned for a light background can sink on the inverse surface. The tool reports `contrast_on_inverse` and an `inverse_variant` where needed. Record both.

### Context colour

The muted colour for de-emphasised series beside one highlighted series: the grey bars next to the coral bar. It is what makes the insight-first `highlight` API work.

- A low-chroma neutral leaning toward the background's hue (warm grey on cream, cool grey on white).
- Contrast against the background of about **3:1**. Context data is drawn as thin lines, small dots and muted bars, which need the 3:1 of graphical marks to stay visible; the framework moves the brand's context colour in lightness until it reaches 3:1 on each surface's chart plate, so a fainter value is not kept anyway. It must stay under 4.5:1, or it reads as strongly as text and competes with the highlighted series. What makes it recede is its low chroma, not faintness.
- Must stay distinct from the border and gridline colour, or bars merge into the grid.
- If the source already uses one, record it exactly in the draft; if it is fainter than 3:1, expect the rendered charts to show it darker (or lighter, on a dark surface) and note that in `review`.

### Highlight

One colour for "the series or point that matters". Normally the accent. If the accent cannot reach 3:1 on the default background, use the contrast-adjusted version for marks and record the original as `highlight_source`. This is the one place where a failing source colour is changed rather than kept: the `accent` *role* stays as the source has it, the chart *mark* colour must be visible. Say so in the review list.

### Sequential

For magnitudes (heatmaps, choropleths, intensity).

- One hue, the lead brand colour, running from near the background to dark (on a light surface) through five to seven steps. Lightness must change monotonically and in roughly even steps, with chroma highest in the middle.
- The brand hex should sit on the ramp so the scale reads as on-brand.
- A very light or very yellow brand colour makes a poor sequential ramp because it cannot get dark while staying itself. Use the brand's darker supporting colour instead and say why.

### Diverging

For values around a midpoint (change against target, sentiment, deviation).

- Two hues with a neutral midpoint close to the background, three steps per arm, symmetric in lightness.
- Use the lead colour for one end and the brand colour farthest from it in hue for the other. If no suitable brand colour exists, the tool falls back to the complement: check that it does not look foreign. To choose the ends yourself (gold against blue, say), pass `--diverging-ends '#low,#high'`.
- **Never red against green.** If the two ends land there, switch one end to blue or orange. For "bad against good", orange against blue or teal reads correctly and survives colour-vision deficiency.
- If the brand has semantic colours for positive and negative, use them for deltas (`+12%`), not necessarily as the diverging ends.

## Checks

These are the framework's thresholds (run by `deckster brand check`); a brand that breaks one cannot be used. They apply on every surface: colours tuned for a light page usually sink on the inverse surface, so the framework fits the categorical colours to each surface's chart plate itself (lightness moves, hue and order stay). `deckster brand <name> --json` prints the fitted palette per surface; look at a chart on a dark surface in the screenshots and write that surface's own `data` in the draft only when the fitted colours are wrong for the brand.

`brand_tools.py data-palette` runs these on what it generates. `check-data-palette --bg <bg> --colors a,b,c` runs them on any list, and `check-draft` runs them on the draft.

| Check | Threshold | Why |
|---|---|---|
| Each categorical colour against the surface background | at least 3:1 | WCAG 1.4.11 for graphical marks. Thin lines need it more than bars. |
| Neighbouring categorical colours, normal vision | ΔE (OKLab × 100) under 10 fails the build; 10 to 15 warns; 15 or more is comfortable | Series must be told apart at a glance. |
| Neighbouring categorical colours under deuteranopia, protanopia and tritanopia | ΔE under 8 fails the build | Simulated with the Machado 2009 matrices. Below 8, neighbours can merge. |
| Sequential ramp | lightness strictly monotonic | Otherwise order is unreadable, also in greyscale. |
| Diverging ends under deuteranopia and protanopia | ΔE of 12 or more | The two directions must not collapse. |
| Text placed on a filled mark | 4.5:1 against that fill | Value labels inside bars. |
| Context colour against the chart plate | must be within 1.4:1 to 4.5:1; under 3:1 warns and is moved to 3:1 | Visible as a thin line, quieter than text. |
| Categorical count | 3 to 12 | Fewer is not a palette; more should use the highlight pattern. |

A palette that cannot pass with six colours can still be correct with four. Reduce the count before distorting brand colours, and say how many are safe.

Colour is never the only channel in this framework: direct labels and the highlight carry the meaning. That is the fallback when a brand's colours cannot all be told apart, not an excuse to skip the checks.

## When the source's own chart colours fail

Common with brand palettes chosen for logos rather than for data: a light teal at 2.3:1 on cream, or an orange and a green that merge under deuteranopia.

- Keep the source's colours and order as the recorded evidence.
- Put the adjusted, passing palette in the draft, with each change noted as `adjusted_from`.
- Add one review item naming the pair, the measured value and what changed, so a person can accept or override it.

## Specimen comparison

The specimen deck (`scripts/make_specimen.py <name>`, then `deckster shot zz-<name>-specimen`) renders a big number, a stat row, a line chart, a donut, a table and a heatmap in the new brand. Whenever the source has charts or big numbers, pair each with the closest slide in `compare.py` and check:

- The same colours carry the same meaning: highlight, context, series order.
- Gridlines: weight, colour, dash.
- Label colour and type style.
- Number formatting matches on similar values (separators, compact suffixes, decimals).
- Big numbers: size relative to the headline, colour logic, label style.
- Table: header treatment, rule weight, how the emphasised row is marked.

If the source has no charts, still look at the chart slides on their own: do they look like they belong to the rest of the deck? That is the test for a derived palette. Look at one chart slide on a dark surface too (add `surface: inverse` to a figure slide's frontmatter in the specimen and shoot it again; `deckster brand <name> --json` prints the fitted palette per surface).
