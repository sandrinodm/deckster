# Plan: custom code layouts in brands and decks

Status: phases 0 to 4 are implemented on `feat/custom-layouts` (2026-11-24); phase 5 is not.
Reviewed by a second model the same day; its findings are folded in and listed in §8. The open
decisions are settled in §9. §10 has the phase 0 spike results, which changed the contract loader
(§3.4), the kit runtime design (§3.2), the call sites (§1.3, §3.5) and the public parts (§3.8), and
the notes per phase (10.8, 10.9); the text below is updated to match.

The goal: a brand or a deck can ship its own slide layouts as React code, with no limits beyond what
React and CSS can do, and every deckster tool treats them like kit layouts: frontmatter and slot
validation, budgets and lint, `deckster layouts` and the agent's catalog, PPTX and PDF export,
comments and `deckster shot`. A brand can replace a kit layout (its own `title`, say) for every deck
on that brand. Commands make it cheap to start: `deckster layouts new` scaffolds one, and
`deckster layouts eject` copies one kit layout, or all of them, into the brand so they can be
changed freely. `deckster layouts diff` shows what the kit changed since.

**This plan reverses two decisions of `docs/brand-layouts-plan.md`:**

- "A brand cannot ship components" (§1) and "an imported layout is data in the brand, not code"
  (§2). Brands and decks may now ship code. Data layouts in `layouts.ts` stay, unchanged.
- "Brand layouts never replace kit layouts" (§3.2). A code layout may replace a kit layout, only
  when it says so and passes a compatibility check (§3.6). That plan's deferred `replaces: 'title'`
  is this mechanism.

It also interacts with `docs/page-chrome-plan.md`, which adds `role` to layout contracts and moves
`chrome` into the base frontmatter. Neither exists today (§10.6), so this plan leaves `role` out
until that plan lands; custom layouts then get both like kit layouts do (§3.13).

## 1. What exists today

### 1.1 A layout is two halves, and the engine already supports third-party ones

A kit layout is three files: `<name>-layout.contract.ts`, `<name>-layout.tsx` and
`<name>-layout.css` (65 layouts in `packages/kit/src/layouts/`).

- **Contract** (`defineLayoutContract`, `engine/src/contract/layout-contract.ts:465`): name,
  description, frontmatter `schema` (Effect Schema), `hints`, `checks()`, `slots` with `accepts`,
  `budget`, `variants`, `title`, `surface`, `example` and an optional `pptx` mapping (`:303`). It is
  Node code: the build, lint, export, `deckster layouts` and the agent import it.
- **Component** (`defineLayout`, `engine/src/layouts/layout.ts:132`): `{ name, component, bleed? }`,
  where the component gets `LayoutProps { slideId, frontmatter, slots }` (`:25-43`). It is browser
  code, loaded only through Vite.
- **Catalog and plugin.** Contracts are grouped by `defineLayoutCatalog({ source, layouts })`
  (`layout-contract.ts:479`) and components by `definePlugin({ name, layouts })`
  (`engine/src/plugins/deck-plugin.ts:68`). The kit's are `kit/src/catalog.ts` and
  `kit/src/runtime.ts`; `kit/src/catalog.test.ts:7-9` asserts the two list the same names in the
  same order. `kit/src/runtime.ts` statically imports every layout module, and with it every
  layout's CSS.

**Third-party layouts already work end to end** in one e2e fixture,
`vite-plugin/e2e/fixtures/layouts/`: `columns-layout.contract.ts`, `columns-layout.tsx` (a plain
`<div data-layout="columns">`, no kit parts), `catalog.ts` and `runtime.ts`. It is wired by passing
`layoutCatalogs` and `runtimePlugins` to the Vite plugin (`e2e/support/case-servers.ts:39-48`).

### 1.2 How catalogs and plugins load

- `loadLayoutCatalog(specifiers, { brand, layoutsFile })`
  (`vite-plugin/src/layouts/load-layout-catalog.ts:85`) loads the engine catalog, then each
  specifier in order. A later catalog replaces a layout of the same name and keeps its position
  (`:89-98`). Specifiers are absolute paths or resolve from vite-plugin (`catalogRef`, `:192-197`).
  Each catalog is imported with a plain `import(fileUrl)` (`:128-145`), with no cache-busting, and
  each contract goes through `checkContract` (`vite-plugin/src/layouts/check-contract.ts:84-110`).
  Brand data layouts are appended last and may not clash (`:100-118`).
- At runtime, `virtual:deck/plugins` imports every runtime plugin
  (`vite-plugin/src/virtual-modules.ts:76-82`); `composePlugins`
  (`engine/src/plugins/compose-plugins.ts:84-105`) merges their layouts into one map, later plugins
  winning by name. **Only the component is swapped: the replaced layout's module, and its CSS, stay
  loaded.** A layout with no component renders "Unknown layout"
  (`engine/src/deck/slide-content.tsx:93-96`). Nothing checks that every contract has a component.

### 1.3 Every path that builds a catalog or a Vite config ignores custom layouts

Node-side `loadLayoutCatalog` calls:

| Call site                                                   | Has a deck?     | Passes catalogs?                                                           |
| ----------------------------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `vite-plugin/src/plugin.ts:264` (`layoutCatalog()`)         | yes             | yes, `options.layoutCatalogs`                                              |
| `vite-plugin/src/slides/slide-meta.ts:66`                   | yes             | accepts them; its caller `scripts/docs/data/deck-slides.ts:96` passes none |
| `cli/src/layouts/load-brand-catalog.ts:64,89`               | sometimes       | no (kit only; `:89` is the kit-only fallback)                              |
| `cli/src/layouts/check-brand-layouts.ts:23`                 | no (brand only) | no                                                                         |
| `cli/src/lint/run-lint.ts:173`                              | yes             | no                                                                         |
| `cli/src/export/run-export.ts:200`                          | yes             | no                                                                         |
| `skills/brand-import/scripts/tests/fw_layouts_check.mts:21` | no              | no                                                                         |

`load-brand-catalog.ts` (signature `loadBrandCatalog(workspaceRoot, brandName)`, `:50-53`) feeds
`listLayouts` (`deckster layouts`, and the agent's `catalog` tool at
`cli/src/agent/deck-tools-live.ts:473`), `addSlide` (`cli/src/scaffold/new-slide.ts:69,79`) and
`createDeck` (`cli/src/scaffold/new-deck.ts:57,78`, called before the deck exists).
`check-brand-layouts.ts` feeds `deckster brand check` (`commands/brand-run.ts:133`) and `brand add`
(`brand-add/add-brand.ts:332`), which checks a fetched brand in a staging folder.

`deckViteConfig` callers, none of which pass `layoutCatalogs` or `runtimePlugins`:
`cli/src/server/dev-server.ts:298-305`, `cli/src/server/preview-server.ts:84`,
`cli/src/site/build-deck.ts:27` and `cli/src/server/deck-server-live.ts:57-61` (the server lint,
export and `shot` render through: a new Vite server and plugin instance per run, which may load the
workspace's own vite-plugin copy, `:119-135`). The spike showed none of them needs a change: the
deck plugin knows the workspace, the deck and the brand, so it finds local layouts itself, and every
one of these paths rendered them with only `plugin.ts` changed (§10.2).

### 1.4 Brands are data, on purpose

- `brand.ts` is imported as code only when local and outside an agent turn
  (`brand/src/node/load-brand.ts:437-463`, with `?mtime=` cache-busting at `:606-622`). `layouts.ts`
  is never imported: it is parsed as a static literal (`load-brand.ts:558-590`,
  `brand/src/node/static-module.ts:281-360`).
- `deckster brand add` reads `brand.ts` as data and **skips every code file**: `CODE_EXTENSIONS`
  (ts, tsx, mts, cts, js, jsx, mjs, cjs, css) are left out with reason `code`
  (`cli/src/brand-add/brand-files.ts:53,185`). Hidden paths are skipped too (`:162-164`). There is no
  trust prompt; the safety model is "only data enters".
- **Agent turns.** The agent edits a working copy; only slide files (`.mdx`, `.tsx`) and
  `assets/`/`public/` files are copied back into the deck, and `.ts` modules, `.css`, brands and
  everything else are ignored or refused (`agent/src/prompt/standing-rules.ts:15-35`; deny rules
  `Edit(/decks/**)`, `Edit(/brands/**)`, `Edit(**/*.css)` at
  `agent/src/providers/claude/invocation.ts:73-83`). So the agent cannot write layout code today.
  During a turn, `holdCode` (`brand/src/node/code-gate.ts:108-124`) holds the whole deck and brand
  folders; `isGatedCodeFile` (`brand/src/node/turn-guard.ts:727,772-777`) only picks which files
  get their turn-start content vouched, and a vouched file is then read as a static literal
  (`code-gate.ts:183-203`), which a contract (Effect Schema, `checks()`) can never be.
- `brands/<name>/layouts/` already exists for data layouts' art (`brands/fieldnote/layouts/*.svg`).

### 1.5 Node cannot load `.tsx`

The CLI's loader hooks handle only `/\.m?ts$/` (`cli/src/bootstrap/hooks.ts:29`), and Node's type
stripping does not transform JSX. So a contract must be a JSX-free `.ts` file, and components must
only ever load through Vite. The hooks map `@deckster/*` to the framework's source files, including
new export subpaths automatically, and retry other bare imports (`react`, `effect`) from the
framework (`hooks.ts:62-101`); Vite does the same (`vite-plugin/src/framework-resolve.ts:41-99`).
Layout code can therefore import `@deckster/*` and any framework dependency (`framework-resolve.ts:94-95`:
`react`, `effect`, but also `lottie-web`, `elkjs`, …), and nothing else: user workspaces have no
`node_modules` of their own. `deckster types` writes a `tsconfig.json` that maps `@deckster/*` for
editors (`cli/src/commands/types.ts`).

### 1.6 What kit layouts depend on

Imports across the 65 layouts (64 catalog layouts plus the data-layout renderer `brand`) and their
contracts, counted in files (checked in phase 0, §10.4):

- **Engine:** `@deckster/engine/layout` (65 files, 73 import statements), `@deckster/engine` (65:
  `defineLayout`, `LayoutProps`, `useStatic`), `@deckster/engine/command` (4). `effect` (65).
  `@deckster/brand` (4).
- **Kit, private** (`#` imports, `kit/package.json` `imports: { "#*": "./src/*" }`):
  `#layouts/layout-fields.ts` (68), `#foundation/slide-parts.tsx` (58), `#motion/enter.ts` (54),
  `#foundation/smart-punctuation.ts` (50), `#foundation/fit-level.ts` (35), `#motion/step.tsx` (29),
  `#foundation/fit-text.ts` (12), `#foundation/stat-figure.tsx` (9),
  `#foundation/frontmatter-assets.ts` (8), `#foundation/media-treatment.tsx` (7),
  `#foundation/portrait.tsx` (6), `#foundation/layout-geometry.ts` (6), `#foundation/marks.tsx` (5),
  and a long tail used by one to four layouts (`quote-marks`, `slide-file`, `badges`,
  `frontmatter-picture`, `density`, `contact-list`, `mono-mark`, `brand-logo`, `#apps/app-chrome`,
  `#links/link-target`, `#links/qr`, `#motion/still-motion`, `#motion/css-duration`,
  `#foundation/table-context`, `#diagrams/{form-parts,lazy-diagrams,word-breaks}`).
- **`@deckster/brand/runtime`** (17, `useBrand`).
- **Modules with shared state**, which cannot be copied without breaking the link to the kit's
  instance: `foundation/table-context.ts` (a context; `table` provides it, kit `markdown-table` and
  `data-table` read it), `motion/still-motion.ts` (`RevealContext`; `image-reveal` and
  `screen-story` import `useStillMotion` directly, and `stat-figure` → `use-count-up.ts:144` reads
  the context), `foundation/frontmatter-assets.ts` (a module-level registry, `:18`, that every MDX
  slide fills by importing this exact file, `mdx/remark-frontmatter.ts:68`; a copy is always empty)
  and `media/media-frame.ts` (a context reached only through `TreatedMedia` and `slide-parts`, never
  imported by a layout). `diagrams/form-parts.tsx`'s `Milestone` is checked by element type inside
  `Timeline` (`diagrams/timeline.tsx:24,193`), so it must never be copied either.

Already public in `kit/src/index.ts`: `useEnter`, `enterProps`, `Step`, `Morph` and the components
(`Image`, `Icon`, `Code`, `Place`, …). Not public: `Frame`, `Region`, `SlideHeader`, `Eyebrow`,
`FittedText`, `Footnote`, `useFitLevel`, `TreatedMedia`, `BrandLogo`, `smartPunctuation`, and all of
`layout-fields` and `display-fields`.

**Eject hazards** (code that does not travel cleanly):

- every layout imports its own CSS and contract through `#layouts/…`;
- `title-layout.tsx:13-15` imports `display-align.css`, `image-layout.css` and its own CSS (title
  uses only `.kit-image-scrim`, `image-layout.css:69`);
- seven helpers import their own global `.kit-*` CSS (`badges`, `portrait`, `marks`, `contact-list`,
  `frontmatter-picture`, `mono-mark`, `pattern-slide`); a copy edited on eject leaks into the kit
  layouts that still load the kit's copy, because neither is scoped to a layout;
- two layout stylesheets load outside their layout: `code-layout.css` from `kit/src/runtime.ts:100`
  and `stats-layout.css` from `charts/figures/stat-row.tsx:29`, so replacing `code` or `stats` does
  not drop them;
- layouts reach already-public kit parts (`Step`, `QR`, `Timeline`, `Milestone`, `useEnter`) through
  `#` paths, never `@deckster/kit`, so the rewrite must map to `@deckster/kit` and
  `@deckster/kit/diagrams` too. No layout file uses a relative import;
- `dashboard-layout.contract.ts:4` imports `DATA_HINT` and `DataField` from the chart contract;
- seven pattern layouts share `pattern-slide.{tsx,css,contract.ts}`;
- `content-layout.tsx` and `split-layout.tsx` share `layout-limits.ts`; quiz, market, matrix, logos
  and sources have their own helper files;
- `display-align.css` hard-codes four `data-layout` names;
- layout CSS is keyed on `.kit-frame[data-layout='<name>']` in `@layer components`, and 48
  contracts' `pptx` mappings target `.kit-title` (plus one-off classes such as `.kit-section-title`,
  `.kit-cover-title`);
- `title-layout.tsx:20` has a local `TITLE_MAX_LINES` (3) that differs from the one in
  `slide-parts.tsx:19` (2).

### 1.7 What other packages need from a layout's DOM

Less than one might fear, which is what makes custom layouts feasible:

- **`[data-layout]`:** export reads the first one in the slide, defaulting to `default`
  (`export/src/scene/collect-scene.ts:44`), and picks the PPTX mapping by that name
  (`export/src/pptx/build-pptx.ts:255`, `layout-specs.ts:246,304,506`). Only kit `Frame` sets it
  (`kit/src/foundation/slide-parts.tsx:87`); the engine does not. A layout without it, with a typo,
  or with a nested `[data-layout]` exports under the wrong mapping without an error.
- **Slots:** the engine wraps each filled slot in `span.deck-slot[data-slot]`
  (`engine/src/deck/slide-content.tsx:256-266`). Lint classifies a slot's blocks by its direct
  children (`cli/src/browser/collect-snapshot.ts:714,816-843`), so a layout must not reparent slot
  content.
- **Steps:** `.deck-step[data-step][data-step-state]`, from the engine or kit `Step`.
- **PPTX:** the selectors named in the contract's `pptx.placeholders[].from`.
- **Readiness:** a layout that measures after fonts load must hold with `useReadyHold`
  (`@deckster/engine`), as `FittedText` does (`kit/src/foundation/fit-text.ts:188`).
- **Comments** use `data-deck-source` stamps added by a JSX transform
  (`comments/src/vite/stamp-transform.ts:81`), and `.deck-slide`; no kit classes.
- **Kit component classes** that lint and export recognise: `.kit-stat`, `.kit-stat-row`,
  `.kit-diagram`, `.kit-code`, `.kit-code-move`, `.kit-terminal`
  (`cli/src/browser/collect-snapshot.ts:819-824`), `kit-table-fit`
  (`cli/src/lint/rules/table-too-dense.ts:7`), `.kit-code-pre`, `.kit-video`, `.kit-app`, `.kit-live`
  (`export/src/scene/collect-scene.ts:142,2595-2603`), `figure.kit-video video`
  (`cli/src/export/export-pptx.ts:52`) and chart classes (`export/src/pptx/chart-svg.ts:91-96`). A
  layout that uses the kit components gets these for free; one that draws its own stat, code or video
  markup is misclassified by slot `accepts` checks and by export.

`.kit-frame`, `.kit-region` and `.kit-safe` are referenced by no package outside the kit. But kit
`type.css`, `table.css` and `apps.css` scope rules under `.kit-frame`, so a layout without `Frame`
loses kit table and type styling.

### 1.8 Dev reload

- `watchBrand` (`vite-plugin/src/brand/active-brand.ts:170-198,248-255`) does `invalidateAll` and a
  full reload on any change under the active brand folder, so brand files never get HMR today.
  Because that also resets the brand, the catalog index is rebuilt (`plugin.ts:262`), but catalog
  modules are imported with a plain `import()` (`load-layout-catalog.ts:133`) that Node caches, so a
  contract edit is not seen until the server restarts.
- Deck files other than the config and slides have no watcher: `watchManifest`
  (`plugin.ts:510-547`) reloads only on `deck.config.ts` changes or slide add and remove.
- Slides are validated against contracts in `transform`, so a contract change must invalidate every
  slide module.
- Tailwind already scans the deck and brand folders (`active-brand.ts:155-157`).
- The lint, export and shot server runs with `hmr: false` (`deck-server-live.ts:68`).

### 1.9 The installed CLI carries the kit source

`prepack` stages `packages/*` and `brands/default` into `cli/dist/framework/`
(`cli/package.json`, `brand/src/node/framework-root.ts:9-21`), so
`packages/kit/src/layouts/*.tsx` ships with the installed CLI and `eject` can copy from
`FRAMEWORK_ROOT`. The staging leaves out `*.fixture.*`, `*.test.*`, `testing/` and `__snapshots__`
(`cli/src/release/stage-framework.ts:31-36`). That includes the limit-case deck generator
`cli/src/lint/budget-limits.fixture.ts`.

## 2. The approach in one paragraph

A **code layout** is a folder, `brands/<brand>/layouts/<name>/` or `decks/<deck>/layouts/<name>/`,
holding `contract.ts` (Node-safe, JSX-free), `layout.tsx` (browser) and optional `layout.css` and
helper files. **One resolver**, `localLayouts({ root, brand?, deck?, code })`, finds these folders
and returns the catalogs and a generated runtime plugin; every path in 1.3 calls it, so the dev
server, build, lint, export, `shot`, `deckster layouts`, `new slide` and the agent all see the same
layouts. Contracts are loaded through **Vite's module runner** after a **static import check**, and
through the agent-turn gate. A code layout with a new name adds to the catalog; one with a kit name
must say `replaces` and pass a compatibility check, and the **kit runtime is generated** so a
replaced kit layout's component and CSS are not loaded at all. The engine stamps the layout name on
each slide, so export no longer trusts the layout's own markup for it. The kit publishes the
building blocks its own layouts use as **`@deckster/kit/layout-parts`** (browser) and
**`@deckster/kit/layout-fields`** (Node-safe). A fetched brand would now run code on the user's
machine, so `brand add` keeps refusing code unless asked. `layouts new`, `check`, `eject` and `diff`
sit on top.

## 3. Decisions

### 3.1 Where layout code lives

```
brands/acme/
  brand.ts
  layouts.ts                      data layouts, unchanged
  layouts/
    title-photo.svg               data layout art, unchanged (files at the top level)
    title/                        a code layout: one folder per layout
      contract.ts                 defineLayoutContract(...), JSX-free
      layout.tsx                  defineLayout(...), default export
      layout.css                  optional, imported by layout.tsx
      limits.ts                   optional: limit cases for `layouts check` (§3.11)
      .eject/                     only for ejected layouts (§3.10)
    _shared/                      helpers several layouts import; never a layout
    kpi-wall/
      contract.ts
      layout.tsx
decks/q4-review/
  layouts/
    funnel/
      contract.ts
      layout.tsx
```

- **One folder per layout**, named after the layout, so files at the top of `layouts/` stay data art
  and nothing collides with it. A subfolder without `contract.ts` or `layout.tsx` is an error naming
  the missing file.
- **Fixed file names** (`contract.ts`, `layout.tsx`), so discovery needs no registration file. The
  folder name must equal `contract.name`.
- **Helpers** may be any `.ts`, `.tsx` or `.css` in the layout's folder or in `layouts/_shared/`
  (leading underscore: never a layout). What a contract may import is limited (§3.4).
- **Deck layouts** travel with the deck; brand layouts with the brand. A deck layout is for a
  one-off; a brand layout for something every deck on the brand should get.
- **Dependencies:** layout code may import `@deckster/*`, `react`, `effect` and other packages the
  framework itself ships (1.5), and its own files. There is no per-brand `npm install`. The authoring
  reference lists the supported packages; importing another framework dependency works but is not
  a stable promise.
- **Version:** a brand or deck with code layouts may declare `deckster: '>=0.10 <0.12'` in a new
  optional `brands/<name>/brand.json`, or the deck's `deck.config.ts`. A mismatch is an error before
  anything is imported, naming the installed version.

### 3.2 Precedence, names and what gets loaded

Lookup order, later wins: engine → kit → **brand code** → brand data (`layouts.ts`) → **deck code**.

| Case                                               | Result                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| New name                                           | added                                                                                      |
| Code layout with a kit or engine name              | error unless the contract says `replaces: true`; then it replaces, after the check in §3.6 |
| Brand code layout and brand data layout, same name | error in `brand check`: one brand, one meaning                                             |
| Deck code layout with a brand layout's name        | error in v1 (rename it); deck-over-brand replacement is phase 5                            |
| Two decks with the same layout name                | fine: decks never see each other's layouts                                                 |
| Engine `default`                                   | can be replaced like any kit layout                                                        |

`replaces` is a new optional contract field, `replaces?: true`, so a replacement is visible in the
file and an accidental name reuse fails loudly. Replaced layouts keep their catalog position, which
`loadLayoutCatalog` already does (1.2), so `deckster layouts` lists the brand's `title` where the
kit's was.

**A replaced kit layout is not loaded at all (decided, §9).** Today the kit runtime imports every layout
and its CSS (1.1), so a replacement that keeps the name (every eject does, §3.10) would still get the
kit's `.kit-frame[data-layout='title']` rules, in the same layer and with the same selectors. Rules
deleted from the ejected copy would keep applying, and which copy wins would depend on stylesheet
order. Fix: the Vite plugin generates the kit's runtime plugin as a virtual module from the
catalog, importing one module per kit layout and **skipping replaced names** (verified in the
spike: with `columns` and `title` replaced, a production build has none of
`columns-layout.css` or `title-layout.css`, §10.3). How, so that every importer that is not the
Vite plugin keeps working:

- `kit/src/kit-plugin.ts` (new, export `@deckster/kit/plugin`): `kitPlugin(layouts)` returns the
  `definePlugin({...})` that `runtime.ts` has today, with the given layouts plus
  `brandLayoutDefinitions(tokens.layouts)`, the components, the chrome and the CSS that is not
  per-layout.
- `kit/src/layouts/all-layouts.ts` (new): the 64 kit layout definitions in catalog order, the
  default export.
- `kit/src/runtime.ts` stays a static module: `export default kitPlugin(allLayouts)`. Its importers
  outside the Vite plugin (the kit's `catalog.test.ts`, `component-catalog.test.tsx` and
  `brand-layout.test.ts`) and the dependency scan entry (`framework-resolve.ts:21`) keep seeing
  every layout.
- The Vite plugin replaces `@deckster/kit/runtime` in the runtime plugin list with
  `virtual:deck/kit-runtime`: `import { kitPlugin } from '<kit>/src/kit-plugin.ts'`, then
  `import { <camel>Layout } from '<kit>/src/layouts/<name>-layout.tsx'` for each kit catalog name
  not replaced, and `export default kitPlugin([...])`. A kit unit test asserts that every catalog
  name has that file and export, and that `all-layouts.ts` matches the catalog's order.
- Two traps the spike hit: `this.resolve` skips the calling plugin, so `resolveRuntimePlugins` must
  return the virtual ids itself, unresolved (an import of a `\0` id fails in the build); and the
  brand stylesheet's Tailwind `@source` list is built from the runtime plugins' folders
  (`brand/active-brand.ts:156`), so the virtual id must still contribute the kit's `src/` folder,
  or kit-only utilities drop out of the CSS (467 bytes on the spike deck).

CSS shared by several layouts (`display-align.css`, `image-layout.css` imported by `title`) stays
loaded while any layout that imports it is loaded; eject copies such files and scopes them to the
ejected layout (§3.10). This is not enough for `display-align.css`: it is keyed on layout names
(`title`, `section`, …), not on the importing layout, so with `title` replaced its three
`[data-layout='title']` rules still match a replacement that keeps `.kit-frame` and
`data-layout="title"` (the spike's built CSS kept exactly those three). Phase 3 rekeys it on an
attribute the layout sets (`data-display-align`) instead of names. An e2e test removes a rule from
an ejected `title` and asserts the computed style changes.

### 3.3 The engine stamps the layout name

`slide-content.tsx` sets `data-deck-layout="<name>"` on the slide's section from the frontmatter,
and export reads that instead of the first `[data-layout]` (`collect-scene.ts:44`). The layout's own
`data-layout` stays a styling hook. A custom layout then exports under the right PPTX mapping
whatever markup it draws, and a typo cannot silently pick the `default` mapping.

### 3.4 Loading contracts: static check, module runner, turn gate (decided, §9)

**Static import check first.** Before anything is evaluated, `importContracts`
parses `contract.ts` and follows its relative imports, and rejects, with the file and the import:

- any import that is not a `.ts` file (`.tsx`, `.css`, assets);
- a relative import that leaves the layout's folder and `layouts/_shared/`;
- a bare import outside an allowlist: `effect`, `@deckster/engine/layout`, `@deckster/engine/command`,
  `@deckster/kit/layout-fields`, `@deckster/brand` (types and data only).

This is a transitive check over the source, not the loader's own dependency list, which is only known
after evaluation and leaves out externalized modules. It turns today's raw crashes into problems that
name the import: through the runner, a contract helper importing a `.tsx` fails with "Cannot find
module 'react/jsx-dev-runtime'" or "module is not defined", and one importing a `.css` with a
`TypeError` inside Vite.

**Then the loader (decided in phase 0, §10.1): one Vite runnable environment per load, with the
allowed packages handed to Node.** `importContracts(files, { root })` builds one environment for the
whole batch and closes it afterwards:

- `resolveConfig({ root, configFile: false, envDir: false, cacheDir: <os temp>, logLevel: 'silent',
  environments: { contracts: { consumer: 'server', dev: { moduleRunnerTransform: true }, resolve: {
  external: true, mainFields: [], conditions: ['node'], builtins: [...builtinModules, /^node:/,
  ...ALLOWED] } } } }, 'serve')`, then `createRunnableDevEnvironment('contracts', config, {
  runnerOptions: { hmr: false, evaluator }, hot: false })` and `environment.runner.import(file)` per
  contract. This is what `runnerImport` does inside (`vite-plus-core` `chunks/node.js:42400-42418`),
  minus its forced `cacheDir: process.cwd()`, plus two settings it does not let us pass.
- `ALLOWED` (`/^effect(\/|$)/`, `/^@deckster\//`) is wider than the import check's allowlist
  above on purpose: the static check is the gate, the loader only decides who evaluates. Listing them as `resolve.builtins` makes Vite's
  `fetchModule` externalize them unresolved, and `evaluator` (a subclass of `ESModulesEvaluator`
  from `vite/module-runner`) imports them with `import(import.meta.resolve(specifier))` from
  vite-plugin's own file: the workspace links in the repository, the CLI's loader hooks when
  installed. Contracts therefore get **the CLI's own `effect` and engine instances**, and only the
  user's files (contracts and their helpers) go through Vite.
- Do **not** pass `frameworkAliases()` or `frameworkDependenciesPlugin()` here: the alias turns
  `@deckster/engine/layout` into a file path before the builtins check, so the engine is inlined
  again (measured: 14 inlined modules instead of 12 for 11 contracts), and the dependency plugin
  resolves `effect` to a file, which inlines all of it.
- Not chosen, with the measurements in §10.1: `runnerImport` per contract (6.5–13 s for ten
  contracts in a workspace that has no `node_modules`, the normal installed case, with a second
  `effect` instance); Node `import()` with `?mtime=` (fast, but a helper edit was not seen).
- Two Vite behaviours the choice rests on, each pinned by a phase 1 test: the builtins short-circuit
  in `fetchModule`, and the evaluator receiving the bare specifier. The test loads a contract and
  asserts that the contract's `schema` has the same prototype as a `Schema.Struct` built in the
  test (one `effect`; the spike compared against a `Schema.Struct`, not other schema kinds) and that the runner inlined only workspace files. `createRunnableDevEnvironment` is not
  marked experimental in Vite 8.3.8; the `ModuleRunner` it builds on is.
- No code compares contracts or schemas by identity today (grep for `===`, `instanceof`, `WeakMap`
  and `Map` keyed by contract or schema: only name comparisons), so even a second instance would
  pass `checkContract`; the spike saw it pass in every mode.

**Then the turn gate.** `importContracts` itself checks `isCodeHeld`: during an agent turn it never
evaluates a contract, returns the contract last loaded for that file from the process-wide gate
(`rememberLoaded`), and reports `held` as an error when there is none, as `load-brand.ts:437-446`
does for `brand.ts`. The dev server preloads all local contracts at start, before any turn, and the
`loadedWhileHeld`/`onCodeReleased` path (`active-brand.ts:192-198`) reloads them when a turn ends. A
cache inside the plugin instance is not enough: lint, export and `shot` start a fresh server per run,
and the agent's catalog tool calls `listLayouts` outside any plugin.

The gate API is usable from vite-plugin as it is (checked in phase 0): `isCodeHeld`,
`rememberLoaded`, `onCodeReleased` and `gatedLoad` are exported from `@deckster/brand/node`
(`brand/src/node/index.ts:47-55`). There is no "last loaded value" getter; `gatedLoad(file, text,
{ name: 'defineLayoutContract', … })` gives it: a held contract is never a static literal, so it
returns the remembered value or `held` (read from the code, not run in the spike). `forgetLoaded` is not exported and is needed for a contract
deleted during a hold. `loadedWhileHeld` is not a brand API: it is `trackHeldLoads()` in
`vite-plugin/src/held-loads.ts`, which `plugin.ts` already uses for the deck config.

### 3.5 One resolver for every path

Frozen for phase 1 (after the spike). All in `vite-plugin/src/layouts/`, exported from
`@deckster/vite-plugin`:

```ts
// import-contracts.ts: the loader in §3.4, after the import check, through the turn gate
importContracts(
  files: readonly string[],            // absolute contract.ts paths
  options: { root: string },           // workspace root, the runner's root
): Effect<readonly ContractLoad[], never, FileSystem>

type ContractLoad =
  | { readonly file: string; readonly kind: 'loaded'; readonly exported: unknown }
  | { readonly file: string; readonly kind: 'held' }        // in a turn, never loaded before
  | { readonly file: string; readonly kind: 'failed'; readonly problem: Problem };

// local-layouts.ts: discovery, version check, parity, importContracts
localLayouts(options: {
  root: string,
  brand?: BrandLocation,   // from LoadedBrand.location: built-in brands live under FRAMEWORK_ROOT
                           // (load-brand.ts:354) and `brand add` checks a staged folder
  deck?: DeckLocation,     // from findDeck: deck code layouts
  code: 'load' | 'skip',   // 'skip': discover and list, never import
}): Effect<LocalLayouts, never, FileSystem>

type LocalLayout = {
  readonly name: string;                                    // the folder name
  readonly source: `brand-code:${string}` | `deck:${string}`;
  readonly contractFile: string;                            // absolute
  readonly componentFile: string;                           // absolute layout.tsx
};

type LocalLayouts = {
  readonly layouts: readonly LocalLayout[];        // brand code, then deck code, by folder name
  readonly catalogs: readonly LocalCatalog[];      // { source, ref: FileRef, exported }, per loaded
                                                   // contract, in the same order; empty for 'skip'
  readonly replaced: readonly string[];            // kit names not to load (§3.2)
  readonly files: readonly string[];               // everything found, for watching
  readonly problems: readonly LayoutProblem[];     // Problem & { code, file }, §5
};

// deck-catalog.ts: what every Node-side caller uses
deckCatalog(options: {
  root: string,
  brand?: LoadedBrand,     // its data layouts and its code layouts
  deck?: DeckLocation,
  code: 'load' | 'skip',
  specifiers?: readonly string[],   // default DEFAULT_LAYOUT_CATALOGS
}): Effect<{ index: LayoutCatalogIndex; local: LocalLayouts }, DeckBuildError, FileSystem>
```

Problems are values, not failures, so a caller can still list the kit's layouts.
`loadLayoutCatalog(specifiers, { brand, layoutsFile, local })` takes `LocalLayouts['catalogs']`:
brand code after the module catalogs, then brand data layouts (the clash check now also covers
brand code names), then deck code. The spike's version of `local` is in §10.

Virtual modules, served by the deck plugin: `virtual:deck/kit-runtime` (§3.2) and
`virtual:deck/local-layouts` (below), both in `vite-plugin/src/virtual-modules.ts` next to
`VIRTUAL_PLUGINS_ID`.

Per call site (line numbers at `11a86f2`; the spike changed the ones marked ✓ and saw them work):

| Call site                                                                          | brand | deck | code                                                |
| ---------------------------------------------------------------------------------- | ----- | ---- | --------------------------------------------------- |
| `vite-plugin/src/plugin.ts:264` `layoutCatalog()` ✓                                | yes   | yes  | `load`                                              |
| `vite-plugin/src/slides/slide-meta.ts:66`, inside `slideMetaReader`                | yes   | yes  | `load`                                              |
| `cli/src/layouts/load-brand-catalog.ts:64` (new `deck?` parameter at `:51-53`) ✓   | yes   | opt. | `load`                                              |
| ↳ `list-layouts.ts:262` (`deckster layouts`, agent `catalog`) ✓, `new-slide.ts:79` | yes   | yes  | `load`                                              |
| ↳ `new-deck.ts:78` (`createDeck`, before the deck exists)                          | yes   | no   | `load`                                              |
| `cli/src/layouts/check-brand-layouts.ts:23` (`checkCatalogLayouts`)                | yes   | no   | as below                                            |
| ↳ `commands/brand-run.ts:133` (`deckster brand check`)                             | yes   | no   | `load`                                              |
| ↳ `brand-add/add-brand.ts:332` (`deckster brand add`, staging)                     | yes   | no   | `skip`, or `load` after `--allow-code` is confirmed |
| `cli/src/lint/run-lint.ts:173` ✓, `cli/src/export/run-export.ts:200` ✓             | yes   | yes  | `load`                                              |
| `skills/brand-import/scripts/tests/fw_layouts_check.mts:21`                        | no    | no   | kit only, unchanged                                 |

No change: `scripts/docs/data/deck-slides.ts:96` (its `slideMetaReader` call gets local layouts
from inside), `agent/deck-tools-live.ts:473` (calls `listLayouts`), and every `deckViteConfig`
caller (§1.3): `dev-server.ts`, `preview-server.ts`, `build-deck.ts` and `deck-server-live.ts`,
because the deck plugin calls `localLayouts` itself. Without the lint change, the spike showed lint
silently checking a deck layout's slide against no contract (its budget was ignored); by the code,
a replaced kit layout's slide is checked against the kit's contract (not observed). Export was only
run with its change; that it needs one is read from the code (`run-export.ts:200` feeds the PPTX
contracts), not observed.

- **Runtime plugin:** a virtual module `virtual:deck/local-layouts` lists the components. Each is
  imported lazily and wrapped so that one layout that fails to compile or throws on import becomes a
  slide problem on the slides that use it ("layout `kpi-wall` failed to load: …"), not a broken deck.
  Paths are written with `normalizePath` and `JSON.stringify`, as `pluginsModuleCode` does, for
  Windows. It comes right after `virtual:deck/kit-runtime` (where `@deckster/kit/runtime` was) and
  before the presenter and dev-only plugins, which define no layouts; a test keeps it that way.
  `layout.tsx` files are added to `optimizeDeps.entries`, because the dependency scan does not
  follow virtual modules (`framework-resolve.ts:14-18`) and a layout's own dependency found late
  reloads the page (not verified in the spike).
- **The kit-only fallback** in `load-brand-catalog.ts:89` stays for a broken brand, and now also for
  broken local layouts, so `deckster layouts` still answers, with the problem as a warning.
- **`deck-server-live.ts`'s workspace-copy path** (`:119-135`) only applies when the workspace is
  itself a framework checkout (`packages/vite-plugin/src/index.ts` exists there), which is how
  `deckster diff` renders an older revision. That revision's plugin simply does not know code
  layouts; no message is needed, and nothing else changes there.

### 3.6 Replacing a kit layout: the compatibility check

A replacement must keep every deck that used the original compiling and fitting. `brand check`, the
build and `layouts check` run, for a contract with `replaces: true` against the layout it replaces:

1. **Fields:** every field the original requires exists and is required; every field the original
   accepts is accepted (new optional fields are fine).
2. **Slots:** every required slot exists and is required; every slot the original has exists, and
   its `accepts` is a superset.
3. **Examples decode:** the original's `example` and every `LIMIT_CASES[name]` entry
   (`kit/src/layouts/limit-cases.ts:797`) decode against the new schema and pass its `checks()`.
4. **Real slides decode:** every slide in the workspace's decks on that brand that uses the layout
   decodes against the new schema. This catches a narrowed field type that 1–3 miss.
5. **Budgets:** a tighter budget is allowed (lint then flags existing decks, which is the point), but
   `brand check` lists every changed limit as a note.
6. **PPTX:** if the original has a `pptx` mapping and the replacement does not, a warning: exported
   decks lose their placeholders.
7. **Title:** a required title stays required. (When the page chrome plan lands and contracts get
   `role`, the replacement must keep the original's role too; not before, §10.6.)

Failing 1–4 or 7 is an error with the original's value and the fix. This generalises the rule
`checkBrandLayouts` applies to data layouts and their fallback
(`kit/src/layouts/brand-layout.contract.ts:190-216`).

### 3.7 Parity and contract checks

`brand check`, `deckster layouts check` and the build report:

- a folder without `contract.ts` or `layout.tsx`;
- `contract.name` different from the folder name;
- `layout.tsx` whose default export is not a `defineLayout` with the same name (checked statically by
  looking for the name, and at startup in the browser, where a mismatch becomes a slide problem);
- every import-check problem (§3.4) and every `checkContract` rule (1.2), with the file being the
  folder's `contract.ts`.

### 3.8 Public building blocks (decided, §9)

Two new kit exports, documented and covered by an API snapshot test (the exported names and their
types), so a breaking change is deliberate and shows up in review:

**`@deckster/kit/layout-parts`** (browser; imports its own CSS). Checked against what the 64 kit
layouts import in phase 0 (§10.4); the "uses" column counts layouts importing it directly:

| Export                                                            | From                                    | Uses | Why                                                                                                    |
| ----------------------------------------------------------------- | --------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------ |
| `Frame`, `Region`                                                 | `foundation/slide-parts.tsx:77,129`     | 58   | brand margins, safe area, grid variables, backdrop, `.kit-frame` scoping for kit type and table styles |
| `Eyebrow`, `SlideHeader`, `Footnote`                              | `slide-parts.tsx:159,197,300`           | 48   | the standard header, with `.kit-title` for PPTX                                                        |
| `FittedText`                                                      | `slide-parts.tsx:262`, `fit-text.ts`    | 11   | type that steps down to fit, `data-fit` for lint, readiness hold                                       |
| `useFitGroupWidth`, `useRenderOnFontLoad`, type `FitRung`         | `foundation/fit-text.ts`                | 12   | the fit ladder; otherwise 14 layouts copy it and drift from the kit's `data-fit` steps                 |
| `useFitLevel`                                                     | `foundation/fit-level.ts:116`           | 35   | density steps for content that may not fit                                                             |
| `TreatedMedia`                                                    | `foundation/media-treatment.tsx:56`     | 7    | brand image treatments (provides the media-frame context)                                              |
| `BrandLogo`                                                       | `foundation/brand-logo.tsx:26`          | 2    | the surface's logo variant                                                                             |
| `smartPunctuation`                                                | `foundation/smart-punctuation.ts`       | 50   | typographic quotes and dashes in frontmatter text                                                      |
| `frontmatterAsset`, `frontmatterIcon`, type `IconComponent`       | `foundation/frontmatter-assets.ts`      | 8    | shared state: the registry MDX slides fill; a copy is always empty (23 reach it through helpers)       |
| `TableLayoutContext`, type `TableLayoutSettings`                  | `foundation/table-context.ts`           | 1    | shared state: `table` provides the context object itself, not a hook                                   |
| `useStillMotion`                                                  | `motion/still-motion.ts:33`             | 2    | shared state module (`RevealContext`)                                                                  |
| `StatValue`, `StatDelta`                                          | `foundation/stat-figure.tsx`            | 9    | moved up from phase 4: a copy reaches `RevealContext` through `use-count-up.ts:144`                    |
| `useEnter`, `enterProps`, `EnterProps`, `MAX_ENTER_ORDER`, `Step` | already in `@deckster/kit`, re-exported | 54   | entrance order and steps                                                                               |

**`@deckster/kit/layout-fields`** (Node-safe; no React, no CSS), for contracts:
`EyebrowField`, `EYEBROW_HINT`, `chromeField`, `CHROME_HINT`, `TreatmentField`, `TREATMENT_HINT`,
`treatmentProps` (it lives in `layout-fields.ts:82`), `textField`, `CONTEXT_MAX_WORDS`,
`IconNameField`, `FocalField`, `FOCAL_HINT`, `RevealField`, `REVEAL_HINT`, `ContactItem`,
`ContactEntry`, `contactsHint`, `currentProblems`, `AlignField`, `alignHint`
(`kit/src/layouts/layout-fields.ts`, `display-fields.ts`), and `DATA_HINT`, `DataField`, moved from
`chart-layout.contract.ts` so `dashboard` stops importing another layout's contract. Without the
five added names (`CONTEXT_MAX_WORDS`, `REVEAL_HINT`, `FOCAL_HINT`, `currentProblems`,
`ContactEntry`), 37 ejected layouts would copy all of `layout-fields.ts` and `link-target.ts`.

Dropped from the first list because no kit layout uses them: `TITLE_MAX_LINES` (title keeps its own
3), `fitsRegion` (used only inside `fit-level.ts`), `SafeHrefField` and `DISPLAY_ALIGNS` (used only
inside the fields modules).

The eject rewrite also maps `#` imports of parts that are public already: `Step`, `useEnter`,
`enterProps`, `QR` to `@deckster/kit`, and `Timeline`, `Milestone` to `@deckster/kit/diagrams`.

Also used directly from the engine, already public: `defineLayoutContract`, `defineLayout`,
`LayoutProps`, `useStatic`, `useReadyHold`; from the brand: `useBrand`.

The kit's own layouts switch to these exports for the parts they use (a mechanical import change),
so the API is exercised by 64 layouts and cannot rot. `Portrait` and `Marks` (used by 5–6 layouts
each) are candidates for phase 4; until then eject copies them.

**What "fully custom" means here.** A layout built on `layout-parts` still changes when the kit
changes `Frame` or `FittedText`, within the API's semver promise. Authors who want nothing to move
under them can skip the parts and write plain React and CSS: every tool still works as long as the
DOM rules in 1.7 hold.

### 3.9 Kit layouts versus data layouts versus code layouts

For the docs and the agent: data layouts in `layouts.ts` stay the right answer for a template's
fixed regions (and what the importer produces); code layouts are for anything they cannot do. A data
layout's `fallback` may name a brand code layout from phase 3, so imported regions can sit on a
custom base.

### 3.10 Eject

```
deckster layouts eject <name…> --brand <brand>
deckster layouts eject <name…> --deck <deck>
deckster layouts eject --all --brand <brand>
```

- **Source:** `FRAMEWORK_ROOT/packages/kit/src/layouts/` (installed CLI, 1.9) or the repository.
- **Closure:** starting from `<name>-layout.{tsx,contract.ts,css}`, follow `#` imports.
  - An import with a public replacement (§3.8) is rewritten to `@deckster/kit/layout-parts` or
    `/layout-fields`.
  - A stateless private helper (`pattern-slide.*`, `layout-limits.ts`, `quiz-values.ts`,
    `stat-value.ts`, `matrix-labels.ts`, `logo-state.ts`, `sources-address.ts`, `layout-geometry`,
    `density`, `portrait`, `marks`, …) is copied into `layouts/_shared/` once and imported
    relatively. Phase 0 classified every private import (§10.4).
  - A copied helper that imports its own CSS (`badges`, `portrait`, `marks`, `contact-list`,
    `frontmatter-picture`, `mono-mark`, `pattern-slide`) keeps global `.kit-*` selectors, which
    the kit's copy also loads whenever a kit layout still uses that helper. Eject renames the copied
    classes (a `brand-` prefix, or scoping under the ejected layout) so an edit cannot leak into kit
    layouts.
  - A module with shared state (1.6) is never copied: it must be public. **Phase 2 exits only when no
    kit layout's closure reaches unexported shared state**, so `--all` always works.
  - Shared CSS (`display-align.css`, `image-layout.css` for `title`) is copied next to the layout and
    its selectors are scoped to the ejected layout, so the kit copy does not apply (§3.2).
  - Local constants keep their own names and values (`title`'s `TITLE_MAX_LINES` is 3, the public one
    is 2).
- **Name:** eject keeps the name and writes `replaces: true`, because CSS is keyed on
  `.kit-frame[data-layout='<name>']`, `display-align.css` lists names, and `pptx` selectors use
  `.kit-*` classes. Renaming on eject (`--as`) is phase 5.
- **Limit cases** are written to `limits.ts` from `LIMIT_CASES[name]`, so `layouts check` keeps
  testing them. Tests are not copied.
- **Provenance:** `.eject/` holds the files **after** the import rewrite, plus `eject.json`
  (`{ layout, deckster: "<cli version>", files: { path: sha256 } }`). `brand add` already skips hidden
  paths, so this never travels by accident.
- **`--all`** ejects all 65 into one brand, with a warning that from then on kit fixes reach none of
  them except through `layout-parts`.
- **Guarantee:** a CI test ejects every kit layout into a temporary brand and builds and lints the
  `exemplars` deck against it with zero new problems, and runs the CSS removal test from §3.2. Its
  home is `packages/cli/src/layouts/eject/eject-all.test.ts`, a `vp test` unit test in `pnpm test`
  (CI "Test" step), on a `scratchWorkspace` (`cli/src/lint/scratch-workspace.fixture.ts`), as
  `commands/build.test.ts` and `lint/layout-probes.test.ts` already build and lint real decks in
  scratch workspaces. The computed-style check needs a browser page, which those tests already open
  through `deckster lint`'s server. `code` and `stats` are exempt from the CSS removal assertion
  until `code-layout.css` and `stats-layout.css` stop loading outside their layouts (1.6).

### 3.11 New, check, diff

- **`deckster layouts new <name> --brand <brand> | --deck <deck>`**: a minimal folder: a contract
  with one `body` slot, a description and an `example` (and `role: 'content'` once the page chrome
  plan adds roles); a `layout.tsx` with
  `Frame`, `SlideHeader` and `Region`; a `layout.css` with the `@layer` line every kit CSS file
  starts with; and a `limits.ts` with one case.
- **`deckster layouts check [<name>] --brand <brand> | --deck <deck>`**: §3.6 and §3.7, then renders
  the example and every limit case through the lint server, in the deck's brand or, for a brand
  layout, with the brand, and reports lint problems. The limit-case deck generator moves out of
  `cli/src/lint/budget-limits.fixture.ts` into shipped source (`cli/src/layouts/limit-deck.ts`),
  since fixtures are not staged into the installed CLI (1.9).
- **`deckster layouts diff <name> --brand <brand>`**: runs the eject transform on the current kit
  files, compares the result with `.eject/` (what you started from), and prints the kit's changes as
  a unified diff. If the kit added a private import the transform cannot place, it says so. A
  three-way `--apply` is phase 5.

### 3.12 Trust: fetched brands (decided, §9)

**`deckster brand add`.** Default unchanged: code is skipped and listed under "Left out" with reason
`code`. It now always writes `brands/<name>/.deckster-source.json` with the commit and the names of
code layouts it skipped, so a slide using one fails with "`kpi-wall` is a code layout of this brand
that `brand add` left out; add the brand again with `--allow-code` to use it".

New flag `--allow-code`:

- prints every code file with its size and the commit it came from, then asks for confirmation (or
  needs `--yes` when not interactive);
- copies `layouts/*/` and `layouts/_shared/` including `.ts`, `.tsx` and `.css`; nothing else changes
  in the allowlist (still no `package.json`, lock files or hidden files, so no dependency install);
- runs the staging check with `code: 'load'` only after confirmation;
- records `allowCode: true` in `.deckster-source.json`.

**Agent turns** need no new rule: the agent already cannot write outside slides and assets (1.4).
The turn gate in §3.4 covers reading. Agent-authored deck layouts are phase 5, and would need the
working-copy sync to carry `layouts/` and contract loading to be restricted.

### 3.13 Interaction with other plans

- **Page chrome** (`docs/page-chrome-plan.md`): contracts get `role`, and `chrome` moves into the base
  frontmatter. Neither exists today: `layout-contract.ts` has no `role`, and `chrome` is a per-layout
  field (`chromeField` in `kit/src/layouts/layout-fields.ts:41`), not base frontmatter (§10.6). This
  plan does not depend on either. When that plan lands, custom contracts get both, a replacement
  keeps the original's role (§3.6 item 7), and `layouts new` writes one (§3.11).
- **Cross-brand fallback** (`brand-layouts-plan.md` §3.3): a slide naming another brand's _data_
  layout falls back as today. Naming another brand's _code_ layout is a build error naming the brand
  that has it, found by listing folders, never by importing them. A static `fallback` on code layout
  contracts is phase 5 if this proves common.
- **Placed elements:** drawn by the engine outside the layout in canvas coordinates; they work on
  custom layouts unchanged.

## 4. Framework design

**Engine** (`engine/`)

- `LayoutContract` gains `replaces?: true`; `checkContract` accepts it. (`role` comes with the
  chrome plan, not here.)
- `slide-content.tsx` stamps `data-deck-layout` on the slide (§3.3); lazy local components with a
  per-layout error boundary (§3.5).

**Vite plugin** (`vite-plugin/`)

- `layouts/local-layouts.ts`: discovery (§3.1), version check, `importContracts` with the import
  check, loader and turn gate (§3.4), parity (§3.7).
- `layouts/load-layout-catalog.ts`: `local` option; clash checks; the replacement check (§3.6).
- Virtual modules: `virtual:deck/local-layouts`, and `virtual:deck/kit-runtime`, the generated kit
  plugin that skips replaced names (§3.2).
- `plugin.ts`: call `localLayouts` from the active deck and brand. Watching:
  - `watchBrand` stops full-reloading for `layouts/*/layout.tsx` and `.css` (Vite HMR handles them);
  - a `contract.ts`, `limits.ts` or helper change under brand or deck `layouts/` re-runs
    `importContracts`, rebuilds the catalog, invalidates every slide module and fully reloads;
  - a new deck-layouts watcher, since `watchManifest` ignores those files (1.8).
- `deckCatalog` (wrapping `localLayouts` and `loadLayoutCatalog`) exported for the CLI.

**Kit** (`kit/`)

- `src/layout-parts.ts`, `src/layout-fields.ts`, `package.json` exports, kit layouts migrated to
  them, API snapshot test.
- `src/kit-plugin.ts` (`kitPlugin(layouts)`, export `@deckster/kit/plugin`) and
  `src/layouts/all-layouts.ts`; `src/runtime.ts` becomes `kitPlugin(allLayouts)` (§3.2).
  `catalog.test.ts` keeps checking names and order; a new test checks the `<name>-layout.tsx` /
  `<camel>Layout` convention the generated module relies on.
- `layouts/replace-check.ts` (§3.6), sharing helpers with `brand-layout.contract.ts`.

**Export** (`export/`): read `data-deck-layout` (§3.3).

**Brand** (`brand/`): `isCodeHeld`, `gatedLoad`, `rememberLoaded` used by `importContracts`, and
`forgetLoaded` exported;
`find-layout-in-brands.ts` reports a code layout found in another brand (§3.13).

**CLI** (`cli/`)

- Every call site in 1.3 on `deckCatalog` with the arguments in §3.5.
- `commands/layouts-*`: `new`, `check`, `eject`, `diff`, with help text; `layouts/limit-deck.ts`
  moved from the fixture; `layouts/eject/` (closure, rewrite, CSS scoping, provenance).
- `layouts/list-layouts.ts`: `source` becomes `'@deckster/kit' | 'brand:<name>' |
  'brand-code:<name>' | 'deck:<name>'`, plus `replaces: '<source>'`. `--summary` lists deck and brand
  layouts first, as it does for brand data layouts today.
- `brand-add/`: `.deckster-source.json`, `--allow-code` (§3.12).
- `commands/brand-run.ts`: `brand` prints "Code layouts: N (names)"; `brand check` runs §3.6–3.7.

**Agent:** none; the `catalog` tool already returns `listLayouts`.

**Skills and docs**

- `create-presentation`: custom layouts appear in `deckster layouts`; prefer deck and brand layouts.
- A new reference on writing a code layout: the DOM rules in 1.7 (including the kit component
  classes), the parts in §3.8, supported imports, budgets, limit cases, PPTX mapping, readiness,
  `layouts check`.
- `docs/design.md`: a "Custom layouts" section; `README.md` and `packages/cli/README.md`.

## 5. Problems reported

No new slide lint rules are needed: budgets, slot checks, overflow and fit rules all work from the
contract and the DOM (1.7). New build and `layouts check` problems:

| Problem                       | Level   | When                                                                    |
| ----------------------------- | ------- | ----------------------------------------------------------------------- |
| `layout-folder-incomplete`    | error   | a `layouts/<name>/` without `contract.ts` or `layout.tsx`               |
| `layout-name-mismatch`        | error   | folder name and `contract.name` (or the component's name) differ        |
| `layout-name-clash`           | error   | §3.2 without `replaces`                                                 |
| `layout-replace-breaks`       | error   | §3.6 items 1–4 or 7                                                     |
| `layout-replace-pptx`         | warning | §3.6 item 6                                                             |
| `layout-contract-imports`     | error   | §3.4 import check                                                       |
| `layout-load-failed`          | error   | a contract or component throws while loading; on the slides that use it |
| `layout-held`                 | error   | a contract never loaded before an agent turn started                    |
| `layout-version`              | error   | the declared `deckster` range does not match                            |
| `layout-code-skipped`         | error   | a slide uses a code layout `brand add` left out                         |
| `layout-fallback-unavailable` | error   | a data layout falls back to a brand code layout that did not load       |

**PPTX** uses the contract's `pptx` mapping and the engine's layout stamp (§3.3). `layouts new`
writes a mapping with `.kit-title` from `SlideHeader`, so a scaffolded layout exports with a real
title placeholder.

## 6. Phases

### Phase 0: spike (one agent, one day) — done, results in §10

1. Load the fixture's `columns` contract through `runnerImport` from the CLI with no dev server, in
   the repository and from a packed CLI (`pnpm pack`, run from a temp folder with `decks/` and
   `brands/`). Measure ten contracts. Edit a helper and check the next load sees it. Confirm
   `frameworkAliases()` resolve in the installed layout, and pick the §3.4 loader.
2. Move the fixture into `brands/<test>/layouts/columns/`, wire `localLayouts` minimally into
   `plugin.ts`, and confirm dev, `shot`, lint and PPTX export render it.
3. Generate the kit layout list as a virtual module and confirm a replaced `title`'s CSS is gone.
4. Classify every private import in 1.6 as "public", "copy on eject" or "shared state".

### Phase 1: loading (parallel, split by package)

- **vite-plugin:** `localLayouts`, the import check, `importContracts` with the turn gate,
  `deckCatalog`, virtual modules, watching, clash and parity checks, version check.
- **engine + export:** `data-deck-layout`; lazy local components with error boundaries.
- **cli:** every call site on `deckCatalog`; `deckster layouts` sources; `brand` and `brand check`
  output; `.deckster-source.json` written by `brand add`.
- From the spike (§10): the loader exactly as in §3.4 with its identity test; `resolveRuntimePlugins`
  returning virtual ids unresolved; the brand stylesheet's Tailwind sources unchanged by virtual
  plugin ids; `layout.tsx` files in `optimizeDeps.entries`; a code layout in the CI package smoke
  job, which is the only CI run of the installed loader.

Exit: a hand-written brand layout and a deck layout work in dev (with HMR for components), build,
lint, `shot`, PDF and PPTX export, `deckster layouts --json` and the agent's catalog tool; an e2e case
covers each; a broken layout breaks only its own slides.

### Phase 2: public parts

- `layout-parts` and `layout-fields`, kit layouts migrated, API snapshot test. Required for the exit
  criterion: `frontmatterAsset`, `frontmatterIcon`, `TableLayoutContext`, `useStillMotion` and
  `StatValue`/`StatDelta` (§3.8, §10.4). Proposed, not required: the fit-text hooks, the five added
  `layout-fields` names, moving `DATA_HINT`/`DataField`, dropping the four unused names.
- `layouts new` and `layouts check` (with the limit deck moved into shipped source).
- The authoring reference and docs.
- Exit: no kit layout's closure reaches unexported shared state.

### Phase 3: replace

- `replaces`, the generated kit layout list skipping replaced names (`kitPlugin`,
  `all-layouts.ts`, `virtual:deck/kit-runtime`, §3.2), `display-align.css` rekeyed on an attribute,
  the compatibility check, `layout-replace-*` problems, replacements in `deckster layouts`.
- A data layout's `fallback` may name a brand code layout.

### Phase 4: eject and diff

- `eject` with closure, rewrite, CSS scoping and provenance; `--all`.
- The eject-everything CI test and the CSS removal test.
- `diff`.
- `Portrait`, `Marks` made public if eject copies of them prove awkward.

### Phase 5: later

- `brand add --allow-code` with confirmation (can move earlier if brands with code need sharing
  sooner).
- `eject --as`, `diff --apply`, deck layouts replacing brand layouts, static `fallback` on code
  contracts, agent-authored deck layouts.

## 7. Risks

- **Code from fetched brands.** The biggest change: a brand stops being data. Mitigated by
  `--allow-code` being explicit and interactive, by provenance, and by the turn gate. A user who opts
  in still runs that code in Node (contracts) and in the browser (components) with their
  permissions.
- **Loader built on Vite internals.** The chosen loader (§3.4) uses public APIs
  (`createRunnableDevEnvironment`, `resolve.builtins`, `ESModulesEvaluator`), but relies on two
  behaviours a Vite upgrade could change. It sits behind `importContracts`, a test pins both, and
  the fallback is Node `import()` with `?mtime=` (helper edits then need a restart).
- **Public API weight.** `layout-parts` becomes a promise. The snapshot test and the kit's own use
  keep it honest; the list is deliberately short.
- **Ejected copies drift** and miss kit fixes. `diff` and the version in `eject.json` make it
  visible; `--all` warns.
- **Lint quality depends on the author.** A layout that reparents slot content, measures without a
  readiness hold, or draws its own stat or code markup gets wrong lint and export results. `layouts
  check` and the authoring reference cover these but cannot prevent them.
- **Name collisions over time.** A new kit layout may take a name a brand already uses: a build error
  on upgrade. Release notes list new kit layout names; the error's fix says "rename, or add
  `replaces: true` if yours should win".

## 8. Review

A second model reviewed the first draft against the code on 2026-11-24, with probes run outside the
repository. No blockers. What changed because of it:

| Finding                                                                                                           | Change                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A replaced or ejected kit layout still loads the kit's CSS for that name; ejected rules can't be removed          | §3.2: generated kit layout list that skips replaced names; CSS scoping on eject; e2e test                                        |
| The runner transforms or crashes on JSX and CSS imports rather than rejecting them; the check was not transitive  | §3.4: static, transitive import check with an allowlist, for either loader                                                       |
| Adding layout paths to `isGatedCodeFile` does not give contracts the `brand.ts` behaviour                         | §3.4: the gate lives in `importContracts`, process-wide, with preload and reload on release                                      |
| `deckCatalog(root, deck, …)` does not fit call sites without a deck, and `brand add` must not import fetched code | §3.5: `{ root, brand?, deck?, code }` with a table per call site                                                                 |
| Eject: copied contexts break silently; diff base was pre-rewrite                                                  | §1.6, §3.8, §3.10: shared state must be public (phase 2 exit); `.eject/` stores post-rewrite files; `diff` re-runs the transform |
| Export trusts the layout's own `data-layout`                                                                      | §3.3: the engine stamps `data-deck-layout`                                                                                       |
| Lint and export also key on kit component classes                                                                 | §1.7 and the authoring reference                                                                                                 |
| `runnerImport` is experimental and forces config; second engine instance                                          | §3.4 caveats, §7                                                                                                                 |
| Brand files never get HMR today; deck layouts are not watched                                                     | §1.8, §4 watching                                                                                                                |
| One broken layout would break the whole deck                                                                      | §3.5: lazy imports with per-layout error boundaries                                                                              |
| The limit-case generator is a fixture and does not ship                                                           | §1.9, §3.11: moved into shipped source                                                                                           |
| `layout-code-skipped` had no record to work from                                                                  | §3.12: `.deckster-source.json` always written                                                                                    |
| No version gate; dependency rules unstated; replacement check misses narrowed types                               | §3.1 version and dependencies; §3.6 item 4                                                                                       |
| Over-scoped first cut                                                                                             | `--as`, `diff --apply`, deck-over-brand replacement and code `fallback` moved to phase 5; `--allow-code` moved to phase 5        |

Kept against the review's advice: `eject --all` and copying stateless private helpers into
`_shared/`. The review suggested ejecting only layouts whose imports are all public; the goal of this
plan is that a brand can take every kit layout and own it, so the closure copy stays, with the shared
state rule as the safety net.

The review also confirmed, against the code: the catalog replacement semantics, `composePlugins`
precedence, every `loadLayoutCatalog` and `deckViteConfig` call site, the `brand add` allowlist,
`isGatedCodeFile`, the loader hooks, kit exports and the 65-layout count, and that the installed CLI
carries the kit layout source. It did not check the import counts in 1.6.

## 9. Decisions

Settled on 2026-11-24, on the recommendations below.

1. **Fetched brands keep skipping code (§3.12).** `brand add` leaves code layouts out unless
   `--allow-code` is passed and confirmed, and `--allow-code` stays in phase 5. Teams that share a
   brand with code layouts do it through their own repository, which never goes through `brand add`,
   so nothing waits on it; the safe default costs nothing meanwhile.
2. **The kit's layout list is generated (§3.2).** It is the only way a replaced or ejected layout can
   drop the kit's CSS for that name, and without it eject does not deliver "fully custom". The cost
   is one virtual module and a small change to `kit/src/runtime.ts`.
3. **The public building blocks are the list in §3.8.** It is what most kit layouts actually use,
   plus every shared-state module that must never be copied (four, after phase 0; §10.4).
   `StatValue` and `StatDelta` moved into phase 2 because they reach shared state; `Portrait` and
   `Marks` wait for phase 4. Adding to the API later is cheap, taking something back is not.
4. **Contracts load through Vite's module runner (§3.4),** behind `importContracts`: one runnable
   environment per load, with `effect` and `@deckster/*` handed to Node. Phase 0 measured it in the
   repository and from an installed CLI (9–60 ms for eleven contracts, helper edits seen, one
   `effect` and engine instance) and rejected per-file `runnerImport` (6.5–13 s for ten contracts
   in a workspace without `node_modules`, §10.1). The fallback stays Node `import()` with
   `?mtime=`, where helper edits need a restart.

## 10. Spike results

Phase 0, 2026-11-24, on `feat/custom-layouts` at `11a86f2`, Node 26.13.1, vite-plus 1.7.0 (Vite
8.3.8000). The spike code was thrown away; the patch (it applies to `11a86f2`) and the test
workspaces were kept outside the repository for the phase 1 agents. Nothing below that says "not
verified" was skipped silently.

Two layouts were used: the repository (`node packages/cli/src/bin.ts …`, no loader hooks) and the
CLI packed with `pnpm pack`, installed with `npm install <tarball>` into one temp folder and run as
`node <install>/node_modules/@deckster/cli/dist/deckster.js` from a **separate** workspace folder
with only `brands/` and `decks/`. The separate folder matters: a first try installed the CLI into
the workspace itself, npm hoisted `effect` into the workspace's `node_modules`, and every loader
looked fine. A real user workspace has no `node_modules` (1.5).

### 10.1 Contract loader

Ten copies of the fixture `columns` contract, each importing `../_shared/helper.ts`, under a
workspace brand's `layouts/<name>/contract.ts`, plus an eleventh that imports
`@deckster/kit/chart-spec` (a value) and a type from `@deckster/brand` (type only, so nothing of
`@deckster/brand` was evaluated; a value import from it is not verified). Each run loads them three times in
one process: round 0 is cold (after Vite is imported, about 110 ms), the helper is edited before
the last round. Times are for the whole batch: ten contracts, except all eleven in the chosen
loader's row (the kit and brand imports were added for it).

| Loader                                                 | Repo, ms (rounds 0/1/2) | Installed, ms        | Helper edit seen | One `effect` |
| ------------------------------------------------------ | ----------------------- | -------------------- | ---------------- | ------------ |
| `runnerImport` per contract, aliases and dep plugin    | 7160 / 6480 / 6707      | 8858 / 13106 / 10132 | yes              | no           |
| One runnable environment, aliases and dep plugin       | 960 / 803 / 640         | 792 / 789 / 655      | yes              | no           |
| `createServerModuleRunner` on a middleware-mode server | 936 / 1374 / 1034       | 891 / 753 / 723      | yes              | no           |
| **One runnable environment, packages as builtins**     | **60 / 10 / 10**        | **37 / 11 / 12**     | yes              | yes          |
| Node `import()` with `?mtime=`                         | fails (see below)       | 5 / 4 / 4            | **no**           | yes          |

- Why the first three are slow and duplicate `effect`: the workspace cannot resolve `effect`, so
  `frameworkDependenciesPlugin` resolves it to a file from the framework, and a resolved file is
  inlined: about 280 `effect` modules transformed per load, and a second `effect` instance
  (`Object.getPrototypeOf(contract.schema)` differs from the CLI's). Returning
  `{ id, external: true }` from `resolveId` does not help: `fetchModule` only externalizes bare
  specifiers and builtins. The plan's "367 ms cold, 8–20 ms after" held only for the in-repository
  fixture, whose folder resolves `effect` itself (measured again: 30 ms, 8 ms, with the engine's
  `layout-contract.ts` inlined as a second engine instance).
- The chosen loader (§3.4) lists `effect` and `@deckster/*` as `resolve.builtins` and imports them
  in a custom evaluator with `import.meta.resolve`; the runner then inlines only the 11 contracts
  and the helper (12 modules). Passing `frameworkAliases()` as well inlined 14 (the engine's
  `layout-contract.ts` and the kit module came back), so the aliases must be left out.
- Node `import()` fails in the repository layout for a workspace outside the checkout
  (`ERR_MODULE_NOT_FOUND` for a bare import of the contract; the output did not show which):
  there are no loader hooks there. Installed, it works but a
  helper edit stays at the old value, as the plan said.
- `checkContract` passed on every loaded contract in every mode and layout. No code compares
  contracts or schemas by identity (only by `name`).
- Cache folders: none appeared in the workspace in any mode. `runnerImport` overrides `cacheDir`
  with `process.cwd()` whatever is passed (so its "no folder" means nothing was written, not that
  the setting was honoured); the chosen loader's own temp `cacheDir` was never created either.
- Decision: **one runnable environment per load, packages as builtins** (§3.4, §9.4).

### 10.2 End to end

A workspace in a temp folder: brand `spike` (a copy of `default`) with code layouts
`layouts/columns/` (the fixture, `replaces: true`, plus a `layout.css`) and `layouts/title/` (a
contract built from the kit's `title`, `replaces: true`), and deck `spike-deck` with a deck layout
`layouts/kpi-wall/` (a new name, budget `maxBullets: 1`) and slides on `title`, `columns` and
`kpi-wall`. A minimal `localLayouts` (discovery, the loader above, a `local` option on
`loadLayoutCatalog`, `virtual:deck/local-layouts` and `virtual:deck/kit-runtime`) was wired into
`plugin.ts`.

| Command                          | Repository | Installed | Needed a call site change                              |
| -------------------------------- | ---------- | --------- | ------------------------------------------------------ |
| `deckster build`                 | works      | works     | no (plugin only)                                       |
| `deckster dev` (module graph)    | works      | not run   | no                                                     |
| `deckster shot`                  | works      | works     | no; renders through `deck-server-live.ts`              |
| `deckster lint`                  | works      | works     | yes: `run-lint.ts:173`                                 |
| `deckster export` (PDF and PPTX) | works      | works     | yes: `run-export.ts:200`                               |
| `deckster layouts --json`        | works      | works     | yes: `load-brand-catalog.ts:64`, `list-layouts.ts:262` |

- `shot` showed the brand `columns` with its own CSS. The PPTX listed `columns` and `kpi-wall` as
  layouts. `deckster layouts` listed `title` and `columns` as `brand-code:spike` in the kit's
  positions and `kpi-wall` as `deck:spike-deck`.
- Before the lint change, lint rendered the slides but checked `kpi-wall`'s slide against no
  contract (three bullets, no `content-budget` finding); after it, `content-budget` fired. That
  `columns` was checked against the kit's contract before is read from `run-lint.ts`, not observed.
  The export row's "yes" is likewise read from the code: export was only run after the change.
- Dev was checked by fetching `virtual:deck/plugins`, `virtual:deck/local-layouts` and
  `virtual:deck/kit-runtime` from a running `deckster dev` (kit runtime without
  `columns-layout.tsx`); the slides themselves were rendered through `shot`, which uses a dev-mode
  server. HMR and the watchers in §4 were not verified.
- `deck-server-live.ts:119-135` loads the workspace's own vite-plugin only when the workspace is a
  framework checkout; no change needed (§3.5).
- Every place the spike changed, at `11a86f2`: `vite-plugin/src/plugin.ts` (`:264` catalog,
  `:289` runtime plugin list, `:310` `resolveId`, `:326` `load`, `:333` brand CSS plugin folders,
  `:463` `resolveRuntimePlugins`), `vite-plugin/src/layouts/load-layout-catalog.ts` (`local` option,
  `:64` and `:92`), `vite-plugin/src/index.ts`, `cli/src/lint/run-lint.ts:173`,
  `cli/src/export/run-export.ts:200`, `cli/src/layouts/load-brand-catalog.ts:51-53,64`,
  `cli/src/layouts/list-layouts.ts:262`, `kit/src/runtime.ts`, `kit/package.json`; new
  `vite-plugin/src/layouts/local-layouts.ts`, `kit/src/runtime-base.ts` (`kitPlugin`) and
  `kit/src/layouts/all-layouts.ts`. Not exercised: `new-slide.ts:79`, `new-deck.ts:78`,
  `check-brand-layouts.ts:23`, `slide-meta.ts:66`.

### 10.3 Generated kit layout list

Prototyped as in §3.2 (`kitPlugin(layouts)`, `all-layouts.ts`, `runtime.ts` unchanged for its
importers, `@deckster/kit/runtime` swapped for `virtual:deck/kit-runtime`); the kit's
`catalog.test.ts` still passed. In a production build of the spike deck:

- with `columns` replaced, `columns-layout.css` was gone (no `--kit-lane-head-pad`) and the brand's
  `layout.css` was in;
- with `title` replaced too, `[data-layout=title]` selectors went from 12 to 3, the 3 being
  `display-align.css`, which `section`, `statement` and `image-reveal` still load (§3.2).

Every importer of the kit runtime, which is why `runtime.ts` stays static: `kit/src/catalog.test.ts`,
`kit/src/components/component-catalog.test.tsx`, `kit/src/layouts/brand-layout.test.ts` (all under
the kit's `vite.config.ts`, which already stubs `virtual:deck/brand`), `vite-plugin/src/plugin.ts:61`
(`DEFAULT_RUNTIME_PLUGINS`, also used by `e2e/support/case-servers.ts:44`) and
`vite-plugin/src/framework-resolve.ts:21` (dependency scan entry). Nothing in `scripts/`, `skills/`
or the export tests imports it. `presenter-deck.fixture.tsx` imports the presenter's own runtime.

### 10.4 Private imports

A script followed every `#`, relative and CSS import from every file in `kit/src/layouts/`,
stopping where all imported symbols are public (§3.8 as first written, or an existing
`@deckster/kit` export), and grepped each module for contexts, module-level `let` and
collections, registries and listeners; each hit was read by hand. "Direct" counts layouts that
import the module; "eject" counts layouts whose eject closure would copy it under the first §3.8.

| Module                                                                                               | Direct | Eject | Class                  | Notes                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------ | ----- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `foundation/slide-parts.tsx`                                                                         | 58     | 0     | public                 | Frame 58, SlideHeader 48, Footnote 47, Region 46, FittedText 11, Eyebrow 8                  |
| `motion/enter.ts`                                                                                    | 54     | 0     | public                 | also `EnterProps` (6), `MAX_ENTER_ORDER` (1), already in `@deckster/kit`                    |
| `foundation/smart-punctuation.ts`                                                                    | 50     | 0     | public                 |                                                                                             |
| `layouts/layout-fields.ts`                                                                           | 63     | 37    | public, list too short | `CONTEXT_MAX_WORDS` 23, `REVEAL_HINT` 19, `FOCAL_HINT` 10, `currentProblems` 6 were missing |
| `foundation/fit-level.ts`                                                                            | 35     | 0     | public                 |                                                                                             |
| `motion/step.tsx`                                                                                    | 29     | 0     | public (existing)      | provides `RevealContext`                                                                    |
| `foundation/fit-text.ts`                                                                             | 12     | 14    | made public            | `useFitGroupWidth` 8, `FitRung` 4, `useRenderOnFontLoad` 1                                  |
| `foundation/stat-figure.tsx`                                                                         | 9      | 9     | made public            | its copy reaches `RevealContext` via `use-count-up.ts:144`, and 9 diagram modules           |
| `foundation/frontmatter-assets.ts`                                                                   | 8      | 23    | **shared state**       | registry `:18` filled by MDX slides; missing from the first §3.8                            |
| `foundation/media-treatment.tsx`                                                                     | 7      | 0     | public                 | provides `MediaFrameContext`                                                                |
| `media/media-frame.ts`                                                                               | 0      | 0     | shared state, internal | reached only behind `TreatedMedia`; no hook needed                                          |
| `foundation/portrait.tsx`                                                                            | 6      | 6     | copy                   | own CSS; imports frontmatter-assets (rewritten), initials, slide-file                       |
| `foundation/layout-geometry.ts`                                                                      | 6      | 19    | copy                   | imports `lists`                                                                             |
| `foundation/marks.tsx`                                                                               | 5      | 5     | copy                   | own CSS                                                                                     |
| `layouts/pattern-slide.{tsx,contract.ts,css}`                                                        | 7      | 7     | copy                   | imports frontmatter-assets (rewritten), slide-file                                          |
| `foundation/quote-marks.ts`                                                                          | 4      | 4     | copy                   |                                                                                             |
| `foundation/slide-file.ts`                                                                           | 4      | 20    | copy                   | `useSlide().file`; no state                                                                 |
| `layouts/display-fields.ts`                                                                          | 4      | 0     | public                 |                                                                                             |
| `layouts/display-align.css`                                                                          | 4      | 4     | copy, scoped           | names four layouts (§3.2)                                                                   |
| `foundation/badges.tsx`                                                                              | 3      | 3     | copy                   | own CSS                                                                                     |
| `foundation/frontmatter-picture.tsx`                                                                 | 3      | 3     | copy                   | own CSS; imports frontmatter-assets (rewritten)                                             |
| `links/link-target.ts`                                                                               | 2      | 38    | copy                   | constant set only; reached through layout-fields                                            |
| `foundation/contact-list.tsx`                                                                        | 2      | 2     | copy                   | own CSS; imports `links/link.tsx`, layout-fields' `ContactEntry`                            |
| `foundation/mono-mark.tsx`                                                                           | 2      | 2     | copy                   | own CSS; imports frontmatter-assets (rewritten), `layouts/logo-state`                       |
| `foundation/density.ts`                                                                              | 2      | 2     | copy                   | imports fit-text, layout-geometry                                                           |
| `foundation/brand-logo.tsx`                                                                          | 2      | 0     | public                 |                                                                                             |
| `motion/still-motion.ts`                                                                             | 2      | 9     | public, shared state   | `RevealContext` `:11`; `useStillMotion` itself reads no context                             |
| `apps/app-chrome.tsx`                                                                                | 2      | 2     | copy                   | no state, styled by global `apps.css`                                                       |
| `layouts/layout-limits.ts`                                                                           | 2      | 2     | copy                   | content, split                                                                              |
| `foundation/table-context.ts`                                                                        | 1      | 1     | **shared state**       | `table` needs `TableLayoutContext` itself, not a hook                                       |
| `links/qr.tsx`                                                                                       | 1      | 0     | public (existing)      | `QR` in `@deckster/kit`                                                                     |
| `diagrams/lazy-diagrams.tsx`                                                                         | 1      | 0     | public (existing)      | `Timeline` in `@deckster/kit/diagrams`; its subtree has caches                              |
| `diagrams/form-parts.tsx`                                                                            | 1      | 0     | public (existing)      | `Milestone`, checked by element type in `Timeline`: never copy                              |
| `diagrams/word-breaks.ts`                                                                            | 1      | 1     | copy                   | features                                                                                    |
| `motion/css-duration.ts`                                                                             | 1      | 10    | copy                   | image-reveal; also via use-count-up                                                         |
| `layouts/quiz-values.ts`, `stat-value.ts`, `logo-state.ts`, `matrix-labels.ts`, `sources-address.ts` | 1 each | 1–9   | copy                   | constants and pure functions                                                                |
| `layouts/chart-layout.contract.ts`                                                                   | 1      | 1     | moved to layout-fields | `dashboard` imports `DATA_HINT`, `DataField`                                                |
| `layouts/image-layout.css`                                                                           | 1      | 1     | copy, scoped           | `title` uses only `.kit-image-scrim`                                                        |

With the first §3.8, **33 of the 64 layouts** reached unexported shared state
(`frontmatter-assets` directly or through `portrait`, `frontmatter-picture`, `mono-mark` and
`pattern-slide`; `RevealContext` through `stat-figure`; `table-context`). §3.8 now exports
`frontmatterAsset`, `frontmatterIcon`, `TableLayoutContext` and `StatValue`/`StatDelta`, after
which no closure should reach unexported shared state (expected from the table; the script was not
re-run with the amended list, and `links/link.tsx`, reached through `contact-list`, was not checked
for state); the eject transform must still rewrite those
imports inside copied helpers. The §1.6 counts were right except `@deckster/engine/layout` (65
files, 73 statements), `effect` (65) and `fit-text` (12), and its media-frame sentence was wrong;
both are corrected there, with the hazards the plan missed.

### 10.5 Other checks

- **Test fixtures.** The vite-plugin e2e suites serve `e2e/fixtures/` as their workspace
  (`brands/fx-brand`, `fx-other`, `decks/*`; `case-servers.ts:39-48` adds the `layouts/` catalog
  and runtime, whose `columns` silently overrides the kit's). CLI unit tests copy decks from
  `cli/fixtures/decks/` into `scratchWorkspace()` (`cli/src/lint/scratch-workspace.fixture.ts`,
  framework brands symlinked, fixture brands written by `fixture-brands.fixture.ts`).
  Recommended homes: vite-plugin e2e code layouts in `e2e/fixtures/brands/fx-code/layouts/<name>/`
  with a deck `e2e/fixtures/decks/code-layouts/` that has its own `layouts/`; CLI cases as
  `cli/fixtures/brand-files/<name>/layouts/…` and `cli/fixtures/decks/code-layouts/`, copied into a
  scratch workspace; `localLayouts` and `importContracts` unit tests in `mkdtemp` folders as
  `deck-css-guard.test.ts` does. The e2e `layouts/` catalog fixture can move to `fx-code` once code
  layouts work. Never under the repository's top-level `brands/` or `decks/`, which are built and
  published.
- **Turn gate.** Usable from vite-plugin; details and the two gaps in §3.4.
- **CI home** for eject-everything: `pnpm test` (`vp test` in `@deckster/cli`), §3.10. CI runs
  `pnpm test` in the main job and on Node 26.0.0, `pnpm test:e2e` only in the main job, and the
  package smoke job (packed CLI in an empty folder) runs only `new`, `lint`, `build`, `shot`,
  `export --pdf` and `types`. Adding a code layout to that smoke job would cover the installed
  loader in CI; recommended for phase 1.
- **`isSafeName`** (`brand/src/schema/safe-name.ts:25`: kebab-case, at most 64 characters) fits
  layout folder names: `checkContract` already demands kebab-case names but has no length limit, so
  discovery checks each folder name with `isSafeName`, and `_shared`, `.eject` and other names
  starting with `_` or `.` can never be layouts. `layouts new` and `eject` check their `<name>`
  arguments with it before joining a path.

### 10.6 `role` and `chrome`

`engine/src/contract/layout-contract.ts` has no `role`, and `chrome` is not in the base frontmatter
(`engine/src/contract/slide-frontmatter.ts`; its only `role` is a background tint's). `chrome` is
a per-layout field from `chromeField` (`kit/src/layouts/layout-fields.ts:41`). So `role` is out of
§3.6 item 7, §3.11 and §3.13 until the page chrome plan lands; `chromeField` and `CHROME_HINT` stay
in `layout-fields` meanwhile.

### 10.7 What the spike changed in the plan

- §3.4: the loader is one runnable environment with packages as builtins, not `runnerImport`;
  `frameworkAliases()` must not be passed; the second-instance caveat is gone.
- §3.2: concrete kit runtime design, two traps (`this.resolve` skips the caller; Tailwind sources),
  and `display-align.css` needs rekeying.
- §1.3, §3.5: `deckViteConfig` callers and `deck-server-live.ts` need no change; `slideMetaReader`
  gets local layouts itself; frozen phase 1 API and call sites with line numbers.
- §1.6, §3.8, §3.10: shared state the plan missed (`frontmatter-assets`, `RevealContext` through
  `stat-figure`, `TableLayoutContext` itself), missing and unused names, helper CSS, `code` and
  `stats` CSS loaded outside their layouts, rewrites to existing exports.
- §3.6, §3.11, §3.13, §4: `role` waits for the page chrome plan.

### 10.8 Phase 3 notes

Where phase 3 differs from §3.2, §3.6 and §5, and why:

- **Stylesheet order.** `kitPlugin` (`kit/src/kit-plugin.ts`) imports no stylesheet. The nine
  stylesheets `runtime.ts` imported last moved to `kit/src/kit-styles.ts`, which `runtime.ts` and
  `virtual:deck/kit-runtime` import after the layouts. Without that, `media.css` came before
  `image-layout.css` and the two `.kit-image-caption` rules swapped. With no layout replaced, the
  built CSS of `decks/layouts` has the same rules as before (compared as a multiset; the only
  change is the three rekeyed `display-align.css` selectors below), and the generated module gives
  exactly the static runtime's CSS. The order is not byte-identical. The blocks of
  `brand-layout.css`, `morph.css` and `foundation/badges.css` now come before the layouts'
  stylesheets instead of after them, and the moved `code-layout.css` and `stats-layout.css` rules
  follow their layouts. Those selectors exist only in their own files. A pairwise check of
  reordered rules (same layer, same specificity, a shared property and subject class) found only
  `.kit-demo-aside p`/`li` against `.kit-code-aside p`/`li`, which never match the same element.
- **CSS loaded outside its layout (§10.3).** `code-layout.css` is now imported by
  `code-layout.tsx` instead of `runtime.ts`; only that layout uses its classes. `stats-layout.css`
  was split: the stat-card rules (`.kit-stat*`) moved to `layouts/stat-cards.css`, which
  `stat-row.tsx` (the `StatRow` chart) and `stats-layout.tsx` both import. `stats-layout.css` keeps
  only the layout's own rules (`.kit-frame[data-layout='stats']`, `.kit-stats`,
  `.kit-stats-context`), which only `stats-layout.tsx` imports. With a kit layout replaced, these
  still load: `kit-styles.ts` (component and chrome styles), `stat-cards.css` while `StatRow` is
  loaded, and a stylesheet the replaced layout shares with a layout that stays (`image-layout.css`
  through `title-layout.tsx`, `display-align.css` while one of `title`, `section`, `statement` or
  `image-reveal` stays). None of these is keyed on the replaced layout's name any more.
- **`display-align.css`** is keyed on `.kit-frame[data-display-align][data-align='center']`, which
  keeps the old specificity. The four layouts set `data-display-align=""` on their frame.
  Computed eyebrow and `::after` styles for all four, centred and not, are unchanged in dev and in
  a build. The backdrop mask was not exercised: the default brand has no placed-art backdrop.
- **Problem levels.** `LayoutProblem` gains an optional `level` (`warning` | `note`). Warnings and
  notes go to the new `LocalLayouts.warnings` and are never in `problems`, because `problems`
  fails every slide on the layout. The budget note has its own code, `layout-replace-budget`.
  `replaces: true` on a name no kit or engine layout has is a `layout-contract-invalid` problem.
- **A breaking replacement is left out.** If the replacement breaks the layout it replaces, it does
  not join the catalog, and the kit layout keeps its name. The `layout-replace-breaks` problems
  name the layout, so slides on it fail with the reason, as with a name clash. `replaced` lists
  only replacements that joined the catalog, so the kit never skips a layout that nothing
  registers.
- **Where the check lives.** Items 1–3 and 5–7 are `checkReplacement` in
  `kit/src/layouts/replace-check.ts`, exported from `@deckster/kit/catalog`. The deck plugin
  already imports that module statically for `checkBrandLayouts`, and the kit imports nothing from
  the plugin, so this adds no cycle. Item 4 needs decks, so it is `checkReplacedSlides` in the
  deck plugin, exported from `@deckster/vite-plugin`. The build does not call it, because the
  build already fails a slide that does not fit.
- **Item 1** follows the plan literally: a field the original requires must stay required, even
  though making it optional breaks no slide. The same goes for slots (item 2) and the title
  (item 7). A `body` the replacement does not describe counts as accepting anything.
- **Item 3** decodes the original's example and every `LIMIT_CASES[name]` entry that the original
  accepts on its own (`replacementSamples`). Today every kit layout accepts all of its cases; a kit
  test asserts that, and asserts that an unchanged copy of every kit contract passes the check.
  Samples that fail for the same reason give one error ("its example and 4 more"), and a sample
  that fails on a field item 1 already reports as missing gives none.
- **Deck layouts** can replace a kit layout too (§3.2 allows any code layout). A deck layout named
  like a kit layout that the brand already replaces is a brand-layout clash (phase 5).
- **§3.9.** A data layout's fallback is checked against the catalog modules' layouts and the
  brand's code layouts, including a replacement. The CLI's `brand check`
  (`cli/src/layouts/check-brand-layouts.ts`) still passes only the kit and engine contracts, so it
  rejects such a fallback until the CLI follow-up passes `deckCatalog`'s index. A known gap: when
  that brand code layout is not in the catalog (`code: 'skip'`, a contract that fails to load or
  is held, a version mismatch), the data layout's fallback is unknown and the brand's data layouts
  fail as a whole (`invalidBrandLayouts`, "not a layout of the kit, the engine or the brand's code
  layouts"), as for any unknown fallback, instead of only that data layout being left out.
- **`kitLayoutModule`** (exported from `@deckster/kit/catalog`) states the
  `layouts/<name>-layout.tsx` / `<camelName>Layout` convention. The generator uses it, and a kit
  test checks every catalog layout against it.

### 10.9 Phase 4 notes

Where phase 4 differs from §3.10 and §3.11, and what it found:

- **Count.** `--all` ejects 64 layouts, not 65: `brand`, the renderer of data layouts, is not in the
  catalog and is refused by name. `--all` skips layouts the brand already has a folder for and lists
  them; naming such a layout is still an error.
- **Exports.** The kit's modules keep their named exports (`titleLayoutContract`, `titleLayout`),
  which the component file imports, and gain the default export a code layout needs.
- **Helper classes are renamed, with `own-` (or `dck-`).** A copied helper's stylesheet lives in `_shared/`, used
  by several layouts, so it cannot be scoped to one. Its classes are renamed from `kit-…` to `own-…`
  in every ejected file instead. Which classes a helper owns is computed from the kit: the classes
  its stylesheet selects that no kit code outside `layouts/` and the copied helpers uses (21 classes
  in 7 stylesheets). The prefix has the length of `kit-` on purpose, so a rename moves no line break
  and the files stay formatted. A layout's own files are renamed only for the helpers it copies.
  A deck's copy uses `dck-…` instead, as long as `kit-` too: a deck's slides load its brand's
  layouts as well, so a deck that ejects the same helper as its brand would otherwise restyle the
  brand's copy. It does not start like the engine's `deck-…` classes.
- **Shared layout stylesheets are scoped with `:where`.** `display-align.css`, `image-layout.css`
  (for `title`) and `stat-cards.css` (for `stats`) are copied into the layout's folder. A selector
  that names the frame gets `:where([data-layout='<name>'])`, any other is put under
  `:where(.kit-frame[data-layout='<name>'])`, and rules keyed only on other layouts are dropped. A
  selector keyed on this layout and others is kept and narrowed with `:where([data-layout='<name>'])`;
  a `:root` rule or an `@scope` block is copied as it is and reported as a problem.
  `:where` keeps the specificity, so the cascade inside the layout does not move. The kit's copy of
  these three still applies to the ejected layout while something else loads it (another display layout, the kit's `image`; `stat-cards.css` always, through the `StatRow` chart): their classes are also used by kit components
  (`.kit-stat-value`, `.kit-image-caption`, `.kit-eyebrow`), so they cannot be renamed. Removing a
  rule from such a copy therefore shows only once the kit's copy is not loaded. The CSS removal test
  uses `title`'s own `layout.css`, as §3.2 asks.
- **`_shared` policy.** A helper already in `_shared/` is reused when it is byte for byte what the
  eject would write. When it differs (edited, or written by another version) eject refuses and
  writes nothing; `--keep-shared` keeps the existing file, which the new layout then imports. The
  pristine helper is always stored under the layout's `.eject/_shared/`, so `diff` covers helpers.
- **Provenance paths.** `eject.json` keys a layout's files by name and its helpers as
  `_shared/<file>`; `.eject/` mirrors that.
- **`diff`** takes `--deck` too, exits with 0 unless `--fail-on-change`, and reports three things
  besides the patch: files the kit's layout now needs or stopped needing, why the kit's layout does
  not eject cleanly any more (unexported shared state, a contract import the loader refuses, a
  package a workspace cannot resolve), and `.eject/` files changed since the eject.
- **Contracts.** No kit contract needed special handling: all 64 reach only `.ts` files
  (`pattern-slide.contract.ts`, `quiz-values.ts`, `stat-value.ts`, `link-target.ts` go to `_shared/`)
  and allowed packages. `layout-fields` was not extended, and `Portrait` and `Marks` stay private:
  their copies (with `initials.ts` and `slide-file.ts`) eject cleanly.
- **Formatting.** The transform prints import blocks, scoped selectors and `limits.ts` the way the
  repository's formatter does. Running `vp fmt` over all 64 ejected layouts and 33 helpers changed
  no file (checked by hand in a scratch folder, not by a test: the formatter needs the repository's
  configuration).
- **Kit fixes eject exposed** (each also affects hand-written replacements):
  - `image-layout.css` set `.kit-image-caption { text-wrap: balance }`, which `media.css` always
    overrode in the kit (same specificity, loaded later). A code layout's stylesheet loads after the
    kit's, so an ejected `image` wrapped its caption differently. The dead declaration is removed.
  - `equation` picked its fit level without `restartOnFontLoad`. `useFitLevel` only steps down, so
    the kit layout, measured once in the fallback face in a static render (`deckster shot`), kept a
    smaller step than the same layout loaded lazily as a code layout, which is first measured with
    the real fonts (`layouts` deck, `equation-budget`; in `deckster dev` both gave the same step).
    The code layout's render was the right one: nothing overflowed. `equation` now passes
    `restartOnFontLoad: true`, which changes that one slide in the kit's static renders. The same
    can happen in any of the layouts that call `useFitLevel` without that option; none showed a
    difference on the `layouts` or `exemplars` decks. Not checked in a production build.
- **Known gap, phase 3.** An ejected `image` beside the kit's `title` still gets the kit's
  `image-layout.css`, because `title-layout.tsx` imports it and four of its rules are keyed on
  `[data-layout='image']` (read from the code, not rendered; the tests eject both). Ejecting
  `title` as well avoids it.
- **The `Image` component owns its styles (kit change).** `image-layout.css` had rules for the
  layout's own `.kit-image-frame` and `.kit-image-caption` that were not keyed on the layout, and
  `media/image.tsx` emits the same class names on any slide. In the kit every layout's stylesheet
  is always loaded, so an `<Image caption>` on a `content` slide took them (its caption stands
  over the bottom of the photo). A code layout's stylesheet loads when the layout first renders,
  so with `image` and `title` ejected the same slide rendered without them until an `image` slide
  had been shown. Now those rules are keyed on the layout in `image-layout.css`
  (`:where(.kit-frame[data-layout='image'])`, no added specificity), and `media.css` starts with
  what `<Image>` took from them, under `:where(.kit-image) >`, in the same order relative to its own
  rules. The kit renders as before: 376 slides of `layouts`, `exemplars`, `lookbook` and
  `components` are byte for byte the same PNG before and after. The copy keeps the odd parts on
  purpose (the caption's colors name `--kit-photo-text`, which is only set inside the image layout,
  so the caption inherits its color); whether a caption should stand over the photo is a design
  question this did not touch. `title`'s scoped copy of `image-layout.css` no longer carries those
  rules. The eject test has a probe slide for it, shot alone. `stat-cards.css` has rules of the
  same kind, but the kit's plugin always loads it through the `StatRow` chart.
- **Guarantee test** (`cli/src/layouts/eject/eject-all.test.ts`, about three minutes): on a real copy
  of the default brand it renders `exemplars` and `layouts` before any eject, then with all 64
  ejected checks that the layouts load with no problem or warning, replace all 64, keep their limit
  cases, typecheck, build, lint with no new finding, and that all 150 slides are byte for byte the
  same PNG. A second case ejects 13 layouts (one per helper stylesheet, the four that share a
  stylesheet with a kit layout, `table`, `code`) and compares all 124 slides again with the kit and
  the copies side by side, then runs the CSS removal check. `layouts check` over all 64 (393
  cases, 142 s alone) is not part of the test. Run by hand it reports two `canvas-overflow` errors
  on `image-reveal`'s example, which the kit layout gives for the same slide (the example's inline
  SVG), and one `off-brand` warning on a `bento` limit case; everything else is clean.
