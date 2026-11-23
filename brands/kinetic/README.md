# Kinetic brand

A loud, fast, engineered brand for product launches, developer talks and demo days: chalk white
and ink black with an electric blue and an acid lime, Space Grotesk set tight and heavy over Inter
Tight, mono labels, square corners, hard offset shadows and a quick push between slides. All of
it is in [`brand.ts`](brand.ts), validated by [`@deckster/brand`](../../packages/brand).

## What it looks like

| Surface    | Background                                                            | Text      | Accent    | Used by                    |
| ---------- | --------------------------------------------------------------------- | --------- | --------- | -------------------------- |
| `default`  | `#f5f5f0` chalk                                                       | `#0a0a09` | `#3d4bff` | Content slides             |
| `inverse`  | `#0a0a09` ink                                                         | `#f5f5f0` | `#d4ff3a` | Statement and image slides |
| `accent`   | `#d4ff3a` acid lime, a giant chevron off the right edge               | `#0a0a09` | `#0a0a09` | Section slides             |
| `gradient` | `pulse`: blue and magenta glows on ink, with grain, under a line grid | `#ffffff` | `#d4ff3a` | Title and closing slides   |
| `grid`     | chalk under a 32 px dot grid                                          | `#0a0a09` | `#3d4bff` | Pick it with `surface:`    |

"Used by" is each kit layout's default surface; a slide picks another with `surface:` in its
frontmatter. The dark surfaces show the `reversed` logo.

- **Background layers.** The title surface tiles [`backgrounds/grid.svg`](backgrounds) at 7% over
  its mesh, the section surface places `chevrons.svg` at 8% off the right edge, and the `grid`
  surface tiles `dots.svg`.
- **Type.** Space Grotesk bold (display, headlines, titles, stats with tabular figures, quotes in
  medium), Inter Tight (lead, body, small, caption) and JetBrains Mono (upper-case labels and
  code). Body text is 34 px on the 1920x1080 canvas, titles 52 px. All three are OFL-licensed
  Fontsource packages listed in [`package.json`](package.json).
- **Icons.** [Tabler](https://tabler.io/icons), stroke width 2.
- **Shape.** No radii; shadows are hard offsets in ink (4, 8 and 14 px), in lime on the inverse
  surface.
- **Images.** Untreated by default; `mono` (grayscale) and `volt` (a blue-to-lime duotone) on
  request.
- **Chrome.** The logo top right, a "Kinetic" footer bottom left, the page number as `n/total`
  bottom right, a 6 px progress bar along the bottom, nothing on the first slide.
- **Motion.** Slides push over 240 ms.
- **Data.** Blue, magenta, olive, graphite, flare orange and aqua, ordered so neighbours stay apart
  under every color-vision deficiency; a blue sequential ramp and a magenta-to-blue diverging one.
- **Diagrams.** Nodes are white boxes with an ink border and the small hard shadow (lime on the
  inverse surface), titles in upper-case JetBrains Mono on every card and in Layers chips, edges
  bent square, groups framed in a regular ink line, and edge and message labels set in the mono
  label step inside bordered chips. `solid` and `raised` carry bigger offsets, outside services
  (`external`) are outlines, and the brand's own `volt` card fills a node with acid lime for the
  one thing on a slide that has to shout (white on the lime section surface).

```sh
pnpm deckster brand check kinetic   # "kinetic: is valid (0 errors, 0 warnings)."
pnpm deckster shot hello --brand kinetic
```

To make it a deck's brand, set `brand: 'kinetic'` in its `deck.config.ts`, or start the deck
with it: `pnpm deckster new my-talk --brand kinetic`.
