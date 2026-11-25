# @deckster/vite-plugin

The Vite side of deckster. It turns one folder under `decks/` into a Vite app: it finds the deck,
validates its config and every slide against the layout catalogs, loads the code layouts of the
deck and its brand, compiles MDX slides, serves the `virtual:deck*` modules the engine renders,
builds the deck's mini apps and locks down the dev server.

The package is private and exports TypeScript source. Its consumers in this repo are `@deckster/cli`
(every command that serves, builds, screenshots, lints or exports a deck) and this package's own
browser tests. Nothing here is published to npm.

## Usage

`deckViteConfig` returns the complete Vite config for one deck. Merge your own settings over it and
hand it to `createServer`, `build` or `preview` from `vite-plus`. This starts the `hello` deck:

```ts
import { deckViteConfig } from '@deckster/vite-plugin';
import { createServer, mergeConfig } from 'vite-plus';

const config = deckViteConfig({ workspaceRoot, deck: 'hello' });
const server = await createServer(
  mergeConfig(config, { server: { port: 5471, strictPort: true } }),
);
await server.listen();
```

`workspaceRoot` is the folder that contains `decks/`: the repo root, or a test's own workspace such
as `e2e/fixtures/`. The page's `<title>` becomes the deck's title, and the
`virtual:deck` module lists the slides in the order `deck.config.ts` gives.

The returned config sets `configFile: false`, so any `vite.config.ts` on disk is ignored. Its root
is the engine's app shell (`@deckster/engine/app`), the deck's `public/` folder is served as static
files, and a build goes to `decks/<deck>/dist` with `base: './'`, so it can be hosted under any
path. The CLI's [`deck-server.ts`](../cli/src/server/deck-server.ts) and
[`dev-server.ts`](../cli/src/server/dev-server.ts) are the fuller examples.

## Options

`deckViteConfig` and `deckPlugin` take the same `DeckPluginOptions`:

| Option              | Default                                                                                                      | What it does                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceRoot`     | required                                                                                                     | Absolute folder that contains `decks/`.                                                                                                                               |
| `deck`              | required                                                                                                     | Deck folder name under `decks/`.                                                                                                                                      |
| `brand`             | the deck config's `brand`                                                                                    | Brand folder under `brands/` to render with instead, without editing the deck (`deckster dev --brand`).                                                               |
| `runtimePlugins`    | `DEFAULT_RUNTIME_PLUGINS`: `@deckster/brand/runtime`, `@deckster/kit/runtime`, `@deckster/presenter/runtime` | Modules whose default export is a `DeckPlugin`, merged into the engine in order.                                                                                      |
| `devRuntimePlugins` | `DEV_RUNTIME_PLUGINS`: `@deckster/comments/runtime`                                                          | Loaded after the others while serving, never in a build. `deckster dev --mcp` and `--agent` append the agent's page link and chat panel here.                         |
| `layoutCatalogs`    | `DEFAULT_LAYOUT_CATALOGS`: `@deckster/kit/catalog`                                                           | Modules whose default export is a `defineLayoutCatalog(...)`, loaded in Node after the engine's own catalog. A later layout of the same name replaces an earlier one. |
| `mdxExtensions`     | `DEFAULT_MDX_EXTENSIONS`: `@deckster/kit/mdx`                                                                | Modules whose default export is a `defineMdxExtension(...)`, whose remark and rehype plugins run on every slide.                                                      |

`@deckster/kit/runtime` is not imported as named: the deck plugin loads `virtual:deck/kit-runtime`
in its place (see [Code layouts](#code-layouts)) and registers the code layouts' plugin right after
it, so the order is brand, kit, code layouts, presenter, then the dev plugins. When the kit's
runtime is not in `runtimePlugins`, the code layouts' plugin goes last of the base plugins.

Bare specifiers resolve from this package, so a runtime plugin, catalog or extension named by
package must be a dependency of `@deckster/vite-plugin`. Absolute paths are used as they are. The
browser tests add a layout this way, from
[`e2e/support/case-servers.ts`](e2e/support/case-servers.ts):

```ts
const config = deckViteConfig({
  workspaceRoot: FIXTURE_WORKSPACE,
  deck,
  runtimePlugins: [...DEFAULT_RUNTIME_PLUGINS, path.join(layouts, 'runtime.ts')],
  layoutCatalogs: [...DEFAULT_LAYOUT_CATALOGS, path.join(layouts, 'catalog.ts')],
});
```

## What the config contains

`deckViteConfig` (`src/vite-config.ts`) lists these Vite plugins, in this order:

| Plugin                     | Source                                      | Job                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deckStateGuardPlugin`     | `src/deck-state-guard.ts`                   | Refuses to load any module from the workspace's `.deck/` folder, compared by real path and in lower case.                                                                                                                                       |
| `deckCacheDirPlugin`       | `src/deck-cache-dir.ts`                     | Gives each deck, brand and mode its own pre-bundle cache in the workspace's `node_modules/.vite/` (`deck-hello-dev`, `deck-hello@nocturne-preview`, a `-test` suffix under a test runner); concurrent dev servers each claim a separate folder. |
| `deckPlugin`               | `src/plugin.ts`                             | The deck itself: virtual modules, slide transforms, code layouts, the reorder endpoint, manifest, brand and layout watching.                                                                                                                    |
| `deckAppsPlugin`           | `src/apps/apps-plugin.ts`                   | Serves each `decks/<deck>/apps/<name>/index.html` at `apps/<name>/` and builds it into `dist/apps/<name>/`. An unknown app is a 404, never the deck's own page.                                                                                 |
| `kitVitePlugins()`         | `@deckster/kit/vite`                        | `~icons/<set>/<name>` imports through `unplugin-icons`, and CSV imports parsed into rows at build time.                                                                                                                                         |
| `deckCssGuardPlugin`       | `src/deck-css-guard.ts`                     | Makes Tailwind's `@plugin` and `@config` fail, so no stylesheet runs Node code.                                                                                                                                                                 |
| `tailwindcss()`, `react()` | `@tailwindcss/vite`, `@vitejs/plugin-react` | Compile the brand stylesheet and the slides; MDX output gets Fast Refresh.                                                                                                                                                                      |
| `commentsVitePlugin`       | `@deckster/comments/vite`                   | While serving: source stamps on the deck's elements and the `/__deck/comments` endpoint.                                                                                                                                                        |

The dev server it configures denies `.deck/` in `server.fs.deny` on top of Vite's defaults and sets
`cors: false`.

## Virtual modules

| Module                       | Default export                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtual:deck`               | The `DeckManifest`: deck id, title, brand, `mouseNavigation`, `durationSeconds` when the config sets `duration`, and one entry per listed slide with its module.                                                                                                                                                                          |
| `virtual:deck/plugins`       | The runtime plugins' default exports, in order.                                                                                                                                                                                                                                                                                           |
| `virtual:deck/local-layouts` | A `DeckPlugin` that registers each code layout of the deck and its brand with the engine's `lazyLayout`, so a `layout.tsx` is imported when a slide first needs it. Layouts with a problem are left out; a deck without code layouts gets a plugin with none.                                                                             |
| `virtual:deck/kit-runtime`   | The kit's runtime plugin (`kitPlugin`), generated with every kit layout but the ones a code layout replaces, so a replaced layout's component and stylesheet are never loaded. It takes the place of `@deckster/kit/runtime` in the runtime plugins and imports the kit's files in the same order, so the stylesheet cascade is the same. |
| `virtual:deck/brand`         | The brand's tokens, plus a `logoUrls` named export.                                                                                                                                                                                                                                                                                       |
| `virtual:deck/brand.css`     | Tailwind v4, the brand's theme, `@font-face` rules and custom properties.                                                                                                                                                                                                                                                                 |

The brand stylesheet's Tailwind sources are the deck's folder, the brand's folder (so their code
layouts' classes are scanned) and the folders of the runtime plugins, with the kit's folder standing
in for `virtual:deck/kit-runtime`, which has none of its own.

These ids, and the shape of what they export, are part of deckster's public surface. Changing one is
a feature that touches the engine, the kit and the CLI, not a refactor.

## Code layouts

A brand or a deck can ship slide layouts as code. A code layout is a folder `layouts/<name>/` in
the brand (`brands/<brand>/layouts/`) or in the deck (`decks/<deck>/layouts/`) with two files:
`contract.ts`, which runs in Node, and `layout.tsx`, the React component, which runs in the
browser. [`skills/create-presentation/references/code-layouts.md`](../../skills/create-presentation/references/code-layouts.md)
is the author's guide; this section is what the plugin does with them.

`localLayouts` (`src/layouts/local-layouts.ts`) finds them. Folders whose name starts with `_` or
`.` (`_shared`, `.eject`) or is not a safe kebab-case name are never layouts; files at the top of
`layouts/` belong to a data layout. The brand's layouts come first, then the deck's. For each folder
it checks, without running anything, that both files exist, that `layout.tsx` names the layout, and
the deckster version range. Then, unless called with `code: 'skip'` (which only lists the folders
and never runs the brand's or the deck's code), it loads each contract with `importContracts`, and
checks that it is named like its folder and passes the build's contract checks.

`importContracts` (`src/layouts/import-contracts.ts`) loads the default export of each
`contract.ts` in three steps:

1. The agent-turn gate. A contract under a folder an agent turn holds is not read, checked or
   evaluated: the result is the value it had when this process last loaded it, or `held`. Nothing the
   turn writes runs before the turn is settled. A turn that begins while a contract is being
   evaluated stops it: the load guard and the evaluator refuse every module of that contract that
   would load or start running after that, and its value is dropped.
2. The static import check, on the source and before anything runs. A contract may import `effect`
   and its entry points, `@deckster/engine/layout`, `@deckster/engine/command`,
   `@deckster/kit/layout-fields` and `@deckster/brand`, and `.ts` files in its own folder or in
   `layouts/_shared/`. Relative imports are followed; `import type` and `export type` are not.
3. The loader: one Vite environment for the batch, closed afterwards, so an edited contract or
   helper is read afresh on the next call. Vite runs only the workspace's files; `effect` and
   `@deckster/*` are imported by Node from this package, so a contract's schema is built with the
   same `effect` as the caller's. The contracts are evaluated at the same time against one deadline
   for the batch (`CONTRACT_TIMEOUT_MS`, 10 s); each one still running then fails with
   `layout-load-failed`, and the environment is closed at once, refusing any module a hung contract
   asks for when it wakes up. Code already running after an `await` inside a module cannot be
   stopped, only kept from loading more.

None of these steps fails the call: `localLayouts` and `importContracts` return problems as values,
so every other layout still lists and only the slides that name a layout with a problem fail, with
that layout's problem and its fix (`src/slides/local-layout-check.ts`).

`deckCatalog` (`src/layouts/deck-catalog.ts`) is what every Node-side caller that needs contracts
uses (the build, `slideMetaReader`, lint, export, `deckster layouts`), so they see the same layouts.
It runs `localLayouts` and merges the result into the catalog. The `local` option of
`loadLayoutCatalog` takes the loaded contracts (`LocalLayouts['catalogs']`); the merge order is the
catalog modules, the brand's code layouts, the brand's data layouts (`layouts.ts`, whose fallback
may be a brand code layout), then the deck's code layouts. A code layout whose name is taken (by a
kit or engine layout, by a data layout of the same brand, or by a brand layout when it is the
deck's) is left out. The exception is a contract that says `replaces: true`: it replaces a kit or
engine layout of that name and keeps its place in the order, provided `checkReplacement` from
`@deckster/kit/catalog` finds nothing that would break slides written for the replaced layout. The
replaced names are listed in `local.replaced`, which is what `virtual:deck/kit-runtime` leaves out;
`local.warnings` holds the replacement's warnings and notes (no PowerPoint mapping, a different
budget or title limit). The result is `{ index, local }`: the catalog, and the layouts found with
their `catalogs`, `replaced`, `files`, `problems` and `warnings`.

`checkReplacedSlides` checks every slide that uses a replaced layout against its replacement, for
each deck on a brand (or one deck), validating the frontmatter as the build does. It catches what
the sample-based `checkReplacement` cannot, such as a narrowed field type the slides use. The build
fails such a slide itself; this is for `deckster brand check` and `deckster layouts check`, which
look at every deck without building any. It skips a deck whose config does not load.

`readSkippedCodeLayouts` reads `.deckster-source.json` (`BRAND_SOURCE_FILE`) in a brand folder, which
`deckster brand add` writes, and returns the names of the code layouts it left out, or `undefined`.
A slide that uses one of those, or one only another brand has as code, fails with
`layout-code-skipped` and a fix.

A brand or a deck can declare the deckster versions its code layouts are written for: a brand in
`brand.json` (`{ "deckster": ">=0.10 <0.12" }`), a deck as `deckster` in `deck.config.ts` (read
without running the config; a config that is more than a literal declares none). A range is
comparators joined by spaces with `>=`, `>`, `<=`, `<` or `=` (`src/layouts/version-range.ts`; no
carets, tildes or `||`). When this deckster is outside the range, none of that brand's or deck's
contracts is loaded and `layout-version` is reported. This deckster's version is the one recorded
in the framework folder when installed, else `packages/cli/package.json`.

Problems carry a `code` (`LayoutProblemCode`, `src/layouts/layout-problem.ts`), and `deckster lint`
reports them under that id:

| Code                          | Meaning                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `layout-folder-incomplete`    | A `layouts/<name>/` folder without `contract.ts` or `layout.tsx`.                                                                      |
| `layout-name-mismatch`        | The folder name differs from the contract's or the component's name.                                                                   |
| `layout-name-clash`           | The name is already a kit, engine or brand layout, and the contract does not say `replaces: true`.                                     |
| `layout-replace-breaks`       | A replacement would break slides written for the replaced layout (a field, slot or title it drops or narrows).                         |
| `layout-replace-pptx`         | Warning: the replaced layout has a PowerPoint mapping and the replacement has none.                                                    |
| `layout-replace-budget`       | Note: a budget or title limit differs from the replaced layout's.                                                                      |
| `layout-contract-imports`     | `contract.ts` imports something a contract may not.                                                                                    |
| `layout-contract-invalid`     | The contract loaded but fails the build's contract checks, or says `replaces: true` on a name no kit or engine layout has.             |
| `layout-load-failed`          | `contract.ts` is missing, threw while loading or has no default export.                                                                |
| `layout-held`                 | An agent turn is in flight and the contract was never loaded before it.                                                                |
| `layout-version`              | The brand or deck asks for another deckster version.                                                                                   |
| `layout-code-skipped`         | A slide uses a code layout `brand add` left out, or one that only another brand has.                                                   |
| `layout-fallback-unavailable` | A data layout of the brand falls back to a brand code layout that did not load, so it is left out too (a warning with `code: 'skip'`). |

The warning and the note are never in `problems`: they are in `local.warnings` and fail no slide.

The runtime side is `virtual:deck/local-layouts`, which registers each layout that is in the catalog
with `lazyLayout`, and `virtual:deck/kit-runtime`. While serving, `optimizeDeps.entries` lists the
`layout.tsx` files of the deck and the brand, because Vite's dependency scan does not follow virtual
modules and would find what they import late, which reloads the page. Problems and warnings are
printed as Vite warnings with the file's path.

## How slides are compiled

Only the files `deck.config.ts` lists are slides. For each one the `transform` hook validates the
frontmatter against the layout's contract (layout name, fields, title, surface against the brand),
checks the slots the slide fills, and appends a `slideMeta` export with the validated frontmatter,
title, notes and filled slots. MDX slides are compiled with `@mdx-js/mdx` and `remark-gfm` plus the
extensions' plugins. A TSX slide keeps its source; the plugin reads its `frontmatter` export and
slot exports and leaves compiling to the React plugin. Other MDX files under `slides/` compile as
plain MDX partials, and other TSX files are left alone.

Warnings an MDX extension reports, such as a missing image, are printed with the slide's path and
kept per file. `deckster lint` reads them through the plugin's `api`:

```ts
const api = server.config.plugins.find((plugin) => plugin.name === 'deck')?.api as
  | DeckPluginApi
  | undefined;
api?.slideWarnings(file); // readonly MdxWarning[]
```

A deck that cannot be used fails with a `DeckBuildError` whose message names the file relative to
the workspace and lists each problem with its fix. Vite's overlay shows it and links to the file.

While serving, the plugin reloads the page when `deck.config.ts` changes, when a slide file (`.mdx`
or `.tsx`) is added to or removed from `slides/`, and when the brand changes. Files under a
`layouts/` folder of the brand or the deck are watched too. Editing a `layout.tsx` or a `.css` file
inside a layout folder (or `_shared/`) reloads nothing here: Vite's own hot update applies it. Any
other change there (a `contract.ts`, a `.ts` helper, `brand.json`, a file or folder added or
removed) loads the contracts afresh and reloads the page, because every slide is validated against
them. When an agent turn ends, it reloads the page only if the page loaded the deck, its brand or
its contracts while the turn held them; a turn that only edits slides leaves the page to hot reload
them.

## Dev server endpoints

| Path                   | Behaviour                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /__deck/reorder` | Body `{ "slides": [...] }` rewrites the deck's slide list (the presenter sidebar's drag to reorder). Needs the dev session cookie; 204 on success, 400, 405 or 415 otherwise, body capped at 64 KB. |
| `/__open-in-editor`    | Always 404, mounted before Vite's own, so page code cannot open files in your editor. The error overlay's click-to-open link does not work as a result.                                             |

Neither exists in a build or a preview server.

## Exports

Everything comes from the package root (`exports: { ".": "./src/index.ts" }`).

| Export                                                                                                        | What it is                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `deckViteConfig`                                                                                              | The full Vite config for one deck.                                                                                   |
| `deckPlugin`, `DeckPluginOptions`, `DeckPluginApi`                                                            | The deck plugin alone, its options and its `api` (`activeDeck()`, `slideWarnings(file)`).                            |
| `DEFAULT_RUNTIME_PLUGINS`, `DEV_RUNTIME_PLUGINS`                                                              | The default runtime plugin lists.                                                                                    |
| `VIRTUAL_DECK_ID`, `VIRTUAL_PLUGINS_ID`, `VIRTUAL_BRAND_ID`, `VIRTUAL_BRAND_CSS_ID`                           | The virtual module ids.                                                                                              |
| `VIRTUAL_LOCAL_LAYOUTS_ID`, `VIRTUAL_KIT_RUNTIME_ID`                                                          | The ids of `virtual:deck/local-layouts` and `virtual:deck/kit-runtime`.                                              |
| `discoverDecks`, `findDeck`, `loadDeck`, `LoadedDeck`, `LoadedSlide`                                          | Find decks under `decks/` and load one (config and slide files) as Effects.                                          |
| `DECKS_DIR`, `SLIDES_DIR`, `DECK_CONFIG_FILE`, `DeckLocation`                                                 | Folder and file names, and a deck's paths.                                                                           |
| `appendSlideId`, `reorderSlideIds`, `slideListProblem`, `reorderDeck`                                         | Slide-list edits to `deck.config.ts`, used by the reorder endpoint, `deckster new slide` and the agent's deck tools. |
| `loadLayoutCatalog`, `DEFAULT_LAYOUT_CATALOGS`, `CatalogLayout`, `LayoutCatalogIndex`, `LayoutCatalogOptions` | Load layout contracts; `LayoutCatalogOptions` has the brand, its `layouts.ts` and `local`, the code layouts to join. |
| `deckCatalog`, `DeckCatalog`, `DeckCatalogOptions`                                                            | Every layout a deck or brand can use, with its code layouts, `code: 'load'` or `'skip'`.                             |
| `localLayouts`, `LocalLayouts`, `LocalLayout`, `LocalCatalog`, `LocalLayoutsOptions`                          | Find a brand's and a deck's code layouts and load their contracts.                                                   |
| `importContracts`, `ContractLoad`, `ContractProblem`, `ImportContractsOptions`                                | Load `contract.ts` files: import check, agent-turn gate, loader.                                                     |
| `checkReplacedSlides`, `ReplacedSlidesOptions`                                                                | Check the slides of a brand's decks against the kit layouts a code layout replaces.                                  |
| `readSkippedCodeLayouts`, `SkippedCodeLayouts`, `BRAND_SOURCE_FILE`                                           | The code layouts `brand add` left out of a brand, from `.deckster-source.json`.                                      |
| `LayoutProblem`, `LayoutProblemCode`                                                                          | A code layout's problem, and its ids.                                                                                |
| `LAYOUTS_DIR`, `CONTRACT_FILE`, `COMPONENT_FILE`, `BRAND_MANIFEST_FILE`                                       | Folder and file names of a code layout and a brand's version file.                                                   |
| `BRAND_CODE_SOURCE_PREFIX`, `DECK_SOURCE_PREFIX`                                                              | The start of a code layout's `source`: `brand-code:<brand>`, `deck:<deck>`.                                          |
| `slideSchemaFor`, `slideHintsFor`                                                                             | The schema a slide naming a layout is decoded with, and the fix for each of its fields.                              |
| `validateFrontmatter`, `ValidFrontmatter`                                                                     | Validate MDX or TSX frontmatter against the fields every slide has and its layout's.                                 |
| `discoverApps`, `APPS_DIR`, `APP_ENTRY_FILE`, `AppLocation`                                                   | A deck's mini apps.                                                                                                  |
| `DeckBuildError`, `Problem`, `MdxWarning`                                                                     | The error and warning types.                                                                                         |
| `refuseStylesheetCode`                                                                                        | Closes Tailwind's JavaScript loader for the whole process. The CLI's `main` calls it before any command.             |

## Rules for changing this package

- Node-side work is Effect v4 (`Effect.fn` with an `Effect.fn.Return` type). Vite's hooks stay
  promise-based and run effects through `makeRunEffect` (`src/run-effect.ts`), which rejects with
  the error itself so the overlay can link to the file. Build errors through the factories in
  `src/errors.ts`; never `throw` inside a generator.
- Wrap every async connect middleware in `guarded` (`src/guarded-middleware.ts`). Node 24 exits on
  an unhandled rejection, which would end the dev server.
- Never load a module from `.deck/`, serve it or watch it. That folder holds the agent's MCP token,
  journal, screenshots and working copies.
- `loadDeck` never imports `deck.config.ts` while an agent turn runs on the deck. It reads the
  config as data through `gatedLoad` from `@deckster/brand/node`, and finishes a turn a crash left
  (`recoverTurnGuard`) before importing. [docs/agent.md](../../docs/agent.md) explains why.
- A runtime plugin, catalog or extension added to the defaults must also be added to this
  package's `dependencies`, or it will not resolve.
- A brand's or a deck's `contract.ts` is loaded through `importContracts` only, which applies the
  agent-turn gate and the import check first, and never in a call made with `code: 'skip'`. The
  loader does not read or run a folder an agent turn holds, as `loadDeck` does not.

## Tests

Unit tests sit beside the code (`src/**/*.test.ts`). From `packages/vite-plugin`:

```sh
pnpm exec vp test run                          # all unit tests
pnpm exec vp test run src/slides/frontmatter.test.ts
```

The browser suite lives in `e2e/` and uses the `e2e` runner with Chromium at 1920x1080. Install the
browser once with `pnpm --dir packages/engine exec e2e-web install chromium`, then run one file:

```sh
pnpm e2e components.e2e.ts
```

Each suite starts its own Vite servers on fixed ports with `strictPort` (5321 and up, see
`e2e/support/`), so a taken port fails the suite instead of moving. Tests run with one worker, and
any console error or warning on the page fails the test (`e2e/support/page-problems.ts`). The decks
come from two places: `e2e/fixtures/decks/` (`cases`, `bad-layout`, `brand-layouts`, `comments`,
`apps-cases`, `code-layouts`) with a test layout in `e2e/fixtures/layouts/` and brands in
`e2e/fixtures/brands/` (`fx-code` has code layouts), and the demo decks in the repo's `decks/`.
`code-layouts.e2e.ts` runs the fixture deck on a dev server, a preview server and an edit server
(ports 5461 to 5463). The
Electron test (`shell.e2e.ts`) skips when the Electron binary is not installed.
