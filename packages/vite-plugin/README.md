# @deckster/vite-plugin

The Vite side of deckster. It turns one folder under `decks/` into a Vite app: it finds the deck,
validates its config and every slide against the layout catalogs, compiles MDX slides, serves the
`virtual:deck*` modules the engine renders, builds the deck's mini apps and locks down the dev
server.

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
| `brand`             | the deck config's `brand`                                                                                    | Brand folder under `brands/` to render with instead, without editing the deck (`deck dev --brand`).                                                                   |
| `runtimePlugins`    | `DEFAULT_RUNTIME_PLUGINS`: `@deckster/brand/runtime`, `@deckster/kit/runtime`, `@deckster/presenter/runtime` | Modules whose default export is a `DeckPlugin`, merged into the engine in order.                                                                                      |
| `devRuntimePlugins` | `DEV_RUNTIME_PLUGINS`: `@deckster/comments/runtime`                                                          | Loaded after the others while serving, never in a build. `deck dev --mcp` and `--agent` append the agent's page link and chat panel here.                             |
| `layoutCatalogs`    | `DEFAULT_LAYOUT_CATALOGS`: `@deckster/kit/catalog`                                                           | Modules whose default export is a `defineLayoutCatalog(...)`, loaded in Node after the engine's own catalog. A later layout of the same name replaces an earlier one. |
| `mdxExtensions`     | `DEFAULT_MDX_EXTENSIONS`: `@deckster/kit/mdx`                                                                | Modules whose default export is a `defineMdxExtension(...)`, whose remark and rehype plugins run on every slide.                                                      |

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
| `deckPlugin`               | `src/plugin.ts`                             | The deck itself: virtual modules, slide transforms, the reorder endpoint, manifest and brand watching.                                                                                                                                          |
| `deckAppsPlugin`           | `src/apps/apps-plugin.ts`                   | Serves each `decks/<deck>/apps/<name>/index.html` at `apps/<name>/` and builds it into `dist/apps/<name>/`. An unknown app is a 404, never the deck's own page.                                                                                 |
| `kitVitePlugins()`         | `@deckster/kit/vite`                        | `~icons/<set>/<name>` imports through `unplugin-icons`, and CSV imports parsed into rows at build time.                                                                                                                                         |
| `deckCssGuardPlugin`       | `src/deck-css-guard.ts`                     | Makes Tailwind's `@plugin` and `@config` fail, so no stylesheet runs Node code.                                                                                                                                                                 |
| `tailwindcss()`, `react()` | `@tailwindcss/vite`, `@vitejs/plugin-react` | Compile the brand stylesheet and the slides; MDX output gets Fast Refresh.                                                                                                                                                                      |
| `commentsVitePlugin`       | `@deckster/comments/vite`                   | While serving: source stamps on the deck's elements and the `/__deck/comments` endpoint.                                                                                                                                                        |

The dev server it configures denies `.deck/` in `server.fs.deny` on top of Vite's defaults and sets
`cors: false`.

## Virtual modules

| Module                   | Default export                                                                                                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `virtual:deck`           | The `DeckManifest`: deck id, title, brand, `mouseNavigation`, `durationSeconds` when the config sets `duration`, and one entry per listed slide with its module. |
| `virtual:deck/plugins`   | The runtime plugins' default exports, in order.                                                                                                                  |
| `virtual:deck/brand`     | The brand's tokens, plus a `logoUrls` named export.                                                                                                              |
| `virtual:deck/brand.css` | Tailwind v4, the brand's theme, `@font-face` rules and custom properties.                                                                                        |

These ids, and the shape of what they export, are part of deckster's public surface. Changing one is
a feature that touches the engine, the kit and the CLI, not a refactor.

## How slides are compiled

Only the files `deck.config.ts` lists are slides. For each one the `transform` hook validates the
frontmatter against the layout's contract (layout name, fields, title, surface against the brand),
checks the slots the slide fills, and appends a `slideMeta` export with the validated frontmatter,
title, notes and filled slots. MDX slides are compiled with `@mdx-js/mdx` and `remark-gfm` plus the
extensions' plugins. A TSX slide keeps its source; the plugin reads its `frontmatter` export and
slot exports and leaves compiling to the React plugin. Other MDX files under `slides/` compile as
plain MDX partials, and other TSX files are left alone.

Warnings an MDX extension reports, such as a missing image, are printed with the slide's path and
kept per file. `deck lint` reads them through the plugin's `api`:

```ts
const api = server.config.plugins.find((plugin) => plugin.name === 'deck')?.api as
  | DeckPluginApi
  | undefined;
api?.slideWarnings(file); // readonly MdxWarning[]
```

A deck that cannot be used fails with a `DeckBuildError` whose message names the file relative to
the workspace and lists each problem with its fix. Vite's overlay shows it and links to the file.

While serving, the plugin reloads the page when `deck.config.ts` changes, when a slide file (`.mdx`
or `.tsx`) is added to or removed from `slides/`, and when the brand changes. When an agent turn
ends, it reloads the page only if the page loaded the deck or its brand while the turn held them;
a turn that only edits slides leaves the page to hot reload them.

## Dev server endpoints

| Path                   | Behaviour                                                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /__deck/reorder` | Body `{ "slides": [...] }` rewrites the deck's slide list (the presenter sidebar's drag to reorder). Needs the dev session cookie; 204 on success, 400, 405 or 415 otherwise, body capped at 64 KB. |
| `/__open-in-editor`    | Always 404, mounted before Vite's own, so page code cannot open files in your editor. The error overlay's click-to-open link does not work as a result.                                             |

Neither exists in a build or a preview server.

## Exports

Everything comes from the package root (`exports: { ".": "./src/index.ts" }`).

| Export                                                                                | What it is                                                                                                       |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `deckViteConfig`                                                                      | The full Vite config for one deck.                                                                               |
| `deckPlugin`, `DeckPluginOptions`, `DeckPluginApi`                                    | The deck plugin alone, its options and its `api` (`activeDeck()`, `slideWarnings(file)`).                        |
| `DEFAULT_RUNTIME_PLUGINS`, `DEV_RUNTIME_PLUGINS`                                      | The default runtime plugin lists.                                                                                |
| `VIRTUAL_DECK_ID`, `VIRTUAL_PLUGINS_ID`, `VIRTUAL_BRAND_ID`, `VIRTUAL_BRAND_CSS_ID`   | The virtual module ids.                                                                                          |
| `discoverDecks`, `findDeck`, `loadDeck`, `LoadedDeck`, `LoadedSlide`                  | Find decks under `decks/` and load one (config and slide files) as Effects.                                      |
| `DECKS_DIR`, `SLIDES_DIR`, `DECK_CONFIG_FILE`, `DeckLocation`                         | Folder and file names, and a deck's paths.                                                                       |
| `appendSlideId`, `reorderSlideIds`, `slideListProblem`, `reorderDeck`                 | Slide-list edits to `deck.config.ts`, used by the reorder endpoint, `deck new slide` and the agent's deck tools. |
| `loadLayoutCatalog`, `DEFAULT_LAYOUT_CATALOGS`, `CatalogLayout`, `LayoutCatalogIndex` | Load layout contracts, as `deck layouts` does.                                                                   |
| `slideSchemaFor`, `slideHintsFor`                                                     | The schema a slide naming a layout is decoded with, and the fix for each of its fields.                          |
| `validateFrontmatter`, `ValidFrontmatter`                                             | Validate MDX or TSX frontmatter against the fields every slide has and its layout's.                             |
| `discoverApps`, `APPS_DIR`, `APP_ENTRY_FILE`, `AppLocation`                           | A deck's mini apps.                                                                                              |
| `DeckBuildError`, `Problem`, `MdxWarning`                                             | The error and warning types.                                                                                     |
| `refuseStylesheetCode`                                                                | Closes Tailwind's JavaScript loader for the whole process. The CLI's `main` calls it before any command.         |

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
come from two places: `e2e/fixtures/decks/` (`cases`, `bad-layout`, `comments`, `apps-cases`) with a
test layout in `e2e/fixtures/layouts/`, and the demo decks in the repo's `decks/`. The
Electron test (`shell.e2e.ts`) skips when the Electron binary is not installed.
