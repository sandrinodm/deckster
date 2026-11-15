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
  the actual pixels by `deck lint`.
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

```sh
pnpm deck brand check fieldnote   # "fieldnote: is valid (0 errors, 0 warnings)."
pnpm deck shot hello --brand fieldnote
```

To make it a deck's brand, set `brand: 'fieldnote'` in its `deck.config.ts`, or start the deck
with it: `pnpm deck new my-talk --brand fieldnote`.
