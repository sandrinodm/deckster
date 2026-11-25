# Writing a code layout

A code layout is a slide layout written as React code, in a brand or in one deck. Reach for one only when the kit's layouts and a brand's data layouts cannot hold the slide. Read this before writing one, and use the catalog commands in [Framework](framework.md) to check that the layout you need does not exist yet.

A code layout is checked, linted, exported and commented on like a kit layout: frontmatter and slot validation, budgets, `deckster layouts`, the agent's catalog, PDF and PPTX export, `deckster shot`. It gets that by keeping to the rules in [The DOM a layout must keep](#the-dom-a-layout-must-keep).

`deckster layouts new <name> --brand <brand>` writes a working one-slot layout to start from, `deckster layouts check` proves it, and `deckster layouts eject` copies a kit layout to change (see [Commands](#commands)).

## Kit, data or code

| Need                                                                                   | Use                                                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| The content fits a kit layout, in the brand's type and grid                            | A kit layout. It adapts to every brand and steps its type to fit.   |
| A template's own slides: fixed regions and art at set places on the canvas             | A data layout in `brands/<name>/layouts.ts` (the `brand-import` skill writes these). |
| A structure no kit layout has, or a kit layout that must work differently for a brand  | A code layout in the brand, or in the deck for a one-off.           |

A brand layout is for something every deck on the brand should get. A deck layout travels with the deck and is for a one-off. Slides that a data layout's regions can hold stay on the data layout; code is the answer for what regions cannot do.

## Where the files go

```
brands/acme/
  brand.ts
  brand.json                  optional: { "deckster": ">=0.9 <0.11" }
  layouts.ts                  data layouts, unchanged
  layouts/
    title-photo.svg           data layout art stays at the top level
    kpi-wall/                 a code layout: one folder per layout
      contract.ts             defineLayoutContract(...), no JSX
      layout.tsx              defineLayout(...), default export
      layout.css              optional, imported by layout.tsx
      limits.ts               optional: limit cases for `layouts check`
    _shared/                  helpers several layouts import; never a layout
decks/q4-review/
  layouts/
    funnel/
      contract.ts
      layout.tsx
```

- The folder name is the layout name and must equal `name` in the contract and in `defineLayout`. It is kebab-case and at most 64 characters.
- The file names are fixed, so nothing is registered anywhere. A folder without `contract.ts` or `layout.tsx` is a `layout-folder-incomplete` problem.
- Every folder under `layouts/` is a layout, except `_shared/` and folders whose name starts with a dot. Files at the top of `layouts/` (data layout art) are ignored. An ejected layout also has a `.eject/` folder inside its own folder (see [Eject](#eject-and-diff)).
- Helpers are any `.ts`, `.tsx` or `.css` file in the layout's folder or in `layouts/_shared/`.

## A complete minimal layout

A title over a wall of figures. The contract (Node, no JSX):

```ts
import { defineLayoutContract } from '@deckster/engine/layout';
import { EYEBROW_HINT, EyebrowField } from '@deckster/kit/layout-fields';
import { Schema } from 'effect';

/**
 * The longest title, in characters, that fits the header on two lines.
 */
const KPI_WALL_TITLE_MAX_CHARS = 70;

/**
 * The `kpi-wall` layout: a title over a wall of three to six figures.
 */
export default defineLayoutContract({
  name: 'kpi-wall',
  description:
    'A title that states the point over a wall of up to six figures, one bullet each, such as ' +
    '"42% faster". Use it when the evidence is a handful of numbers with no trend to draw.',
  schema: Schema.Struct({
    eyebrow: EyebrowField,
    columns: Schema.optionalKey(Schema.Literals([2, 3])),
  }),
  hints: {
    eyebrow: EYEBROW_HINT,
    columns: 'Write `columns: 2` for four figures or fewer; leave it out for three columns.',
  },
  title: { required: true, maxChars: KPI_WALL_TITLE_MAX_CHARS },
  slots: {
    body: {
      description: 'The figures, one bullet each: the number first, then what it measures.',
      required: true,
      accepts: ['bullets'],
    },
    footnote: {
      description: 'The source and the period, in a sentence.',
      accepts: ['text'],
    },
  },
  budget: {
    body: { maxBullets: 6, maxWords: 36 },
    footnote: { maxWords: 24 },
  },
  pptx: {
    type: 'content',
    placeholders: [
      { kind: 'title', from: { selector: '.kit-title' } },
      { kind: 'body', from: { slot: 'body' } },
    ],
  },
  example: {
    frontmatter: { title: 'Checkout is faster and more reliable', eyebrow: 'Q3 results' },
    body: [
      '- 42% faster median checkout',
      '- 3 regions live',
      '- 99.95% uptime',
      '',
      '<Footnote>Source: status page, July to September.</Footnote>',
      '',
    ].join('\n'),
  },
});
```

The component (browser). It imports the contract only as a type, so the browser never loads the schema:

```tsx
import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';
import { Footnote, Frame, Region, SlideHeader, useEnter } from '@deckster/kit/layout-parts';

import type contract from './contract.ts';

import './layout.css';

/**
 * The `kpi-wall` layout: the shared header, then the figures as tiles in a grid and a footnote.
 */
function KpiWall({ frontmatter, slots }: LayoutProps<typeof contract>): ReactNode {
  const wallEnter = useEnter(1);
  return (
    <Frame layout="kpi-wall" variant={{ 'data-columns': String(frontmatter.columns ?? 3) }}>
      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />
      <Region place="optical">
        <div className="kpi-wall-tiles" {...wallEnter}>
          {slots.body}
        </div>
      </Region>
      <Footnote>{slots.footnote}</Footnote>
    </Frame>
  );
}

export default defineLayout<typeof contract>({ name: 'kpi-wall', component: KpiWall });
```

The stylesheet. Start with the `@layer` line and put the rules in `@layer components`, as the kit's own stylesheets do, so the brand's utilities can still override them. Style with the brand's CSS variables (`--brand-space-md`, `--brand-color-accent`, and the rest) and never with raw colours, fonts or pixel sizes:

```css
@layer theme, base, components, utilities;

@layer components {
  .kit-frame[data-layout='kpi-wall'] .kpi-wall-tiles ul {
    display: grid;
    grid-template-columns: repeat(var(--kpi-wall-columns, 3), 1fr);
    gap: var(--brand-space-md);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .kit-frame[data-layout='kpi-wall'][data-columns='2'] {
    --kpi-wall-columns: 2;
  }

  .kit-frame[data-layout='kpi-wall'] .kpi-wall-tiles li {
    padding: var(--brand-space-md) 0 0;
    border-top: var(--brand-stroke-bold) solid var(--brand-color-accent);
    color: var(--brand-color-heading);
  }
}
```

The limit cases, which `layouts check` renders besides the example. This layout takes bullets only, so each case brings its own body (`bodyMdx`); the generated paragraph would fail the slot check:

```ts
import type { LimitCase } from '@deckster/kit/limit-cases';

/**
 * Six figures of six words each, the most the body budget allows.
 */
const SIX_FIGURES = [
  '- 42% faster median checkout time',
  '- 3 regions live since June',
  '- 99.95% uptime over the quarter',
  '- 18% fewer abandoned carts',
  '- 4.8 average rating in stores',
  '- 12 minutes to roll back',
].join('\n');

export default [
  { name: 'three-columns', frontmatter: {}, filled: ['footnote'], bodyMdx: SIX_FIGURES },
  { name: 'two-columns', frontmatter: { columns: 2 }, filled: ['footnote'], bodyMdx: SIX_FIGURES },
] satisfies readonly LimitCase[];
```

Put the four files in `brands/<brand>/layouts/kpi-wall/` and use it:

```
deckster layouts check kpi-wall --brand <brand>         # contract checks, then renders the example and each case
deckster layouts <deck> --summary                       # lists kpi-wall under "Layouts from the <brand> brand (prefer these):"
deckster new slide <deck> numbers --layout kpi-wall     # writes the contract's example as a slide
deckster lint <deck>
deckster shot <deck> numbers
```

`layouts check` prints one line per layout and a verdict:

```
brands/acme/layouts/ (rendered in the acme brand)
  kpi-wall: ok (example, three-columns, two-columns)
The brand acme: 1 of 1 layout pass (0 errors, 0 warnings).
```

The slot content (`slots.body`) is a React node the engine already wrapped in `span.deck-slot[data-slot="body"]`. The layout places it and styles the elements inside it, and never rebuilds it.

Run `deckster types` once in the workspace so an editor resolves `@deckster/*`.

## What each file may import

**`contract.ts` runs in Node**, loaded by the build, `deckster layouts`, lint and export, so it may not import components. Before anything is evaluated, the build reads the file and the relative files it imports, and rejects an import that is not one of these:

- `effect` and its entry points (`effect/Schema`);
- `@deckster/engine/layout` and `@deckster/engine/command`;
- `@deckster/kit/layout-fields`;
- `@deckster/brand`, for types and data helpers;
- relative `.ts` files inside the layout's own folder or `layouts/_shared/`. A `.tsx`, a `.css` or an image is rejected, and so is a path that leaves those two folders.

The problem is `layout-contract-imports`, names the file and the import, and the layout is left out. `import type` and `export type` are not followed, because they are erased. An `import()` whose target is not one plain string is rejected. Keep everything with JSX or CSS in `layout.tsx`.

**`limits.ts` is loaded like `contract.ts`**: the same list, the same check, and never while an agent turn is changing files. Import `LimitCase` as a type (`import type { LimitCase } from '@deckster/kit/limit-cases'`); a value import of `@deckster/kit/limit-cases` is rejected as `layout-contract-imports`.

**`layout.tsx` and the files it imports run in the browser** through Vite. They may import:

- `@deckster/engine` (`defineLayout`, `LayoutProps`, `useStatic`, `useReadyHold`, and the rest of its exports), `@deckster/kit` (`Image`, `Icon`, `Code`, `Step`, the components), `@deckster/kit/layout-parts`, `@deckster/kit/diagrams`, `@deckster/brand/runtime` (`useBrand`);
- `react`, `react-dom` and `effect`;
- their own files: other `.ts`, `.tsx` and `.css` files in the layout's folder or `layouts/_shared/`, and the contract as a type.

A workspace has no `node_modules` of its own, so there is nothing to `npm install`: `@deckster/*` and the packages the framework itself ships resolve from the framework. Other packages the framework depends on (a charting or animation library, say) resolve too, but that is not a promise: a framework update may change them. Do not depend on one you cannot replace.

Do not import another layout's files (a kit layout's `src/` paths are private) and do not copy a kit file to edit it. Both break on the next kit change.

## The DOM a layout must keep

Lint, export and comments read the rendered slide. A layout that follows these rules gets all of them. A layout that does not gets wrong lint results, a wrong PPTX, or both, mostly without an error.

- **The layout name.** The engine stamps `data-deck-layout="<name>"` on every slide from its frontmatter, and export picks the PPTX mapping from it. The layout does not need to set it, and a typo in its own markup cannot pick another mapping. Still set `data-layout="<name>"` on the layout's root (`Frame layout="<name>"` does it) as the hook for CSS and tests, and use no nested `data-layout`.
- **Slots are not reparented.** The engine wraps each filled slot in `span.deck-slot[data-slot]`. Lint classifies a slot's blocks (list, table, chart, code, image) by that wrapper's direct children, so render `slots.body` as it is: do not map over its children, wrap each in your own element, or split it. Style it from outside with CSS, as the example does for `ul` and `li`.
- **Steps** are `.deck-step[data-step][data-step-state]`, which the kit's `Step` renders. A layout that reveals things by step uses `Step` from `@deckster/kit/layout-parts`, and `useEnter(order)` for the entrance order of its regions (0 is the header; the order is clamped to `MAX_ENTER_ORDER`).
- **Readiness.** A layout that measures its content after fonts or data load (to fit text, to pick a density) must hold the slide until it has settled: `useReadyHold(pending)` from `@deckster/engine`, released in the render that shows the final content. Without it `deckster shot`, `lint` and export capture a slide that has not settled yet. `FittedText` does this for you.
- **The kit's component classes.** Lint and export recognise slot content by the classes and attributes the kit components draw: `.kit-stat` and `.kit-stat-row`, `[data-chart]`, `.kit-diagram`, `.kit-code`, `.kit-code-move` and `.kit-terminal`, `.kit-video`, `.kit-app` and `.kit-live`, and `kit-table-fit`. A layout that renders slot content with the kit components gets them for free. A layout that draws its own stat, code or video markup in place of those components is misjudged by the slot `accepts` check and by export.
- **The frame.** `Frame` carries the `.kit-frame` class that the kit's type and table styles are scoped under. A layout that does not use `Frame` loses the kit's table and type styling.
- **The title.** Title text rendered by `SlideHeader` carries `.kit-title`, which the PPTX mapping points at (see below).
- **Comments** use `data-deck-source` stamps that the dev server adds to JSX in the deck's own `.tsx` and `.mdx` files, and the `.deck-slide` element, never kit classes. A layout in a deck is stamped like a slide. Only modules inside the deck folder are stamped, so the elements a brand layout draws carry no stamp of their own.

## What a layout can be built from

`@deckster/kit/layout-parts` (browser; loads the stylesheets of its parts):

| Export                                                                         | What it is for                                                                          |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `Frame`, `Region`                                                              | The slide's root with the brand's margins, safe area and backdrop, and a growing region |
| `Eyebrow`, `SlideHeader`, `Footnote`                                           | The standard header (with `.kit-title`) and the bottom line                              |
| `FittedText`                                                                   | Text that steps down in size until it fits its lines, with `data-fit` for lint          |
| `useFitGroupWidth`, `useRenderOnFontLoad`, type `FitRung`, `useFitLevel`       | The fit ladder and density steps for content that may not fit                           |
| `TreatedMedia`, `BrandLogo`, `smartPunctuation`                                | The brand's image treatments and logo, and typographic quotes and dashes                |
| `StatValue`, `StatDelta`                                                       | Stat figures that count up                                                              |
| `useEnter`, `enterProps`, `MAX_ENTER_ORDER`, type `EnterProps`, `Step`        | Entrance order and steps                                                                |
| `frontmatterAsset`, `frontmatterIcon`, type `IconComponent`                    | The registry of pictures and icons that MDX slides fill: use it, never a copy           |
| `TableLayoutContext`, type `TableLayoutSettings`, `useStillMotion`             | State the kit's tables and reveals share: use these exports, never a copy               |

`@deckster/kit/layout-fields` (plain Node, so a contract may import it): `EyebrowField`, `EYEBROW_HINT`, `chromeField`, `CHROME_HINT`, `TreatmentField`, `TREATMENT_HINT`, `treatmentProps`, `textField`, `CONTEXT_MAX_WORDS`, `IconNameField`, `FocalField`, `FOCAL_HINT`, `RevealField`, `REVEAL_HINT`, `ContactItem`, type `ContactEntry`, `contactsHint`, `currentProblems`, `AlignField`, `alignHint`, `DataField` and `DATA_HINT`.

Both lists are the public API, held by a test, so a change to a name or a signature is deliberate: adding is a minor change, removing or renaming is a breaking one. Everything else in the kit (`Portrait`, `Marks`, `Badge`, the helpers under `src/foundation`) is private and may change at any time.

**What "fully custom" means.** A layout built on `layout-parts` changes when the kit changes `Frame` or `FittedText`, within that promise. An author who wants nothing to move under them can skip the parts and write plain React and CSS. Every tool still works as long as the rules above hold, with two costs: the layout has to bring its own type, spacing and fitting, and it loses the kit's table and type styling unless it keeps `.kit-frame`.

## Budgets, limit cases and PPTX

- **Budgets** (`budget`, and `variants` for a slot that holds less in some case) count content: words, bullets, lines of code. Lint's `content-budget` rule checks them on the rendered slide, so they hold in every brand. Whether the content fits a brand's type is the overflow rules' job, so state a budget the layout fits in the brands you use, and set `title.maxChars` to the longest title the header takes without overflowing.
- **Limit cases** (`limits.ts`, optional): slides at the edge of the contract, which `deckster layouts check` renders and lints in the brand. The file's default export is a list of `LimitCase` literals (`import type { LimitCase } from '@deckster/kit/limit-cases'`, then `export default [...] satisfies readonly LimitCase[]`). A case has a kebab-case `name`, unique in the file; `frontmatter`, the fields at their limits; `filled`, the named slots to fill besides `body`; and optionally `body: false` to leave the body empty and `bodyMdx`, the body's content when generated prose will not do. `layouts check` adds the title and the eyebrow at their longest, fills every named slot and the body to its budget, and renders the body as a paragraph and, when it takes bullets and has a bullet budget, as a list too. A body that takes no text (bullets only, a chart, a component) therefore needs `bodyMdx`; the generator writes a table for a body that takes only a table, and code for one that takes only code. A layout without `limits.ts` is checked on its `example` only. The kit's own layouts have cases for every variant, and `deckster layouts eject` writes them into `limits.ts`. A `limits.ts` that is not a list of cases is `layout-limits-invalid`.
- **PPTX.** `pptx.type` is the PowerPoint layout kind (`title`, `section`, `content`, `two-content`, `title-only`, `blank`). `pptx.placeholders` lists which rendered text becomes the title, subtitle, body or picture placeholder: each takes `from: { slot }`, `from: { selector }` (a CSS selector inside the slide, such as `.kit-title`) or `from: { field }` (a frontmatter field the layout does not draw). A layout that renders its title with `SlideHeader` maps it with `.kit-title`. Text that no placeholder covers is still exported as native text boxes, and a layout with no mapping exports that way entirely. Check the result with `deckster export <deck> --pptx --dry-run`.

## Names, precedence and replacing a kit layout

Layouts join the catalog in this order: engine, kit, the brand's code layouts, the brand's data layouts, the deck's code layouts. A name is taken once. The only way to take a name that is already there is a code layout whose contract says `replaces: true`, and it may do that only for a kit or engine layout.

| Case                                                  | Result                                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A new name                                            | Added to the catalog.                                                                      |
| A code layout with a kit or engine name               | `layout-name-clash` unless the contract says `replaces: true` (see below).                 |
| `replaces: true` on a name no kit or engine layout has | `layout-contract-invalid`: it replaces nothing. Remove it.                                |
| A brand code layout and a brand data layout, one name | `layout-name-clash`: one brand, one meaning.                                               |
| A deck code layout with a brand layout's name         | `layout-name-clash`, with or without `replaces: true`; rename it.                          |
| A data layout in `layouts.ts` with a kit layout's name | Error from `brand check`: a data layout never replaces a kit layout.                      |
| Two decks with the same layout name                   | Fine: decks never see each other's layouts.                                                |

The clash message says how to fix it:

```
The code layout "content" (brands/acme/layouts/content/contract.ts) has the name of a layout from @deckster/kit.
Fix: Rename the layout's folder and the `name` in its contract and component, or, to replace the @deckster/kit layout, write `replaces: true` in its contract.
```

**Replacing a kit layout.** A brand code layout or a deck code layout may take a kit layout's name, `title` or `content`: in a brand, every deck on the brand gets it; in a deck, only that deck does (unless the deck's brand already replaces it, then the deck layout is a clash). The contract says so with `replaces: true`, which makes a replacement visible in the file and an accidental name reuse fail loudly. The replacement keeps the kit layout's place in the catalog (`deckster layouts --json` lists it where the kit's was, with `source` `brand-code:<brand>` or `deck:<deck>` and `"replaces": "@deckster/kit"`; `--summary` groups it with the brand's or the deck's layouts and adds `replaces the kit's title` under its description). Start from `deckster layouts eject <name>` rather than from nothing, so the copy is compatible from the first minute.

The kit's component and stylesheet for the replaced name are not loaded, so rules you delete from your copy stop applying, with one exception. A stylesheet the replaced layout shares with something that stays loaded still loads, and none of those files is keyed on the replaced layout's name: `display-align.css` while `title`, `section`, `statement` or `image-reveal` stays, the stat card rules (`stat-cards.css`) while a `StatRow` chart is used, and the kit's component and chrome styles, which every slide gets. A rule removed from your copy of one of those shows only once the kit's copy is no longer loaded.

A replacement must keep every deck that used the original compiling and fitting, so the build, `brand check` and `layouts check` compare the contract with the original's:

1. Every field the original requires exists and is required, and every field it accepts is accepted. No field the original leaves optional, or does not have, becomes required. New optional fields are fine.
2. Every slot the original has exists, every required slot stays required, and its `accepts` is a superset. No slot the original leaves optional, or does not have, becomes required. A `body` the replacement does not describe counts as accepting anything.
3. The original's `example` and its limit cases decode against the new schema and pass its `checks()`. A `checks()` that throws, or returns something other than a list of problems, fails this too.
4. Every slide in the workspace's decks on the brand (or in the deck, for a deck layout) that uses the layout decodes against the new schema.
5. A budget, variant budget or title limit that differs, and a variant (matched by name) the replacement adds or drops, is allowed, tighter or looser, and listed as a note: `layout-replace-budget`, naming the original's value. A tighter title limit is checked by the build on existing slides; a tighter word, bullet or line budget by lint's `content-budget`.
6. A kit layout's `pptx` mapping that the replacement lacks is a warning, `layout-replace-pptx`: exported decks lose the placeholders.
7. The title is required exactly when the original requires it.

Failing 1 to 3 or 7 is an error, `layout-replace-breaks`, naming the original's value and the fix, and the replacement is left out: the kit's layout stays in the catalog under its name, and every slide on it fails with the same reasons. Failing 4 is the same error on the replacement's `contract.ts` in `brand check` and `layouts check`, naming the slide; the replacement stays in the catalog, and the build and `lint` fail that slide with the ordinary `schema` error. The warning and the notes fail nothing: `brand check` and `layouts check` print them as `warning` and `note` lines, and `deckster layouts` does not. A kit release that adds a layout with the name of one of yours is a clash with the message above: rename yours, or add `replaces: true` if yours should win.

## The version range

A brand or a deck with code layouts may say which deckster versions they were written for:

- a brand: `brands/<name>/brand.json` with `{ "deckster": ">=0.9 <0.11" }`;
- a deck: `deckster: '>=0.9 <0.11'` in `deck.config.ts`.

The ranges here are examples: write the one that holds the versions you tested on, and make sure it includes the installed one (`deckster --version`).

A range is comparators joined by spaces, all of which must hold. A comparator is an operator (`>=`, `>`, `<=`, `<` or `=`, the default) and a version of one to three numbers. A version with fewer than three numbers stands for every version that starts with it: `<0.11` ends before 0.11.0, `<=0.10` includes every 0.10.x, `>0.10` starts at 0.11.0, and `0.10` or `=0.10` means any 0.10.x. A prerelease suffix on the installed version is ignored. Carets, tildes, hyphen ranges and `||` are not read, and a range that cannot be read is a `layout-version` problem too, whose message shows the accepted form.

When the installed deckster is outside the range, none of that brand's or deck's code layouts load, and nothing of them is imported. Each slide that uses one fails with `layout-version`, `deckster layouts` warns once, and `brand check` reports it as an error. The message names the range, the file and the installed version: `The code layouts of the acme brand are written for deckster >=0.10 <0.12 (brands/acme/brand.json), and this is deckster 0.9.0, so they are not loaded.` The deck's own layouts still load when only the brand's range fails, and the other way round. Leave the range out while the layouts are being written, and set it once they are tested.

## Problems

Problems are values, so a broken layout is left out and every other layout still works. Each message names the file and ends with a fix. Only errors fail anything.

| Problem                    | Level   | When                                                                         |
| -------------------------- | ------- | ---------------------------------------------------------------------------- |
| `layout-folder-incomplete` | error   | a `layouts/<name>/` without `contract.ts` or `layout.tsx`                    |
| `layout-name-mismatch`     | error   | the folder name and `contract.name` (or the name in `layout.tsx`) differ     |
| `layout-name-clash`        | error   | the name is a kit, engine or brand layout and the contract has no `replaces`; or a deck layout takes a brand layout's name |
| `layout-contract-imports`  | error   | `contract.ts` (or `limits.ts`) imports something a contract may not          |
| `layout-contract-invalid`  | error   | the contract loads but fails the build's contract checks: a name that is not kebab-case, no description, a field every slide already has, a slot name that is not camelCase or shadows a component, a slot without a description, an unknown content kind, a budget for a slot it lacks or a limit that is not a positive integer, an example without a body or that fails its own schema, `replaces` that is not `true`, or `replaces: true` on a name nothing has |
| `layout-load-failed`       | error   | `contract.ts` throws or has no default export; or `layout.tsx` throws on import or render, on the slides that use it |
| `layout-held`              | error   | an agent turn started before the contract was ever loaded                    |
| `layout-version`           | error   | the declared `deckster` range does not include the installed version, or cannot be read |
| `layout-code-skipped`      | error   | a slide uses a code layout `brand add` left out, or one only another brand has |
| `layout-fallback-unavailable` | error | a data layout in `layouts.ts` falls back to a brand code layout that did not load |
| `layout-replace-breaks`    | error   | a replacement fails the compatibility check (items 1 to 4 and 7 above)      |
| `layout-replace-pptx`      | warning | a replacement lacks the replaced layout's PPTX mapping                       |
| `layout-replace-budget`    | note    | a replacement's budget or title limit differs from the replaced layout's     |
| `layout-limits-invalid`    | error   | `limits.ts` loads but is not a list of limit cases, names a case `example` or has frontmatter a slide cannot hold; found by `layouts check` only |
| `layout-not-rendered`      | error   | `layouts check` could not render the layout's slides because the generated deck did not build, and nothing else fails the layout |

Where they show:

- **`deckster layouts`** prints one warning per problem that leaves a layout out on stderr, and the same in `warnings` with `--json`: `The code layout "<name>" is left out (<problem id> in <file>): <message> Fix: <fix>`, or `Code layouts are left out (<id>): ...` for a problem with all of a brand's or deck's layouts, such as `layout-version`. It does not print warnings or notes of a replacement that joined.
- **`deckster brand check <name>`** reports a brand's code layout problems as `error <problem id>: <message>` with a `Fix:` line under the layout's file, and exits 1. `layout-replace-pptx` and `layout-replace-budget` print as `warning` and `note` lines and do not fail it. With `--json`, each entry of `errors` or `warnings` has `code` (the problem id), `layout`, `file`, `message` and `fix`, and a warning or note has `level`.
- **`deckster layouts check`** lists the same problems and then the lint findings of the rendered example and cases, each as `error   <id> (<file>, case <case>, slide <slide>[, step <n>], <selector>): <message>` with a `Fix:` line, for example `error   slot-content (brands/acme/layouts/kpi-wall/limits.ts, case full-body, slide kpi-wall-full-body-text, [data-slot="body"]): The body slot holds text; the kpi-wall layout takes bullets there.` A layout with an error before rendering is not rendered, and its line says `not rendered`. Exit 1 when any layout has an error.
- **`deckster lint`** and the build fail each slide that uses an unusable layout, with the problem's own id as the rule (`layout-replace-breaks`, `layout-version`, `layout-code-skipped` and the others), as an error at the slide. That replaces `schema` for these slides, with one exception: a slide that does not fit a replacement that stayed in the catalog (item 4 above) is a `schema` error. A `layout.tsx` that throws is reported under `layout-load-failed` in place of `render-error`.

No new slide lint rules exist for code layouts: budgets, slot checks, overflow and fit rules all work from the contract and the DOM.

## Dev server reload

- An edit to a `layout.tsx`, a `.tsx` helper or a `.css` file inside a layout folder (or `_shared/`) is applied by Vite's hot update, with no page reload.
- Anything else under `layouts/` (a `contract.ts`, a `.ts` helper, `limits.ts`, a file or folder added or removed), a change to `brand.json`, and a change to `deck.config.ts` loads the contracts again and reloads the page, because every slide is validated against the contracts.
- A broken `layout.tsx` fails only the slides that use it, with a message that starts "Layout `<name>` failed to load".

## Agents

The chat agent in `deckster dev --agent` cannot write layout code. Its turn may only change slide files and the deck's `assets/`, and layouts, contracts, brands and stylesheets are off limits. It can read the code layouts through its `catalog` tool and use them in slides. During a turn the contracts are held: a contract is not evaluated again until the turn ends, the agent sees the last version loaded, and a contract that was never loaded before the turn is `layout-held`. Write layouts in the editor or with a coding agent, outside the chat panel.

## Fetched brands

`deckster brand add` copies data only: `brand.ts`, `layouts.ts`, images, fonts and documents. Code layouts (`layouts/<name>/` folders with a `contract.ts` or `layout.tsx`) and every other code file are left out and listed under "Left out", and no code of a fetched brand is run. It always writes `brands/<name>/.deckster-source.json`, `{ "source", "commit", "codeLayoutsSkipped" }`: where the brand came from (without credentials), the commit fetched (`null` when unknown) and the sorted names of the code layouts it left out. Adding the brand again replaces the file. A slide that uses a skipped layout fails with `layout-code-skipped`, whose message names the layout, says that `brand add` left it out and gives the source to read. To use one: read the code in the brand's own repository, then copy its `layouts/<name>/` folder, and what it imports from `layouts/_shared/`, into `brands/<name>/layouts/`, and run `deckster layouts check --brand <name>`. That is code that runs on your machine in Node and in the browser, so read it first. A brand shared inside a team's own repository never goes through `brand add`.

## Commands

```
deckster layouts new <name> (--brand <brand> | --deck <deck>)
deckster layouts check [<name>] (--brand <brand> | --deck <deck>)
deckster layouts eject <name…> (--brand <brand> | --deck <deck>) [--keep-shared]
deckster layouts eject --all --brand <brand> [--keep-shared]
deckster layouts diff <name> (--brand <brand> | --deck <deck>) [--fail-on-change]
```

All of them take `--json`. Exactly one of `--brand` and `--deck` is required, and the brand must be a folder of the workspace, not the framework's built-in `default`. The words `new`, `check`, `eject` and `diff` after `deckster layouts` start these subcommands, so a deck of one of those names is listed with `DECK=<name> deckster layouts`.

- **`new`** writes `layouts/<name>/` with four files that pass `layouts check`, `brand check`, `lint` and the build as they are: a `contract.ts` with one `body` slot (text or bullets), a required title, an eyebrow, a description, an `example` and a PPTX mapping of the title (`.kit-title`) and body; a `layout.tsx` with `Frame`, `SlideHeader` and `Region`; a `layout.css` with the `@layer` line and rules keyed on the layout; and a `limits.ts` with one case, `full-body`. It prints the files and a `Next:` line, and with `--json` `{ ok, layout, brand, deck, dir, files, next }`. It refuses, and writes nothing, for a name that is not kebab-case (at most 64 characters), a folder that exists, a kit or engine layout (to replace one, use `eject`, or write the folder by hand with `replaces: true`), a data layout of the brand, and, for a deck, a code layout of the deck's brand.
- **`check`** runs the contract, import, parity and replacement checks above for the brand's or the deck's code layouts, or for the one named; loads each `limits.ts`; then renders every layout without an error in the lint server, in a temporary workspace that is removed afterwards (nothing is written to yours): its `example`, and each limit case with the title, the eyebrow and the slots filled to their limits, in the deck's brand or, for a brand's layouts, in that brand. It reports the slide lint rules (overflow, budgets, contrast, off-brand values, slot content) under the layout and the case, and skips the rules about a deck as a talk (`layout-repetition`, `few-builds`, `time-budget`, `open-comments`, `missing-notes`, `brand-layout-fallback`) and `info` findings. Plain output is one line per layout, `<name>: ok (<cases>)` or `<name>: fails, N problems (<cases>)` with the problems below it, then `The <brand|deck> <name>: N of M layouts pass (E errors, W warnings[, K notes]).` With `--json`: `{ ok, brand, deck, dir, layouts: [{ name, dir, cases, ok, problems }], problems }`, where each problem is `{ severity, code, file, message, fix, case?, slide?, step?, selector? }` and the top-level `problems` belong to no layout (such as `layout-version`). Exit 0 when no layout has an error (warnings and notes do not fail), 1 when one does or the command fails (an unknown brand, deck or layout, a bad command line). Run it after every change to a layout, and before sharing a brand. Rendering is the slow part (all 64 kit layouts ejected, 393 cases, took about 2.5 minutes), so name the layout while iterating.
- **`eject`** copies a kit layout into the brand or the deck as a code layout that replaces it. See below.
- **`diff`** shows what the kit changed in an ejected layout since you copied it. See below.

### Eject and diff

`deckster layouts eject title --brand acme` writes `brands/acme/layouts/title/` (`--deck demo` writes `decks/demo/layouts/title/`):

- `layout.tsx`, `contract.ts` with `replaces: true`, `layout.css`, and `limits.ts` with the kit's limit cases for the layout as literals. A copy renders the same as the kit layout until you change it. Eject keeps the layout's name, because the CSS, the PPTX selectors and the display rules are keyed on it, so the copy is a replacement and must keep passing the compatibility check. The kit's component and stylesheet are no longer loaded for that brand or deck (see [replacing](#names-precedence-and-replacing-a-kit-layout) for what still is).
- Imports of kit parts point at the public entry points: `@deckster/kit/layout-parts`, `@deckster/kit/layout-fields`, `@deckster/kit` and `@deckster/kit/diagrams`. A helper with no public home (`Portrait`, `MonoMark` and similar) is copied once into `layouts/_shared/` and imported relatively by every ejected layout that needs it. The classes of a copied helper's own stylesheet are renamed from `kit-…` to `own-…` in a brand (`.own-portrait`) and to `dck-…` in a deck, so your copy, the kit's helper and your brand's copy never style each other. A kit layout with no stylesheet of its own (`demo`) gets an empty `layout.css` that `layout.tsx` imports.
- A stylesheet the layout shares with other kit layouts (`display-align.css`, `image-scrim.css` for `title` and `image`, `stat-cards.css` for `stats`) is copied into the layout's folder with every rule scoped to the layout through `:where(…)`. The classes such a stylesheet owns, the ones only it and the kit layouts' own files use, are renamed like a helper's in the copy and in the layout's files (`.kit-image-scrim` becomes `.own-image-scrim` in a brand, `.dck-image-scrim` in a deck), so the kit's copy, which stays loaded while the kit's `title` or `image` is used, never styles your copy, and your copy never styles theirs. Classes that kit components outside the layouts render (`.kit-eyebrow`, `.kit-backdrop`, `.kit-stat-value`) keep their names, so the kit's own `display-align.css` and `stat-cards.css` still apply while another kit layout or chart loads them, and a rule you remove from your copy of one of those two shows only once that is no longer so.
- `.eject/` in the layout's folder: every file as written, the helpers under `.eject/_shared/`, and `eject.json` (`{ layout, deckster, files: { <path>: <sha256> } }`). Leave it as it is: `diff` reads it. Discovery and `brand add` skip dot folders, so it never travels by accident.

Eject refuses, and writes nothing, for a name that is not a kit layout (it names the closest one; `brand`, the renderer of data layouts, is not one), a layout whose folder exists (use `diff`, or delete the folder to start over), a brand outside the workspace, `--all` with `--deck` (a deck takes the layouts you name), a deck layout that its brand already replaces, a brand layout whose name one of the brand's decks already has a layout folder of (when you name the layouts; `--all` skips those), and a helper in `layouts/_shared/` that differs from the one it would write because you edited it. `--keep-shared` keeps your helper, and the new layout uses it as it is; a helper that is already there and identical is reused. It prints the files, the helpers it reused or kept, and a `Next:` line; with `--json`, `{ ok, brand, deck, layouts: [{ name, dir, files }], shared: { written, reused, kept }, skipped, warnings, next }`.

`eject --all --brand <brand>` ejects every kit layout the brand has no folder for (64 of them) and leaves the rest out without failing: `skipped` lists the ones whose folder exists, and `skippedForDecks` the ones a deck of the brand has a layout folder of and warns that from then on kit fixes reach them only through `layout-parts` and `layout-fields`. After an upgrade, run `diff` on each to see what you missed. The copy is yours from then on.

`deckster layouts diff title --brand acme` ejects the current kit layout in memory with the same transform, compares the result with `.eject/` and prints a unified diff on standard output, one patch per file that changed (helpers in `_shared/` included). The `-` lines are what you ejected, the `+` lines are the kit now. Your own edits play no part and nothing is applied: carry over the changes you want by hand. When nothing changed it says `The kit's title is the same as when it was ejected (deckster 0.9.0; this is 0.9.0).` The explanations go to standard error, so the patch can be piped: how many files changed, a warning when the kit's layout no longer ejects cleanly (it needs a private import with no place in a copy), and a warning when a file in `.eject/` was changed after the eject. The exit code is 0, or 1 with `--fail-on-change` when the kit changed the layout or it no longer ejects cleanly; a layout with no `.eject/eject.json` fails with exit 1. With `--json`: `{ ok, brand, deck, layout, dir, ejectedWith, current, changed, files: [{ path, status, diff }], problems, provenanceEdited }`, with `status` `unchanged`, `changed`, `added` or `removed`.

Not in this version: ejecting under another name (`--as`), applying a diff (`diff --apply`), a deck layout replacing a brand layout, a static `fallback` on a code layout, agent-written deck layouts, and `brand add --allow-code`.

## Before handing over

1. `deckster layouts check --brand <brand>` (or `--deck <deck>`) passes, and `deckster brand check <brand>` has no error.
2. `deckster layouts <deck> --summary` lists the layout where you expect it, with the budgets you meant, and prints no warning.
3. Every slide that uses it lints clean, in each brand the deck must support. A code layout of a brand exists only in that brand: the same deck in another brand fails on those slides (a data layout falls back to its kit layout, a code layout has no fallback), so use a kit layout for slides that must travel between brands.
4. You have opened the screenshots of the example and of a slide at the budget's limits.
5. `deckster export <deck> --pptx --dry-run` shows the title and body as native text, and the layout name appears in its list.
