# Default brand

The brand every deckster deck gets unless its `deck.config.ts` names another. It is light-first:
cool grays with one cobalt accent, Bricolage Grotesque for display type and labels over Inter for
reading, a cobalt-to-ink gradient, medium radii and short fade transitions. All of it is in
[`brand.ts`](brand.ts), validated by [`@deckster/brand`](../../packages/brand).

Every deck in this repository uses it. A workspace without a `brands/default` folder gets this one
from the framework.

## What it looks like

| Surface    | Background                                                         | Text      | Accent           | Used by                    |
| ---------- | ------------------------------------------------------------------ | --------- | ---------------- | -------------------------- |
| `default`  | `#fcfcfd` near-white                                               | `#161920` | `#2d4ae0` cobalt | Content slides             |
| `inverse`  | `#0c0e13` near-black                                               | `#f4f5f8` | `#6283ff`        | Statement and image slides |
| `accent`   | `#2d4ae0` cobalt                                                   | `#ffffff` | `#ffffff`        | Section slides             |
| `gradient` | `horizon`: cobalt 700 to cobalt 900 to ink 950 at 160°, with grain | `#ffffff` | `#ffffff`        | Title and closing slides   |

"Used by" is each kit layout's default surface; a slide picks another with `surface:` in its
frontmatter. The three dark surfaces show the reversed logo.

- **Type.** Bricolage Grotesque (display, headlines, titles, labels, stats, quotes; slightly
  condensed through its `wdth` axis), Inter (lead, body, small, caption) and JetBrains Mono (code).
  Body text is 36 px on the 1920x1080 canvas, titles 48 px. All three are OFL-licensed Fontsource
  packages listed in [`package.json`](package.json).
- **Icons.** [Lucide](https://lucide.dev), stroke width 1.75.
- **Shape.** Radii 6, 12, 20 and 32 px; soft layered shadows.
- **Images.** Rounded corners by default (`rounded`); `plain` and `muted` (grayscale) on request.
- **Chrome.** The logo top right, the page number as `n / total` bottom right, no footer, no
  progress bar, nothing on the first slide.
- **Motion.** Fade between slides in 280 ms.
- **Data.** Six categorical colors (cobalt, amber, teal, violet, rose, gray), a cobalt sequential
  ramp and an amber-to-cobalt diverging one.

Print every resolved token with:

```sh
pnpm deck brand default         # summary: fonts, type scale, spacing, each surface's roles
pnpm deck brand default --json  # every token, colors as hex
pnpm deck brand check default   # validate it: "default: is valid (0 errors, 0 warnings)."
```

## Using it

A deck names its brand in `deck.config.ts`:

```ts
import { defineDeck } from '@deckster/engine/config';

export default defineDeck({
  title: 'Hello, deck',
  brand: 'default',
  slides: ['title', 'steps', 'live-counter', 'closing'],
});
```

`dev`, `shot`, `lint`, `export` and `diff` take `--brand <name>` to render a deck in another brand
without editing it:

```sh
pnpm deck shot hello --brand nocturne   # writes .deck/shots/hello@nocturne/
```

[`tailwind.tooling.css`](../../tailwind.tooling.css), which the formatter and the Tailwind lint
rule check class names against, is generated from this brand. After changing a role, a type step or
another name that becomes a class, run `pnpm tooling:tailwind`; `pnpm check` fails until you do.

## Starting a new brand from it

```sh
cp -R brands/default brands/acme
```

1. In `brands/acme/brand.ts`, set `name: 'acme'` (it must match the folder) and a `label`.
2. In `brands/acme/package.json`, set `"name": "@deckster/brand-acme"`.
3. Change the palette, roles and fonts. A new Fontsource font goes in the brand's `package.json`
   dependencies. `icons.set` must be a set `@deckster/kit` has installed (`lucide` or `tabler`), or add
   its `@iconify-json/<set>` package there.
4. Replace the files in `logos/` and update each variant's `aspect` (width divided by height).
5. Run `pnpm install`, then check it and look at it:

```sh
pnpm deck brand check acme
pnpm deck shot hello --brand acme
```

`deck brand check` names every problem with its field and fix, contrast on every surface included.
To build a brand from an existing deck, PDF, website or guidelines, use the
[`brand-import`](../../.claude/skills/brand-import/SKILL.md) skill.
