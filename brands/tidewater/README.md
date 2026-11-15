# Tidewater brand

A calm, clear, trustworthy brand for climate, health, public-sector and finance decks that carry
numbers people act on: warm sand under deep sea blues, a coral accent used sparingly, one family
(Hanken Grotesk) from light statistics to semibold headings, generous rounded corners, soft long
shadows and a slow fade. All of it is in [`brand.ts`](brand.ts), validated by
[`@deckster/brand`](../../packages/brand).

## What it looks like

| Surface    | Background                                                           | Text      | Accent    | Used by                    |
| ---------- | -------------------------------------------------------------------- | --------- | --------- | -------------------------- |
| `default`  | `#fbf9f5` sand                                                       | `#151b20` | `#215f76` | Content slides             |
| `inverse`  | `#0e2a37` deep sea                                                   | `#fbf9f5` | `#f6a58c` | Statement and image slides |
| `accent`   | `#215f76` sea blue                                                   | `#ffffff` | `#ffffff` | Section slides             |
| `gradient` | `tide`: a deep blue mesh with grain, under topographic contour lines | `#fbf9f5` | `#f6a58c` | Title and closing slides   |
| `shore`    | sand with faint contour lines off the bottom right corner            | `#151b20` | `#215f76` | Pick it with `surface:`    |

"Used by" is each kit layout's default surface; a slide picks another with `surface:` in its
frontmatter. The dark surfaces show the `reversed` logo.

- **Background layers.** The title surface places
  [`backgrounds/contours-light.svg`](backgrounds) at 16% off the right edge; the `shore` surface
  places `contours-deep.svg` at 10% off the bottom right corner.
- **Type.** Hanken Grotesk throughout: semibold headings, light statistics with tabular figures,
  italic quotes, upper-case labels; IBM Plex Mono for code. Body text is 34 px on the 1920x1080
  canvas, titles 50 px. Both are OFL-licensed Fontsource packages listed in
  [`package.json`](package.json).
- **Icons.** [Lucide](https://lucide.dev/icons), stroke width 1.5.
- **Shape.** Radii 8, 16, 24 and 40 px; soft, long shadows tinted with the deep blue.
- **Images.** Large rounded corners by default; `tide` (a deep-blue-to-sand duotone) and `plain`
  on request.
- **Chrome.** The logo top right, the page number bottom right, a 4 px progress bar along the top,
  nothing on the first slide.
- **Motion.** A 440 ms fade.
- **Data.** Sea blue, coral, lilac, gold, deep navy and kelp green, ordered so neighbours stay
  apart under every color-vision deficiency; a sea-blue sequential ramp and a coral-to-blue
  diverging one.

```sh
pnpm deck brand check tidewater   # "tidewater: is valid (0 errors, 0 warnings)."
pnpm deck shot hello --brand tidewater
```

To make it a deck's brand, set `brand: 'tidewater'` in its `deck.config.ts`, or start the deck
with it: `pnpm deck new my-talk --brand tidewater`.
