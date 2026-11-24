# Plan: custom code layouts in brands and decks

Status: proposal, 2026-11-24. Nothing is built. Reviewed by a second model the same day; its findings
are folded in and listed in §8. The open decisions are settled in §9.

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
`chrome` into the base frontmatter. Custom layouts get both like kit layouts do (§3.13).

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
workspace's own vite-plugin copy, `:119-135`).

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

Imports across the 65 layouts and their contracts:

- **Engine:** `@deckster/engine/layout` (73), `@deckster/engine` (65: `defineLayout`, `LayoutProps`,
  `useStatic`), `@deckster/engine/command` (4). `effect` (66).
- **Kit, private** (`#` imports, `kit/package.json` `imports: { "#*": "./src/*" }`):
  `#layouts/layout-fields.ts` (68), `#foundation/slide-parts.tsx` (58), `#motion/enter.ts` (54),
  `#foundation/smart-punctuation.ts` (50), `#foundation/fit-level.ts` (35), `#motion/step.tsx` (29),
  `#foundation/fit-text.ts` (13), `#foundation/stat-figure.tsx` (9),
  `#foundation/frontmatter-assets.ts` (8), `#foundation/media-treatment.tsx` (7),
  `#foundation/portrait.tsx` (6), `#foundation/layout-geometry.ts` (6), `#foundation/marks.tsx` (5),
  and a long tail used by one to four layouts (`quote-marks`, `slide-file`, `badges`,
  `frontmatter-picture`, `density`, `contact-list`, `mono-mark`, `brand-logo`, `#apps/app-chrome`,
  `#links/link-target`, `#links/qr`, `#motion/still-motion`, `#motion/css-duration`,
  `#foundation/table-context`, `#diagrams/{form-parts,lazy-diagrams,word-breaks}`).
- **`@deckster/brand/runtime`** (17, `useBrand`).
- **Modules with shared React context**, which cannot be copied without breaking the link to the
  kit's providers: `foundation/table-context.ts`, `motion/still-motion.ts` and `media/media-frame.ts`
  (reached through `TreatedMedia` and `Step`, and directly by `table`, `image-reveal` and
  `screen-story`).

Already public in `kit/src/index.ts`: `useEnter`, `enterProps`, `Step`, `Morph` and the components
(`Image`, `Icon`, `Code`, `Place`, …). Not public: `Frame`, `Region`, `SlideHeader`, `Eyebrow`,
`FittedText`, `Footnote`, `useFitLevel`, `TreatedMedia`, `BrandLogo`, `smartPunctuation`, and all of
`layout-fields` and `display-fields`.

**Eject hazards** (code that does not travel cleanly):

- every layout imports its own CSS and contract through `#layouts/…`;
- `title-layout.tsx:13-15` imports `display-align.css`, `image-layout.css` and its own CSS;
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
order. Fix: the Vite plugin generates the kit's layout list as a virtual module from the catalog,
importing one module per kit layout and **skipping replaced names**. `kit/src/runtime.ts` keeps its
components, chrome and CSS that are not per-layout, and takes the layout list from that module. CSS
shared by several layouts (`display-align.css`, `image-layout.css` imported by `title`) stays
loaded while any layout that imports it is loaded; eject copies such files and scopes them to the
ejected layout (§3.10). An e2e test removes a rule from an ejected `title` and asserts the computed
style changes.

### 3.3 The engine stamps the layout name

`slide-content.tsx` sets `data-deck-layout="<name>"` on the slide's section from the frontmatter,
and export reads that instead of the first `[data-layout]` (`collect-scene.ts:44`). The layout's own
`data-layout` stays a styling hook. A custom layout then exports under the right PPTX mapping
whatever markup it draws, and a typo cannot silently pick the `default` mapping.

### 3.4 Loading contracts: static check, module runner, turn gate (decided, §9)

**Static import check first, for both loaders.** Before anything is evaluated, `importContracts`
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

**Then the loader.** Two options:

| Option                              | Edits reload                            | Transitive helpers reload           | Resolution                                  | Status                                                 |
| ----------------------------------- | --------------------------------------- | ----------------------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Node `import()` + `?mtime=`         | the contract only                       | no: an imported helper stays cached | the CLI's loader hooks                      | stable                                                 |
| Vite module runner (`runnerImport`) | yes, a fresh runner per catalog rebuild | yes                                 | Vite, with the framework aliases and plugin | `@experimental` in Vite 8.3.8 (`index.d.ts:3822-3826`) |

**Recommended: the module runner**, hidden behind `importContracts(files)` so it can be swapped.
Verified in the repository with the installed Vite 8.3.8 (vite-plus 1.7.0): the fixture catalog
loads in 367 ms cold and 8–20 ms after, and `checkContract` passes on the result. Caveats to settle in
phase 0:

- `runnerImport` forces `configFile: false`, `envDir: false`, `cacheDir: process.cwd()` and
  `resolve.external: true` over the inline config (`vite-plus-core` `chunks/node.js:42400-42418`).
  Always pass `frameworkAliases()` and `frameworkDependenciesPlugin()`; set `cacheDir` explicitly to
  a temp folder so a user's workspace gets no cache folder.
- In the repository, linked engine source is inlined, so contracts are built by a second instance of
  the engine module. Nothing may compare contracts or schemas by identity; a test asserts it.
- Unverified for the installed CLI, where the framework sits under `node_modules` and may be
  externalized. If it fails there, fall back to `createServerModuleRunner` on a lightweight server,
  or to Node `import()` with `?mtime=` plus the rule that helpers changes need a restart.

**Then the turn gate.** `importContracts` itself checks `isCodeHeld`: during an agent turn it never
evaluates a contract, returns the contract last loaded for that file from the process-wide gate
(`rememberLoaded`), and reports `held` as an error when there is none, as `load-brand.ts:437-446`
does for `brand.ts`. The dev server preloads all local contracts at start, before any turn, and the
`loadedWhileHeld`/`onCodeReleased` path (`active-brand.ts:192-198`) reloads them when a turn ends. A
cache inside the plugin instance is not enough: lint, export and `shot` start a fresh server per run,
and the agent's catalog tool calls `listLayouts` outside any plugin.

### 3.5 One resolver for every path

```ts
localLayouts({
  root: string,
  brand?: string,          // brand code layouts
  deck?: string,           // deck code layouts
  code: 'load' | 'skip',   // 'skip': discover and list, never import
}): Effect<LocalLayouts>

type LocalLayouts = {
  readonly catalogs: readonly LocalCatalog[];      // brand code, then deck code
  readonly components: readonly string[];          // absolute layout.tsx paths, for the runtime plugin
  readonly replaced: readonly string[];            // kit names not to load (§3.2)
  readonly files: readonly string[];               // everything found, for watching
  readonly problems: readonly LayoutProblem[];
};
```

Per call site:

| Call site                                                       | brand | deck | code                                                |
| --------------------------------------------------------------- | ----- | ---- | --------------------------------------------------- |
| Vite plugin (dev, preview, site build, lint/export/shot server) | yes   | yes  | `load`                                              |
| `deckster layouts`, agent `catalog` tool, `new slide`           | yes   | yes  | `load`                                              |
| `deckster new <deck>` (`createDeck`, before the deck exists)    | yes   | no   | `load`                                              |
| `deckster brand check`                                          | yes   | no   | `load`                                              |
| `deckster brand add` (staging)                                  | yes   | no   | `skip`, or `load` after `--allow-code` is confirmed |
| `run-lint.ts:173`, `run-export.ts:200`                          | yes   | yes  | `load`                                              |
| `scripts/docs/data/deck-slides.ts`                              | yes   | yes  | `load`                                              |
| `skills/brand-import/.../fw_layouts_check.mts`                  | no    | no   | kit only                                            |

- **Runtime plugin:** a virtual module `virtual:deck/local-layouts` lists the components. Each is
  imported lazily and wrapped so that one layout that fails to compile or throws on import becomes a
  slide problem on the slides that use it ("layout `kpi-wall` failed to load: …"), not a broken deck.
  Paths are written with `normalizePath` and `JSON.stringify`, as `pluginsModuleCode` does, for
  Windows. It is appended after the kit plugin and before the dev-only plugins, which define no
  layouts; a test keeps it that way.
- **`loadLayoutCatalog`** gets a `local` option next to `brand`: brand code catalogs after the kit,
  then brand data layouts (the clash check now also covers brand code names), then deck code.
- **The kit-only fallback** in `load-brand-catalog.ts:89` stays for a broken brand, and now also for
  broken local layouts, so `deckster layouts` still answers, with the problem as a warning.
- **`deck-server-live.ts`'s workspace-copy path** (`:119-135`) loads the workspace's vite-plugin; it
  must be new enough to know `localLayouts`, or the run fails with a clear message.

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
7. **Title and role:** a required title stays required; the role (page chrome plan) stays the same.

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

**`@deckster/kit/layout-parts`** (browser; imports its own CSS):

| Export                                                  | From                                                    | Why                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Frame`, `Region`                                       | `foundation/slide-parts.tsx:77,129`                     | brand margins, safe area, grid variables, backdrop, `.kit-frame` scoping for kit type and table styles |
| `SlideHeader`, `Eyebrow`, `Footnote`, `TITLE_MAX_LINES` | `slide-parts.tsx:159,197,300`                           | the standard header, with `.kit-title` for PPTX                                                        |
| `FittedText`                                            | `slide-parts.tsx:262`, `fit-text.ts`                    | type that steps down to fit, `data-fit` for lint, readiness hold                                       |
| `useFitLevel`, `fitsRegion`                             | `foundation/fit-level.ts:87,116`                        | density steps for content that may not fit                                                             |
| `TreatedMedia`, `treatmentProps`                        | `foundation/media-treatment.tsx:56`                     | brand image treatments (owns the media-frame context)                                                  |
| `BrandLogo`                                             | `foundation/brand-logo.tsx:26`                          | the surface's logo variant                                                                             |
| `smartPunctuation`                                      | `foundation/smart-punctuation.ts`                       | typographic quotes and dashes in frontmatter text                                                      |
| `TableContext` hooks, `useStillMotion`                  | `foundation/table-context.ts`, `motion/still-motion.ts` | shared context: must be the kit's instance, never a copy (1.6)                                         |
| `useEnter`, `enterProps`, `Step`                        | already in `@deckster/kit`, re-exported                 | entrance order and steps                                                                               |

**`@deckster/kit/layout-fields`** (Node-safe; no React, no CSS), for contracts:
`EyebrowField`, `EYEBROW_HINT`, `chromeField`, `CHROME_HINT`, `TreatmentField`, `TREATMENT_HINT`,
`textField`, `IconNameField`, `FocalField`, `RevealField`, `SafeHrefField`, `ContactItem`,
`contactsHint`, `AlignField`, `alignHint`, `DISPLAY_ALIGNS` (`kit/src/layouts/layout-fields.ts`,
`display-fields.ts`).

Also used directly from the engine, already public: `defineLayoutContract`, `defineLayout`,
`LayoutProps`, `useStatic`, `useReadyHold`; from the brand: `useBrand`.

The kit's own layouts switch to these exports for the parts they use (a mechanical import change),
so the API is exercised by 65 layouts and cannot rot. `StatFigure`, `Portrait` and `Marks` (used by
5–9 layouts each) are candidates for phase 4; until then eject copies them.

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
    `density`, `stat-figure`, `portrait`, `marks`, …) is copied into `layouts/_shared/` once and
    imported relatively. Phase 0 classifies every private import in 1.6.
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
  `exemplars` deck against it with zero new problems, and runs the CSS removal test from §3.2.

### 3.11 New, check, diff

- **`deckster layouts new <name> --brand <brand> | --deck <deck>`**: a minimal folder: a contract
  with one `body` slot, a description, an `example` and `role: 'content'`; a `layout.tsx` with
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
  frontmatter. Custom contracts get both; a replacement keeps the original's role (§3.6).
- **Cross-brand fallback** (`brand-layouts-plan.md` §3.3): a slide naming another brand's _data_
  layout falls back as today. Naming another brand's _code_ layout is a build error naming the brand
  that has it, found by listing folders, never by importing them. A static `fallback` on code layout
  contracts is phase 5 if this proves common.
- **Placed elements:** drawn by the engine outside the layout in canvas coordinates; they work on
  custom layouts unchanged.

## 4. Framework design

**Engine** (`engine/`)

- `LayoutContract` gains `replaces?: true` (and `role` from the chrome plan); `checkContract`
  accepts it.
- `slide-content.tsx` stamps `data-deck-layout` on the slide (§3.3); lazy local components with a
  per-layout error boundary (§3.5).

**Vite plugin** (`vite-plugin/`)

- `layouts/local-layouts.ts`: discovery (§3.1), version check, `importContracts` with the import
  check, loader and turn gate (§3.4), parity (§3.7).
- `layouts/load-layout-catalog.ts`: `local` option; clash checks; the replacement check (§3.6).
- Virtual modules: `virtual:deck/local-layouts`, and the generated kit layout list that skips replaced
  names (§3.2).
- `plugin.ts`: call `localLayouts` from the active deck and brand. Watching:
  - `watchBrand` stops full-reloading for `layouts/*/layout.tsx` and `.css` (Vite HMR handles them);
  - a `contract.ts`, `limits.ts` or helper change under brand or deck `layouts/` re-runs
    `importContracts`, rebuilds the catalog, invalidates every slide module and fully reloads;
  - a new deck-layouts watcher, since `watchManifest` ignores those files (1.8).
- `deckCatalog` (wrapping `localLayouts` and `loadLayoutCatalog`) exported for the CLI.

**Kit** (`kit/`)

- `src/layout-parts.ts`, `src/layout-fields.ts`, `package.json` exports, kit layouts migrated to
  them, API snapshot test.
- `src/runtime.ts` takes its layout list from the generated module (§3.2); `catalog.test.ts` keeps
  checking names and order against it.
- `layouts/replace-check.ts` (§3.6), sharing helpers with `brand-layout.contract.ts`.

**Export** (`export/`): read `data-deck-layout` (§3.3).

**Brand** (`brand/`): `isCodeHeld`/`rememberLoaded` used by `importContracts`;
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

| Problem                    | Level   | When                                                                    |
| -------------------------- | ------- | ----------------------------------------------------------------------- |
| `layout-folder-incomplete` | error   | a `layouts/<name>/` without `contract.ts` or `layout.tsx`               |
| `layout-name-mismatch`     | error   | folder name and `contract.name` (or the component's name) differ        |
| `layout-name-clash`        | error   | §3.2 without `replaces`                                                 |
| `layout-replace-breaks`    | error   | §3.6 items 1–4 or 7                                                     |
| `layout-replace-pptx`      | warning | §3.6 item 6                                                             |
| `layout-contract-imports`  | error   | §3.4 import check                                                       |
| `layout-load-failed`       | error   | a contract or component throws while loading; on the slides that use it |
| `layout-held`              | error   | a contract never loaded before an agent turn started                    |
| `layout-version`           | error   | the declared `deckster` range does not match                            |
| `layout-code-skipped`      | error   | a slide uses a code layout `brand add` left out                         |

**PPTX** uses the contract's `pptx` mapping and the engine's layout stamp (§3.3). `layouts new`
writes a mapping with `.kit-title` from `SlideHeader`, so a scaffolded layout exports with a real
title placeholder.

## 6. Phases

### Phase 0: spike (one agent, one day)

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

Exit: a hand-written brand layout and a deck layout work in dev (with HMR for components), build,
lint, `shot`, PDF and PPTX export, `deckster layouts --json` and the agent's catalog tool; an e2e case
covers each; a broken layout breaks only its own slides.

### Phase 2: public parts

- `layout-parts` and `layout-fields`, kit layouts migrated, API snapshot test.
- `layouts new` and `layouts check` (with the limit deck moved into shipped source).
- The authoring reference and docs.
- Exit: no kit layout's closure reaches unexported shared state.

### Phase 3: replace

- `replaces`, the generated kit layout list skipping replaced names, the compatibility check,
  `layout-replace-*` problems, replacements in `deckster layouts`.
- A data layout's `fallback` may name a brand code layout.

### Phase 4: eject and diff

- `eject` with closure, rewrite, CSS scoping and provenance; `--all`.
- The eject-everything CI test and the CSS removal test.
- `diff`.
- `StatFigure`, `Portrait`, `Marks` made public if eject copies of them prove awkward.

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
- **Experimental loader.** `runnerImport` is marked experimental in Vite 8.3.8. It sits behind
  `importContracts` with a documented fallback, and the spike tests the installed CLI.
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
   plus the two shared-state modules that must never be copied. `StatFigure`, `Portrait` and `Marks`
   wait for phase 4; adding to the API later is cheap, taking something back is not.
4. **Contracts load through Vite's module runner (§3.4),** behind `importContracts`. It reloads
   contracts and their helpers on edit and resolves imports the way slides do; it is measured fast
   in the repository. Phase 0 must confirm it from an installed CLI; if it fails there, the
   fallback is Node `import()` with `?mtime=`, and helper edits need a restart.
