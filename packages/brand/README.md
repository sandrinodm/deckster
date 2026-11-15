# @deckster/brand

The brand schema, resolver, checks and compiler of deckster. It turns `brands/<name>/brand.ts`
into resolved tokens (hex colors and canvas-pixel sizes on every surface), checks them for
contrast and color-vision problems, and compiles them to CSS custom properties, a Tailwind v4
theme, `@font-face` rules and Shiki themes.

It is a private workspace package: not published to npm, consumed as `workspace:*`, and it exports
TypeScript source with no build step. Every brand folder depends on it for `defineBrand`, and the
Vite plugin, the CLI, the kit, export, comments and the agent import it.

## A brand file

A brand is data. `brands/<name>/brand.ts` default-exports one `defineBrand` call:

```ts
import { defineBrand } from '@deckster/brand';

export default defineBrand({
  name: 'default', // must match the folder name
  label: 'Default',
  color: {
    palette: {
      ink: { 0: '#ffffff', 900: '#161920' /* ... */ },
      cobalt: { 600: '#2d4ae0' /* ... */ },
    },
    roles: { bg: 'ink.25', fg: 'ink.900', accent: 'cobalt.600' /* ... */ },
    surfaces: { default: {}, inverse: { bg: 'ink.950' /* ... */ } /* accent, gradient */ },
    data: {
      categorical: [/* ... */],
      sequential: [/* ... */],
      diverging: [/* ... */],
      context: 'ink.300',
    },
  },
  // gradients, typography, shape, spacing, logo, icons, imagery, chrome and motion are required too
});
```

`defineBrand` returns its argument unchanged; it exists for type checking. The brands in
[`brands/`](../../brands) (`default`, `fieldnote`, `kinetic`, `nocturne`, `tidewater`) set every
section. `code`, `diagram` and `charts` are optional and derived from the roles when left out.

Check a brand without a deck, or print its resolved tokens:

```console
$ pnpm deck brand check nocturne
brands/nocturne/brand.ts
nocturne: is valid (0 errors, 0 warnings).

$ pnpm deck brand nocturne
Nocturne (brands/nocturne/brand.ts)
Fonts: display Fraunces, body Manrope, mono IBM Plex Mono
Type: display 168px, headline 84px, title 56px, lead 38px, body 34px, small 26px, caption 24px, label 22px, stat 184px, quote 88px, code 26px
...
```

`pnpm deck brand <name> --json` prints every resolved token.

## What the brand defines

- **Roles.** `bg`, `surface`, `fg`, `heading`, `muted`, `accent`, `accent-fg`, `border`,
  `positive` and `negative` (`ROLE_NAMES`). Colors are palette steps (`cobalt.600`), steps with an
  opacity (`ink.0/12`) or literals (`oklch(...)`, hex). `heading` defaults to `fg`.
- **Surfaces.** Every brand has `default`, `inverse`, `accent` and `gradient`
  (`REQUIRED_SURFACES`), so a slide's `surface:` frontmatter works in every brand. A surface remaps
  roles; one the brand leaves out is derived from its roles. Brands may add more.
- **Text colors.** Each surface also gets `accent`, `positive` and `negative` text colors, held to
  4.5:1 on the surface's backdrop and chart plate (derived by OKLCH lightness when the role falls
  short). The roles themselves only need 3:1.
- **Fonts.** Three families (`display`, `body`, `mono`), each from a Fontsource package installed
  in the brand's `package.json` (`kind: 'fontsource'`), font files in the brand folder (`files`),
  the viewer's system (`system`), or `unavailable` with a reason (the build warns until the files
  arrive). `substitute` names the installed family a PPTX export falls back to.
- **Type scale.** Eleven steps (`TYPE_STEPS`: display, headline, title, lead, body, small,
  caption, label, stat, quote, code) in canvas pixels, none below `MIN_TYPE_SIZE_PX` (20).
- **The rest.** Gradients (linear, radial, mesh, with grain), radii, strokes and shadows, a
  spacing scale with slide margins and a 12-column grid, logo variants and their placement, an
  Iconify icon set, image treatments, chrome (page number, footer, progress, logo) and motion
  (easings, durations, slide transition).

## What the checks do

`resolveBrand` runs three passes and reports every problem of the first one that finds any, each
with its field and a fix:

1. The schema: types, ranges, unknown fields (with the nearest valid name).
2. References: palette steps, gradients, surfaces, logo variants, font weights, waivers, opaque
   backgrounds.
3. Quality: WCAG contrast of the role pairs on every surface (`TEXT_CONTRAST` 4.5,
   `GRAPHIC_CONTRAST` 3), and data palettes on each surface's chart plate and under color-vision
   deficiencies.

A brand that fails does not load: `deck dev`, `build`, `shot` and `lint` stop with the brand file,
the field and the fix. Warnings (a waived contrast pair, data colors that are close, `positive`
and `negative` that merge under a color-vision deficiency, a font substitute of another kind)
don't stop it. `loadBrand` adds the checks that need the disk: the `name` matches the folder,
font packages and files exist, logo files exist.

## Exports

| Import                    | What it holds                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/brand`         | `defineBrand`, the `Brand` schema, `resolveBrand`, `compileBrand`, `fontFaceCss`, `brandVariables` and `cssVar`, contrast and data-palette thresholds, `ROLE_NAMES`, `REQUIRED_SURFACES`, `TYPE_STEPS`, `MIN_TYPE_SIZE_PX`, `isSafeName`, `BrandError` and `describeProblem`, and the token types. Safe in the browser. |
| `@deckster/brand/node`    | `loadBrand` and `listBrands` (Effect, `FileSystem`), `brandTokensJson`, `fileExists`, and the agent's content policy, turn guard and code gate (see below).                                                                                                                                                             |
| `@deckster/brand/runtime` | The brand's runtime plugin (default export), `useBrand()` and `getBrand(surface)`. It imports `virtual:deck/brand` and `virtual:deck/brand.css`, so it runs only inside a deck served by `@deckster/vite-plugin`.                                                                                                       |

The Vite plugin loads the deck's brand like this
([`load-deck-brand.ts`](../vite-plugin/src/brand/load-deck-brand.ts)):

```ts
import { loadBrand } from '@deckster/brand/node';
import { Effect } from 'effect';

const program = Effect.gen(function* () {
  const brand = yield* loadBrand(workspaceRoot, 'nocturne');
  // brand.tokens, brand.compiled.css, brand.compiled.tailwind, brand.compiled.fontFaces,
  // brand.compiled.shikiThemes, brand.logoFiles, brand.warnings
});
```

Components that need raw values (charts, diagrams, the logo) read them for the slide's surface
([`brand-logo.tsx`](../kit/src/foundation/brand-logo.tsx)):

```tsx
import { useBrand } from '@deckster/brand/runtime';

const { brand, surface, logo } = useBrand();
```

Everything else uses CSS. The compiled stylesheet puts the brand's custom properties on
`[data-brand="<name>"]` and each surface's roles on `[data-surface="<surface>"]`, and the Tailwind
theme maps classes such as `bg-surface`, `text-muted`, `text-accent-text`, `font-display` and
`rounded-lg` to them. Tailwind's own colors, fonts, type sizes, radii, shadows and easings are
removed, so an off-brand value does not exist as a class.

## Rules for changing it

- The brand schema and the compiled CSS are the public surface of deckster. A change to either is
  a feature: brands, layouts, the kit and exported files depend on the names.
- Thresholds (minimum type size, WCAG ratios, data-palette distances) live here and are exported.
  The CLI's lint rules and the kit import them; never copy a number into another package.
- `src/runtime/` is browser code: plain React, no Effect. Everything under `src/node/` is Effect:
  each effectful function is `Effect.fn('name')`, errors are `BrandError` built by `brandError`,
  files go through `FileSystem.FileSystem`.
- Brand names become paths, so `loadBrand` checks `isSafeName` (kebab-case, at most 64
  characters) before it imports anything. A workspace without `brands/default` gets the
  framework's own default brand.
- `brand.ts` is imported fresh when it changes on disk; files it imports are not.
- `@deckster/brand/node` also holds the agent's content policy (`CONTENT_FOLDERS`), the turn guard and
  the code gate. They live here because `loadBrand` must finish a turn a crash left unfinished
  before it imports a brand, and must not import one while an agent turn runs. See
  [docs/agent.md](../../docs/agent.md) before changing them.

## Tests

Unit tests sit beside the code (`src/**/*.test.ts`) and run with `@effect/vitest`.
`src/test-brand.fixture.ts` builds a valid brand that tests override by dotted path
(`testBrand({ 'color.roles.fg': 'red' })`).

```sh
cd packages/brand
pnpm exec vp test run                                   # the package's tests, once
pnpm exec vp test run src/resolve/resolve-brand.test.ts # one file
```

## See also

- [docs/design.md](../../docs/design.md#brands) on why a brand is data.
- The [`brand-import`](../../skills/brand-import/SKILL.md) skill, which builds a brand from
  an existing deck, PDF, website or guidelines.
