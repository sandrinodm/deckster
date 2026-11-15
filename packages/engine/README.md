# @deckster/engine

The React runtime that renders a deckster deck, plus the typed contracts (deck config, slide
frontmatter, layout contracts, MDX extensions) that the build and the CLI check decks against.

It is a private workspace package: not published to npm, consumed as `workspace:*` by the other
`@deckster/*` packages and by every deck, and it exports TypeScript source with no build step. Its only
dependencies are React, React DOM and `effect` (for `Schema` in the contracts).

## What it does

- `<Deck>` renders a deck manifest full-window. It draws a 1920x1080 canvas scaled to the window and
  mounts the current slide and one neighbour on each side. Plugin chrome, stages and overlays go
  around it. With `?static` in the URL, every slide mounts.
- Each slide has one integer step. `<Step at={n}>` reveals its children from step `n` on, and
  `useStep()` reads the current step. Going back into a slide lands on its last step.
- Keyboard: arrows, Space, PageUp and PageDown move one step (Shift+Space moves back). Home and End
  jump to the first and last slide. Mouse: left click forward, right click back, unless the deck
  config sets `mouseNavigation: false`. Keys typed into a text field are ignored. Clicks on
  interactive content (buttons, links, `[data-deck-interactive]`) and Space pressed on it go to the
  element, not the deck.
- The URL hash is `#/<slide>/<step>`, with a 1-based slide number. A hash you type or link to
  may also name the slide by id (`#/steps/2`).
- `window.__deck` is the automation API `deck shot`, `deck lint`, export and the browser tests use:
  `slides`, `position`, `isStatic`, `goto`, `next`, `prev` and `ready()`.
- `useReadyHold(pending)` makes `ready()` wait for content that loads late. `ready()` also waits
  for fonts and images, and rejects after 30 seconds naming the held slides.
- `<SlideView slide step>` renders any slide inside `<Deck>` for thumbnails and presenter panes. It
  is inert by default and never changes the deck's step count.
- Plugins (`definePlugin`) add layouts, MDX components, chrome, stage wrappers, overlays and key and
  click handlers. Later plugins override earlier ones on a name clash. The engine itself ships only
  an unstyled `default` layout; `@deckster/kit` replaces it.
- `start-errors.ts` shows a panel naming the file when the page breaks before the deck mounts, for
  example a slide that imports a name its module does not export.

## Exports

| Import                         | What it holds                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@deckster/engine`             | `Deck`, `SlideView`, `Canvas`, `Step`, `useStep`, `useStepAt`, `Notes`, `useDeck`, `useSlide`, `useReadyHold`, `useStatic`, `defineLayout`, `definePlugin`, `useLayouts`, `isInteractiveTarget`, and the manifest and contract types |
| `@deckster/engine/config`      | `defineDeck` and the `DeckConfig` schema for `deck.config.ts`                                                                                                                                                                        |
| `@deckster/engine/frontmatter` | The `SlideFrontmatter` schema every slide accepts (`layout`, `title`, `surface`, `background`, `budget`) and its fix hints                                                                                                           |
| `@deckster/engine/layout`      | `defineLayoutContract`, `defineLayoutCatalog`, and the budget and variant helpers (`slideBudget`, `matchingVariants`, `slideFieldLimits`) the build and `deck lint` use                                                              |
| `@deckster/engine/catalog`     | The engine's own layout catalog (the `default` contract), loaded before any plugin's                                                                                                                                                 |
| `@deckster/engine/manifest`    | `DeckManifest`, `SlideEntry`, `SlideMeta`: the shape of `virtual:deck`                                                                                                                                                               |
| `@deckster/engine/slots`       | `BODY_SLOT`, `slotTag` and the element names the slot compiler writes                                                                                                                                                                |
| `@deckster/engine/names`       | `KebabName` and `KEBAB_CASE_PATTERN` for slide, layout and brand names                                                                                                                                                               |
| `@deckster/engine/mdx`         | `defineMdxExtension` and its types, for build-time remark and rehype plugins                                                                                                                                                         |
| `@deckster/engine/app`         | The page entry (`main.tsx`); `@deckster/vite-plugin` serves its folder's `index.html`                                                                                                                                                |

Every subpath except the root and `app` is safe to load in Node: no JSX and no runtime React, so
`@deckster/vite-plugin` and the CLI import them while building and linting.

The app entry imports `virtual:deck` and `virtual:deck/plugins`, so it only runs under
`@deckster/vite-plugin`. To see a deck, run `pnpm deck dev hello` from the repository root.

## Usage

A TSX slide imports its parts from the root export. This is
[`decks/hello/slides/live-counter.tsx`](../../decks/hello/slides/live-counter.tsx):

```tsx
import type { ReactNode } from 'react';

import { Notes, Step, useStep, type SlideFrontmatterInput } from '@deckster/engine';

export const frontmatter = {
  title: 'A TSX slide',
  surface: 'accent',
  budget: '45s',
} satisfies SlideFrontmatterInput;

export default function LiveCounter(): ReactNode {
  const step = useStep();
  return (
    <div>
      <h2>A TSX slide</h2>
      <p data-testid="live-step">This slide is on step {step}.</p>
      <Step at={1}>
        <p>TSX slides use the same steps as MDX slides.</p>
      </Step>
      <Notes>TSX is the escape hatch for slides that need real code.</Notes>
    </div>
  );
}
```

The build reads `frontmatter` without running the slide, so it must stay a literal. `at` is
required: a bare `<Step>` fails an MDX build and renders an error in TSX.

A deck's config uses `defineDeck` ([`decks/hello/deck.config.ts`](../../decks/hello/deck.config.ts)):

```ts
import { defineDeck } from '@deckster/engine/config';

export default defineDeck({
  title: 'Hello, deck',
  brand: 'default',
  slides: ['title', 'steps', 'live-counter', 'closing'],
});
```

A layout is a Node-safe contract and a browser component, joined by name. The smallest complete one
is the plugin test fixture in
[`packages/vite-plugin/e2e/fixtures/layouts`](../vite-plugin/e2e/fixtures/layouts):

```ts
// columns-layout.contract.ts: loaded in Node by the build and by deck lint
import { defineLayoutContract } from '@deckster/engine/layout';
import { Schema } from 'effect';

export const columnsContract = defineLayoutContract({
  name: 'columns',
  description: 'The body as a heading above two columns.',
  schema: Schema.Struct({ gap: Schema.optionalKey(Schema.Literals(['tight', 'loose'])) }),
  slots: {
    body: { description: 'The heading.', accepts: ['heading'] },
    left: { description: 'The claim.', required: true, accepts: ['bullets', 'text'] },
    right: { description: 'The evidence.', required: true, accepts: ['component', 'image'] },
  },
  budget: { left: { maxBullets: 4 } },
  example: {
    frontmatter: { gap: 'loose' },
    body: '## Heading\n\n<Left>\n- Claim\n</Left>\n\n<Right>\nEvidence\n</Right>\n',
  },
});
```

```tsx
// columns-layout.tsx: the component, typed by the contract
import type { ReactNode } from 'react';

import { defineLayout, type LayoutProps } from '@deckster/engine';

import type { columnsContract } from './columns-layout.contract.ts';

function ColumnsLayout({ slots, frontmatter }: LayoutProps<typeof columnsContract>): ReactNode {
  return (
    <div data-layout="columns" data-gap={frontmatter.gap ?? 'tight'} style={{ padding: 96 }}>
      <header>{slots.body}</header>
      <div style={{ display: 'flex', gap: 64 }}>
        <div data-column="left">{slots.left}</div>
        <div data-column="right">{slots.right}</div>
      </div>
    </div>
  );
}

export const columnsLayout = defineLayout<typeof columnsContract>({
  name: 'columns',
  component: ColumnsLayout,
});
```

The contract goes in a catalog (`defineLayoutCatalog`, listed in `layoutCatalogs` of
`@deckster/vite-plugin`) and the component in a runtime plugin (`definePlugin({ name, layouts })`,
listed in `runtimePlugins`). A slide that names a layout with no contract fails to build. The kit's
layouts in [`packages/kit/src/layouts`](../kit/src/layouts) follow the same pattern.

`window.__deck` can be driven from any browser automation. Against `pnpm deck dev hello` opened with
`?static`:

```js
await window.__deck.ready();
window.__deck.slides.map((slide) => [slide.id, slide.stepCount]);
// [["title",1],["steps",4],["live-counter",2],["closing",1]]
window.__deck.goto('steps', 2);
window.__deck.position; // {"slide":1,"step":2}
location.hash; // "#/2/2"
```

`goto` applies synchronously; await `ready()` before you capture the page. It throws a
`RangeError` for a slide that does not exist.

## Rules for changing the engine

- `window.__deck`, the virtual modules, the deck config and frontmatter schemas and the layout
  contract shape are public surface. The CLI, export, presenter and comments packages read them.
  Changing one is a feature, not a refactor.
- Keep the contract files (`src/contract/`, `*.contract.ts`, `src/layouts/catalog.ts`) Node-safe:
  no JSX, no React, no CSS imports. A layout component imports its contract only as a type, so the
  browser bundle never carries the schema.
- `effect` is for `Schema` in the contracts only. Components and hooks stay plain React.
- Only `<Deck>` owns window-level behaviour: keyboard navigation, the hash and `window.__deck`. A
  plugin claims keys through `onKeyDown` and clicks through `onPointer`, never with its own window
  listener. A `stage` wrapper must render the canvas it is given and must not be
  `[data-deck-interactive]`, or clicks stop navigating.
- Motion reads `useStatic()` and renders its end state in static mode, so shots, lint and export
  see finished frames.
- A component whose final look arrives late (async highlighting, a lazy chunk, an iframe) calls
  `useReadyHold`. Release the hold in the same render that shows the final content, so steps it
  registers are counted before `ready()` resolves.

[docs/design.md](../../docs/design.md) explains why the engine is its own runtime.

## Tests

Unit tests sit beside the code (`*.test.ts`, `*.test.tsx`, run in happy-dom where they render):

```sh
pnpm --filter @deckster/engine test
pnpm --filter @deckster/engine typecheck
```

The browser suite in `e2e/` drives the hello deck in Chromium. Its runner starts
`pnpm deck dev hello --port 5199` itself. Install the browser once, then run one file or all:

```sh
pnpm --dir packages/engine exec e2e-web install chromium
cd packages/engine && pnpm e2e navigation.e2e.ts
```

Every e2e test fails when the page logs a console error or warning.
