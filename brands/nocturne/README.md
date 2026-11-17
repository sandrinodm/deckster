# Nocturne brand

A dark-first, editorial brand for deckster, made to differ from the [default brand](../default)
on every axis: violet-black backgrounds, a warm ember accent, Fraunces (a soft optical serif) for
display type with mono labels, a grainy aurora gradient, sharp corners and slow slide transitions.
All of it is in [`brand.ts`](brand.ts), validated by [`@deckster/brand`](../../packages/brand).

No deck in this repository names it in its config. The tests render the sample and fixture decks
in it as well as in the default brand, to check that a slide that fits one brand fits the other.

## What it looks like

| Surface    | Background                                                     | Text            | Accent          | Used by                    |
| ---------- | -------------------------------------------------------------- | --------------- | --------------- | -------------------------- |
| `default`  | `#0b0911` violet-black                                         | `#efe7da` paper | `#ff8f6b` ember | Content slides             |
| `inverse`  | `#f7f2ea` paper                                                | `#0b0911`       | `#c23f1e`       | Statement and image slides |
| `accent`   | `#ff6f4a` ember                                                | `#0b0911`       | `#0b0911`       | Section slides             |
| `gradient` | `aurora`: orchid, ember and sky glows on night 950, with grain | `#efe7da`       | `#ffb59a`       | Title and closing slides   |

"Used by" is each kit layout's default surface; a slide picks another with `surface:` in its
frontmatter. The two light surfaces (`inverse`, `accent`) show the dark `ink` logo.

- **Type.** Fraunces (display, headlines, titles, stats; quotes in italic with its `SOFT` and
  `WONK` axes), Manrope (lead, body, small, caption) and IBM Plex Mono (labels in upper case, and
  code). Body text is 34 px on the 1920x1080 canvas, titles 56 px. All three are OFL-licensed
  Fontsource packages listed in [`package.json`](package.json).
- **Icons.** [Tabler](https://tabler.io/icons), stroke width 1.25. Icon names differ from Lucide's
  (the default brand's set), so a deck that renders in both needs names both sets have:
  `pnpm deck icons --brand default,nocturne --search <text>` lists them.
- **Shape.** Radii 0, 2, 4 and 8 px; a hairline ring instead of a small shadow, a deep ember glow
  for the large one.
- **Images.** Duotone by default (night shadows, ember highlights); `plain` and `mono` (grayscale)
  on request.
- **Chrome.** The logo top right, the page number as `No. n` bottom left, a "Confidential" footer
  bottom right, a 3 px progress bar on the top edge, nothing on the first slide.
- **Motion.** Slides slide in over 520 ms.
- **Data.** Six categorical colors (ember, sky, gold, jade, orchid, rose), an ember sequential
  ramp and a blue-to-ember diverging one, both ramps written in OKLCH.
- **Diagrams.** Drawn like an engraving: nodes are night panels with a hairline muted outline and
  square corners, titles in Fraunces at a book weight, the icon a plain muted glyph; `outline`
  keeps the line and drops the panel. Edges are hairlines with square bends and open arrowheads,
  their labels in the mono label step, groups a dashed hairline. `raised` is the one card that lifts off the night: an ember outline
  with the large ember glow.

Print every resolved token with:

```sh
pnpm deck brand nocturne         # summary: fonts, type scale, spacing, each surface's roles
pnpm deck brand nocturne --json  # every token, colors as hex
pnpm deck brand check nocturne   # validate it: "nocturne: is valid (0 errors, 0 warnings)."
```

## Using it

Render any deck in Nocturne without editing it. `dev`, `shot`, `lint`, `export` and `diff` take
`--brand`:

```sh
pnpm deck dev hello --brand nocturne
pnpm deck shot hello --brand nocturne    # writes .deck/shots/hello@nocturne/
pnpm deck lint hello --brand nocturne
```

To make it a deck's brand, set `brand: 'nocturne'` in its `deck.config.ts`, or start the deck with
it: `pnpm deck new my-talk --brand nocturne`.

## Starting a new brand from it

Copy the folder, then rename the brand in two places:

```sh
cp -R brands/nocturne brands/acme
```

1. In `brands/acme/brand.ts`, set `name: 'acme'` (it must match the folder) and a `label`.
2. In `brands/acme/package.json`, set `"name": "@deckster/brand-acme"`.
3. Change the palette, roles, fonts and logos (`logos/`, with each variant's `aspect`). Fonts come
   from Fontsource packages in the brand's `package.json`, or from files in the brand folder.
4. Run `pnpm install`, then `pnpm deck brand check acme` and `pnpm deck shot hello --brand acme`.

The [default brand's README](../default/README.md#starting-a-new-brand-from-it) has the same steps
with the icon set and logo details, and the
[`brand-import`](../../skills/brand-import/SKILL.md) skill builds a brand from an existing
deck, PDF, website or guidelines.
