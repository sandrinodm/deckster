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
- Slide transitions: every stage slide carries `data-slide-state` (`past`, `current`, `future`)
  and `data-direction`, and `data-transition` when the move it belongs to names its own kind. A
  slide's `transition:` frontmatter sets the move between it and the slide before it, both ways:
  going forward onto it, and going back from it, which plays the same transition reversed. A move
  to a slide that is not a neighbour cuts (`none`). Without a `transition:`, the brand's applies.
  The engine draws nothing itself; `@deckster/kit`'s motion stylesheet does.
- Morphs: an element marked `data-morph="<name>"` (the kit's `<Morph id>`) on one slide and an
  element with the same name on the next fly from one place to the other when a key, a click or
  the deck's controls move between the two, while the slides run their own transition. It is a
  view transition scoped to the canvas, so `SlideView` copies never take part. Static mode, reduced
  motion, `window.__deck` moves and browsers without scoped view transitions get the plain move.
- Keyboard: arrows, Space, PageUp and PageDown move one step (Shift+Space moves back). Home and End
  jump to the first and last shown slide. Mouse: left click forward, right click back, unless the deck
  config sets `mouseNavigation: false`. Keys typed into a text field are ignored. Clicks on
  interactive content (buttons, links, `[data-deck-interactive]`) and Space pressed on it go to the
  element, not the deck.
- Hidden slides: a slide with `hidden: true` in its frontmatter stays in the deck and the build, but
  next, previous, Home and End skip it (the navigation reducer does this, so every input gets it).
  A hash, `window.__deck.goto` and the presenter still reach it, and from there next and previous
  step through its own steps before leaving. The deck without a hash starts on the first shown
  slide. Numbers an author uses (the hash, `goto`, `slides` order) count every slide; the audience's
  count in the embed controls and the kit's page number counts shown slides. `hiddenSlides`,
  `shownSlideIndexes`, `neighbourShownSlide`, `shownPageNumber` and `areShownNeighbours` are the
  helpers other packages use. A deck whose slides are all hidden fails the build.
- The URL hash is `#/<slide>/<step>`, with a 1-based slide number. A hash you type or link to
  may also name the slide by id (`#/steps/2`).
- Embed mode, for showing one slide of a built deck in an iframe on another page: add `?embed`
  (on and off like `?static`), as in `<iframe src="/decks/layouts/?embed#/team-grid">`. Plugins
  keep only their layouts, components and chrome, so the presenter tools, comments and agent panel
  are not mounted. A small control at the bottom offers previous and next, "Slide n of N" and an
  "Open full deck" link to the same position in a new tab; it scales with the frame, shows only
  icons and "n/N" in a narrow one, and fades out after 2 seconds without input until the pointer
  moves, a key is pressed or keyboard focus enters it. The deck never takes focus by itself,
  so keys reach it only after the reader clicks into the frame, and moves replace the history entry
  instead of adding one. The slide still scales to the frame and the hash still addresses it.
- `window.__deck` is the automation API `deckster shot`, `deckster lint`, export and the browser tests use:
  `slides` (each with `id`, `stepCount` and `hidden`), `position`, `isStatic`, `goto`, `next`, `prev` and `ready()`.
- `useReadyHold(pending)` makes `ready()` wait for content that loads late. `ready()` also waits
  for fonts and images, and rejects after 30 seconds naming the held slides.
- `<SlideView slide step>` renders any slide inside `<Deck>` for thumbnails and presenter panes. It
  is inert by default and never changes the deck's step count.
- Plugins (`definePlugin`) add layouts, MDX components, chrome, stage wrappers, overlays and key and
  click handlers. Later plugins override earlier ones on a name clash. The engine itself ships only
  an unstyled `default` layout; `@deckster/kit` replaces it.
- `lazyLayout(name, load)` registers a layout whose component loads the first time a slide uses it.
  `@deckster/vite-plugin` uses it for the code layouts in a deck or brand folder (`layouts/<name>/`),
  with `load` a dynamic `import()` of the `layout.tsx`, whose default export must be a `defineLayout`
  result with the same name. `ready()` waits for the load. A layout whose file fails to import,
  exports something else or throws while rendering replaces only the slides that use it with the
  problem panel ("Layout `kpi-wall` failed to load: ..."); the other slides keep working. A layout's
  `bleed` names no edges until it has loaded, and what reads it through `useLayouts()` renders again
  when the load finishes. A new `virtual:deck/plugins` module, such as an edited layout file, is
  picked up in place by hot reload.
- Every slide's `<section>` carries `data-deck-layout`, the layout name from its frontmatter (the
  default layout's name for a slide that names none). Export reads the layout from it, so it does not
  depend on the markup a layout draws. The failure panel above is `[data-slide-error]` with
  `data-deck-problem="layout-load-failed"` and `data-deck-problem-layout="<name>"`, which tools can
  tell from an ordinary render error.
- A filled slot is wrapped in `<span class="deck-slot" data-slot="<name>">` (`display: contents`).
  Layouts receive a wrapper element with `data-slot` and `children` props. Use
  `cloneElement(slot, {}, children)` to keep the measurable span around rebuilt content. Error
  boundaries travel with the slide's original content wherever the layout renders it. A component
  the layout adds inside the cloned slot reports its own failure as a layout problem. Guarded
  components keep their props, children and keys and render through an engine stand-in type. HTML
  elements and fragments keep their types, and their children are guarded through arrays and
  iterables. The engine leaves a component's own children intact for the component to render.
- `start-errors.ts` shows a panel naming the file when the page breaks before the deck mounts, for
  example a slide that imports a name its module does not export.

## Exports

| Import                         | What it holds                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@deckster/engine`             | `Deck`, `SlideView`, `Canvas`, `Step`, `useStep`, `useStepAt`, `Notes`, `useDeck`, `useSlide`, `useReadyHold`, `useStatic`, `defineLayout`, `lazyLayout`, `definePlugin`, `useLayouts`, `isInteractiveTarget`, `MORPH_ATTRIBUTE`, the shown-slide helpers (`hiddenSlides`, `shownSlideIndexes`, `neighbourShownSlide`, `shownPageNumber`, `areShownNeighbours`), and the manifest and contract types |
| `@deckster/engine/config`      | `defineDeck` and the `DeckConfig` schema for `deck.config.ts`                                                                                                                                                                                                                                                                                                                                        |
| `@deckster/engine/frontmatter` | The `SlideFrontmatter` schema every slide accepts (`layout`, `title`, `surface`, `background`, `budget`, `transition`, `hidden`), its fix hints and `TRANSITION_KINDS`, the list `@deckster/brand` also validates against                                                                                                                                                                            |
| `@deckster/engine/layout`      | `defineLayoutContract`, `defineLayoutCatalog`, and the budget and variant helpers (`slideBudget`, `matchingVariants`, `slideFieldLimits`) the build and `deckster lint` use                                                                                                                                                                                                                          |
| `@deckster/engine/catalog`     | The engine's own layout catalog (the `default` contract), loaded before any plugin's                                                                                                                                                                                                                                                                                                                 |
| `@deckster/engine/manifest`    | `DeckManifest`, `SlideEntry`, `SlideMeta`: the shape of `virtual:deck`                                                                                                                                                                                                                                                                                                                               |
| `@deckster/engine/slots`       | `BODY_SLOT`, `slotTag` and the element names the slot compiler writes                                                                                                                                                                                                                                                                                                                                |
| `@deckster/engine/names`       | `KebabName` and `KEBAB_CASE_PATTERN` for slide, layout and brand names                                                                                                                                                                                                                                                                                                                               |
| `@deckster/engine/mdx`         | `defineMdxExtension` and its types, for build-time remark and rehype plugins                                                                                                                                                                                                                                                                                                                         |
| `@deckster/engine/app`         | The page entry (`main.tsx`); `@deckster/vite-plugin` serves its folder's `index.html`                                                                                                                                                                                                                                                                                                                |

Every subpath except the root and `app` is safe to load in Node: no JSX and no runtime React, so
`@deckster/vite-plugin` and the CLI import them while building and linting.

The app entry imports `virtual:deck` and `virtual:deck/plugins`, so it only runs under
`@deckster/vite-plugin`. To see a deck, run `pnpm deckster dev hello` from the repository root.

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
// columns-layout.contract.ts: loaded in Node by the build and by deckster lint
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

A brand or a deck can ship layouts as code instead, in `layouts/<name>/contract.ts` and
`layout.tsx`; `@deckster/vite-plugin` loads them (see its README), and the contract may set
`replaces: true` to take the place of a kit or engine layout of the same name. A deck config may
also set `deckster`, the range of deckster versions the deck's own code layouts were written for,
such as `>=0.10 <0.12`; the build refuses to load them on another version.

The contract goes in a catalog (`defineLayoutCatalog`, listed in `layoutCatalogs` of
`@deckster/vite-plugin`) and the component in a runtime plugin (`definePlugin({ name, layouts })`,
listed in `runtimePlugins`). A slide that names a layout with no contract fails to build. The kit's
layouts in [`packages/kit/src/layouts`](../kit/src/layouts) follow the same pattern.

`window.__deck` can be driven from any browser automation. Against `pnpm deckster dev hello` opened with
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
`RangeError` for a slide that does not exist. `goto`, `next` and `prev` never morph: a morph that
a key press started and has not applied yet is applied first, and one that is playing ends, so
the API always moves from where the deck really is.

## Rules for changing the engine

- `window.__deck`, the virtual modules, the deck config and frontmatter schemas and the layout
  contract shape (including `replaces`) are public surface. The CLI, export, presenter and comments packages read them.
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
- The keys, clicks and `useDeck()` controls go through the morph dispatcher, so a move between two
  slides that share a morph applies one frame later, inside the view transition. `window.__deck`
  dispatches directly and stays synchronous. Keep the two paths apart when you add a move.
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
`pnpm deckster dev hello --port 5199` itself. Install the browser once, then run one file or all:

```sh
pnpm --dir packages/engine exec e2e-web install chromium
cd packages/engine && pnpm e2e navigation.e2e.ts
```

Every e2e test fails when the page logs a console error or warning.
