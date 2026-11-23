# Fieldnote brand

A warm, printed, editorial brand for research findings, reports and talks that should feel
considered rather than corporate: cream paper and a warm near-black ink, forest green with
terracotta and ochre, Playfair Display headings over Source Sans 3, small radii and an unhurried
fade. All of it is in [`brand.ts`](brand.ts), validated by [`@deckster/brand`](../../packages/brand).

## What it looks like

| Surface    | Background                                                       | Text      | Accent    | Used by                    |
| ---------- | ---------------------------------------------------------------- | --------- | --------- | -------------------------- |
| `default`  | `#faf6ee` paper                                                  | `#1c1814` | `#2c5e44` | Content slides             |
| `inverse`  | `#13291f` forest                                                 | `#faf6ee` | `#ebc66b` | Statement and image slides |
| `accent`   | `#7f3b23` terracotta                                             | `#fffdf8` | `#fffdf8` | Section slides             |
| `gradient` | `canopy`: a forest radial glow with grain, and a botanical sprig | `#faf6ee` | `#ebc66b` | Title and closing slides   |
| `notebook` | paper ruled every 48 px with a terracotta margin line            | `#1c1814` | `#2c5e44` | Pick it with `surface:`    |

"Used by" is each kit layout's default surface; a slide picks another with `surface:` in its
frontmatter. The dark surfaces show the `reversed` logo.

- **Background layers.** The title surface draws [`backgrounds/sprig.svg`](backgrounds), a line
  drawing in paper ink, off the bottom right corner at 32%. The `notebook` surface tiles
  `ruled.svg` and places `margin.svg` as a notebook's margin rule; text on it is measured against
  the actual pixels by `deckster lint`.
- **Type.** Playfair Display (display, headlines, titles, stats; quotes in italic), Source Sans 3
  (lead, body, small, caption and upper-case labels) and Source Code Pro for code. Body text is
  34 px on the 1920x1080 canvas, titles 52 px. All three are OFL-licensed Fontsource packages
  listed in [`package.json`](package.json).
- **Icons.** [Tabler](https://tabler.io/icons), stroke width 1.5.
- **Shape.** Radii 2, 4, 8 and 14 px; soft shadows tinted with the warm ink.
- **Images.** A small rounded corner by default; `sepia` (a warm duotone) and `plain` on request.
- **Chrome.** The logo bottom left, the page number bottom right, nothing on the first slide.
- **Motion.** A 380 ms fade.
- **Data.** Forest, terracotta, slate blue, ochre, plum and umber, ordered so neighbours stay apart
  under every color-vision deficiency; a forest sequential ramp and a terracotta-to-slate
  diverging one.
- **Diagrams.** Printed figures: nodes are paper boxes with a hairline umber rule, small corners
  and no shadow, titles in Playfair Display, the icon a plain glyph. Edges end in open arrowheads,
  groups are dashed like a field sketch, and outside services (`external`) are outlines. The
  brand's own `note` card is an ochre slip with a terracotta rule down its left side, for the one
  node a slide annotates.

## Layouts

[`layouts.ts`](layouts.ts) brings four layouts, the ones a research group's template would carry.
Each is data: boxes on the 1920x1080 canvas over a drawing in [`layouts/`](layouts), in the
palette. A deck on another brand renders a slide that names one of them with its fallback.

| Layout              | Label                 | Falls back to | Default surface | What it is                                                                                                                                  |
| ------------------- | --------------------- | ------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `fieldnote-cover`   | Fieldnote cover       | `title`       | `inverse`       | Notebook margin rule and a sprig mark; eyebrow, title, subtitle, byline and date. Paper art on the default surface. No logo or page number. |
| `fieldnote-section` | Fieldnote section     | `section`     | `accent`        | A part number set large, the title low on the left over contour lines, a one-line summary.                                                  |
| `fieldnote-photo`   | Fieldnote photo right | `image`       | `default`       | Text on the left, a picture that bleeds off the right and bottom edges; the page number moves to the foot of the text column.               |
| `fieldnote-columns` | Fieldnote two columns | `content`     | `default`       | Title under an eyebrow, then a main column and an `<Aside>` split by a hairline. Forest art on the inverse surface.                         |

```sh
pnpm deckster layouts brand-layouts --summary   # the four first, then the kit's
pnpm deckster brand check fieldnote
```

[`decks/brand-layouts`](../../decks/brand-layouts) uses all four.

```sh
pnpm deckster brand check fieldnote   # "fieldnote: is valid (0 errors, 0 warnings)."
pnpm deckster shot hello --brand fieldnote
```

To make it a deck's brand, set `brand: 'fieldnote'` in its `deck.config.ts`, or start the deck
with it: `pnpm deckster new my-talk --brand fieldnote`.
