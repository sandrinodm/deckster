# @deckster/kit

The layouts and components every deckster deck gets: 23 brand-aware layouts, plus code, media,
link, chart, diagram and mini-app components, and the build-time MDX extension and Vite plugins
behind them.

It is a private workspace package (`workspace:*`, TypeScript source, nothing built or published).
`@deckster/vite-plugin` loads it into every deck. A deck lists it in its own `package.json` only when
a TSX slide imports from it, as `decks/showcase` does.

## What a slide sees

An MDX slide picks a layout in its frontmatter and uses kit components without imports. This is
`decks/layouts/slides/cards-principles.mdx`:

```mdx
---
layout: cards
title: Three rules decide where a tree goes
eyebrow: Planting principles
cards:
  - icon: thermometer
    title: Hottest blocks first
    text: Rank blocks by July surface heat; plant from the top.
  - icon: trees
    title: Large species only
    text: 'Plane, oak and lime: crowns that shade the road.'
  - icon: droplets
    title: Three summers of care
    text: Water, mulch and check every tree for three years.
budget: 40s
---

Every block in the ten-year plan passes all three.
```

The build checks `cards` against the layout's contract, resolves each `icon` against the brand's
icon set (an unknown name fails the build), and `deck lint` holds the slide to the layout's budget.

A TSX slide imports the same components:

```tsx
import { Live } from '@deckster/kit';
import { Edge, Flow, Journey, Node, State } from '@deckster/kit/diagrams';
```

## Finding what is in it

The CLI prints the kit's catalogs. Run these from the repository root:

```sh
pnpm deck layouts --summary    # every layout: surface, title limit, slots and budgets
pnpm deck charts               # charts and number figures: when to use each, props, example
pnpm deck diagrams             # Flow, SequenceDiagram, Timeline, Layers, Cycle, Tree, Svg and their parts
pnpm deck components           # Code, Terminal, Image, Video, Icon, Button, AppFrame, Live...
pnpm deck icons --search rocket
```

Each takes `--json`. The first lines of `deck layouts --summary`:

```console
default     surface default   title any
            One column of content under an accent rule, centred on the slide: a heading with a lead paragraph, or a heading with a short list.
            slots: body* heading/text/bullets/image/component 80 words 6 bullets
title       surface gradient  title <= 36
            The cover of a deck: the deck title set large on the bottom line, a one-line subtitle, and who is presenting and when.
            slots: body text 14 words; <Media> image
```

## Exports

| Import                              | Runs in | What it is                                                                                                                                                                                  | Used by                                  |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `@deckster/kit`                     | browser | Components for TSX slides: `Step`, `Code`, `CodeMove`, `CodeStep`, `Terminal`, `Cmd`, `Out`, `Image`, `Video`, `Lottie`, `Icon`, `Button`, `Download`, `LinkCard`, `QR`, `AppFrame`, `Live` | slides                                   |
| `@deckster/kit/diagrams`            | browser | Diagram components and parts for TSX slides (`Flow`, `Node`, `Edge`, `Packet`, ...)                                                                                                         | slides                                   |
| `@deckster/kit/runtime`             | browser | The runtime plugin: registers every layout, every MDX component and the page chrome                                                                                                         | `@deckster/vite-plugin`                  |
| `@deckster/kit/catalog`             | Node    | The layout contracts, loaded by the build and `deck layouts`                                                                                                                                | `@deckster/vite-plugin`, `@deckster/cli` |
| `@deckster/kit/mdx`                 | Node    | The MDX extension: Shiki highlighting, media and icon resolution, prop checks, diagram checks and layout, typographic punctuation                                                           | `@deckster/vite-plugin`                  |
| `@deckster/kit/vite`                | Node    | `kitVitePlugins()` (icons through `unplugin-icons`, CSV imports for charts) and `KIT_SCAN_ENTRY`                                                                                            | `@deckster/vite-plugin`                  |
| `@deckster/kit/chart-catalog`       | Node    | What `deck charts` prints and the numbers the `chart-*` lint rules use (`CHART_LIMITS`)                                                                                                     | `@deckster/cli`                          |
| `@deckster/kit/diagram-catalog`     | Node    | What `deck diagrams` prints, with the limits the `diagram-*` rules share                                                                                                                    | `@deckster/cli`                          |
| `@deckster/kit/component-catalog`   | Node    | What `deck components` prints                                                                                                                                                               | `@deckster/cli`                          |
| `@deckster/kit/chart-spec`          | both    | `ChartSpec`, the versioned JSON every chart writes to `data-chart-spec`                                                                                                                     | `@deckster/export`                       |
| `@deckster/kit/diagram-description` | both    | The versioned JSON every diagram writes to `data-diagram-description`                                                                                                                       | `@deckster/export`                       |
| `@deckster/kit/limit-cases`         | Node    | Each layout filled to its limits, for the budget stress test                                                                                                                                | `@deckster/cli` tests                    |
| `@deckster/kit/icon-sets`           | Node    | `iconSetNames(set)`: the names an installed Iconify set has                                                                                                                                 | `deck icons`                             |

Inside the package, imports use `#` paths (`#foundation/slide-parts.tsx`), as everywhere in the
workspace.

## Source layout

| Folder                                | Contents                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/foundation`                      | What every layout builds on: `Frame`, `Region`, `SlideHeader`, `Footnote`, `Portrait`, `TreatedMedia`, `useFitLevel`, `useDensity`, the `kit-prose` and `kit-type-*` classes |
| `src/layouts`                         | One contract, one component and one stylesheet per layout, plus `limit-cases.ts`                                                                                             |
| `src/charts`                          | Chart and figure components, each a pure planner drawn by `SceneSvg` inside `ChartFrame`                                                                                     |
| `src/diagrams`                        | Diagram components, loaded lazily through `lazy-diagrams.tsx`, and their remark plugins                                                                                      |
| `src/code`                            | `Code`, `CodeMove`, `CodeStep`, `Terminal`, Shiki themes with `--brand-code-*` colors                                                                                        |
| `src/media`, `src/icons`, `src/links` | `Image`, `Video`, `Lottie`, `Icon`, `Link`, `Button`, `Download`, `LinkCard`, `QR`                                                                                           |
| `src/apps`                            | `AppFrame` and `Live`, which host mini apps over `@deckster/app-bridge`                                                                                                      |
| `src/chrome`, `src/motion`            | The page chrome the brand describes, and the entrance motion and animated `Step`                                                                                             |
| `src/mdx`                             | The remark plugins behind `@deckster/kit/mdx` and path resolution (`deck-path.ts`)                                                                                           |
| `src/components`                      | The component catalog and `checkComponentProps`                                                                                                                              |

## Rules for changing the kit

These are the ones a change most often breaks. [docs/design.md](../../docs/design.md) explains
the design decisions behind them.

- A layout is three files: `<name>-layout.contract.ts` (`defineLayoutContract`, listed in
  `catalog.ts`), `<name>-layout.tsx` (`defineLayout`, registered in `runtime.ts`) and
  `<name>-layout.css`. `catalog.test.ts` fails when the two lists differ. Contracts are loaded in
  Node: no JSX, no browser code, and the component imports its contract only as a type.
- Budgets count content (`maxWords`, `maxBullets`, and `maxLines` only for code), never the room
  it takes. Whether text fits a brand is for the overflow rules.
- When you change a limit or a layout, add or update its worst case in
  `src/layouts/limit-cases.ts`. The CLI's stress test lints those cases in three brands at the
  limit (no errors) and one word over (the same `content-budget` findings in each). Its filler
  uses long words and long names on purpose; change the limit or the design, never the filler.
- Every value comes from brand custom properties and every measurement from layout geometry,
  never from transformed boxes. Layouts that fit content to the room pick a level with
  `useFitLevel` and keep it in React state, never by editing the DOM.
- Text over a photo belongs to the `image` layout, on a scrim. Do not place text over a picture
  by hand.
- Each chart, diagram and component has a catalog entry, and tests hold the registered
  components, their props types and the catalogs to each other (`chart-forms.test.ts`,
  `chart-catalog.test.ts`, `diagram-catalog.test.ts`, `component-catalog.test.tsx`). Adding a
  prop means adding it to the catalog too: the build and the components reject names the catalog
  does not list.
- Charts and diagrams write `data-chart-spec` and `data-diagram-description`. `@deckster/export`
  reads them to draw native PPTX shapes, so add fields; do not rename or remove them.
- Components and everything else that runs in the browser are plain React. Effect appears only
  in Node-side code: the remark plugins and the contracts' frontmatter `Schema`.

## Tests

Unit tests sit beside the code. `vite.config.ts` stubs the brand's virtual modules, which only
the deck Vite plugin serves:

```sh
cd packages/kit
pnpm exec vp test run                          # all of them
pnpm exec vp test run src/catalog.test.ts      # one file
```

The browser suite (`e2e/`) renders the `exemplars` fixture deck in Chromium at 1920x1080, once in
`default` (port 5331) and once in `nocturne` (5332). Install the browser once with
`pnpm --dir packages/engine exec e2e-web install chromium`, then:

```sh
cd packages/kit
pnpm e2e                    # both files
pnpm e2e layouts.e2e.ts     # one file
```

Much of the kit is tested from other packages, against real decks:

| Test                                                                   | Where                      | What it holds                                                                          |
| ---------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------- |
| `src/lint/budget-limits.test.ts`                                       | `packages/cli`             | `limit-cases.ts` in default, nocturne and `wide-sans` (drives Chromium, so it is slow) |
| `src/layouts/published-limits.test.ts`                                 | `packages/cli`             | the limits the build and lint enforce match `deck layouts --json`                      |
| `src/lint/layout-probes.test.ts`                                       | `packages/cli`             | lints `packages/cli/fixtures/decks/layout-probes`, the cases reviews found broken      |
| `charts.e2e.ts`, `diagrams.e2e.ts`, `components.e2e.ts`, `apps.e2e.ts` | `packages/vite-plugin/e2e` | the `data-stories`, `diagrams-demo`, `components` and `apps-demo` fixture decks        |

The test decks in [`decks`](../../decks/README.md) show each layout and component in use. After
changing a layout, lint and shoot its deck in both brands with `pnpm deck`:

```sh
pnpm --dir ../.. deck lint layouts
pnpm --dir ../.. deck shot layouts                     # the deck's own brand, default
pnpm --dir ../.. deck shot layouts --brand nocturne    # .deck/shots/layouts@nocturne/
```

From the repository root it is `pnpm deck lint layouts`.

`ffmpeg` on `PATH` is optional: with it, a local GIF becomes a looping video; without it the GIF
stays an image and the build warns `media-gif`.
