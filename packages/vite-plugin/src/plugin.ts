import type { Plugin, Rollup, UserConfig, ViteDevServer } from 'vite';

import { BRANDS_DIR, onCodeReleased, type LoadedBrand } from '@deckster/brand/node';
import { devSessionOf, issueDevSession } from '@deckster/comments/dev-session';
import kitCatalog from '@deckster/kit/catalog';
import { Effect } from 'effect';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

import type { MdxWarning } from '#slides/compile-mdx.ts';

import {
  brandLayoutsFiles,
  brandModuleSource,
  createActiveBrand,
  watchBrand,
} from '#brand/active-brand.ts';
import {
  RESOLVED_BRAND_ID,
  resolvedBrandCssId,
  VIRTUAL_BRAND_CSS_ID,
  VIRTUAL_BRAND_ID,
} from '#brand/brand-modules.ts';
import { deckBrandName } from '#brand/deck-brand-name.ts';
import { DECKS_DIR, displayPath, SLIDES_DIR, type DeckLocation } from '#decks/deck-paths.ts';
import { findDeck } from '#decks/discover-decks.ts';
import { loadDeck, type LoadedDeck } from '#decks/load-deck.ts';
import { REORDER_ENDPOINT, reorderMiddleware } from '#decks/reorder-middleware.ts';
import { trackSlideFileChanges } from '#decks/slide-file-changes.ts';
import { unresolvedRuntimePlugin } from '#errors.ts';
import { trackHeldLoads, type HeldLoads } from '#held-loads.ts';
import { readSkippedCodeLayouts, type SkippedCodeLayouts } from '#layouts/brand-source.ts';
import { deckCatalog, type DeckCatalog } from '#layouts/deck-catalog.ts';
import { DEFAULT_LAYOUT_CATALOGS, type LayoutCatalogIndex } from '#layouts/load-layout-catalog.ts';
import { COMPONENT_FILE, LAYOUTS_DIR, type LocalLayouts } from '#layouts/local-layouts.ts';
import { watchDeckLayouts } from '#layouts/watch-layouts.ts';
import { OPEN_IN_EDITOR_ENDPOINT, refuseOpenInEditor } from '#open-in-editor-guard.ts';
import { makeRunEffect } from '#run-effect.ts';
import { slideBrandOf } from '#slides/check-surface.ts';
import {
  DEFAULT_MDX_EXTENSIONS,
  loadMdxExtensions,
  mdxContextOf,
} from '#slides/load-mdx-extensions.ts';
import {
  transformMdxPartial,
  transformMdxSlide,
  transformTsxSlideMapped,
} from '#slides/transform-slide.ts';
import {
  deckModuleCode,
  isVirtualPlugin,
  kitRuntimeModuleCode,
  localLayoutsModuleCode,
  pluginsModuleCode,
  RESOLVED_DECK_ID,
  RESOLVED_KIT_RUNTIME_ID,
  RESOLVED_LOCAL_LAYOUTS_ID,
  RESOLVED_PLUGINS_ID,
  VIRTUAL_DECK_ID,
  VIRTUAL_KIT_RUNTIME_ID,
  VIRTUAL_LOCAL_LAYOUTS_ID,
  VIRTUAL_PLUGINS_ID,
} from '#virtual-modules.ts';

/**
 * Runtime plugins every deck gets: the brand (its stylesheet and `useBrand()`), the kit's layouts
 * and components, then the presenter tools (sidebar, overview, presenter window, help).
 */
export const DEFAULT_RUNTIME_PLUGINS: readonly string[] = [
  '@deckster/brand/runtime',
  '@deckster/kit/runtime',
  '@deckster/presenter/runtime',
];

/**
 * The kit's runtime plugin. The deck plugin loads `virtual:deck/kit-runtime` in its place, which
 * leaves out the kit layouts a code layout replaces, and registers the code layouts right after it,
 * before the presenter's and the dev-only plugins, which define none.
 */
const KIT_RUNTIME_PLUGIN = '@deckster/kit/runtime';

/**
 * Runtime plugins only the dev server loads, after the others: the comment overlay, which needs the
 * dev server's `/__deck/comments` endpoint and is never part of a build.
 */
export const DEV_RUNTIME_PLUGINS: readonly string[] = ['@deckster/comments/runtime'];

/**
 * Runtime plugin specifiers resolve from this package, which depends on the framework's own.
 */
const PLUGIN_IMPORTER = fileURLToPath(import.meta.url);

/**
 * The query string or hash Vite appends to a module id, such as `?import`.
 */
const QUERY_PATTERN = /[?#].*$/;

/**
 * A slide file relative to the workspace: `decks/<deck>/slides/<id>.mdx` or `.tsx`, capturing the
 * id and the extension.
 */
const SLIDE_PATH_PATTERN = new RegExp(`^${DECKS_DIR}/[^/]+/${SLIDES_DIR}/([^/]+)\\.(mdx|tsx)$`);

/**
 * A file under a deck's `slides/` folder, as the transform hook sees it.
 */
type SlideFileSource = {
  /**
   * The file name without its extension.
   */
  id: string;

  /**
   * `mdx` or `tsx`.
   */
  extension: string;

  /**
   * The source code.
   */
  code: string;

  /**
   * The absolute path, without a query string.
   */
  file: string;

  /**
   * The path relative to the workspace, for messages.
   */
  displayPath: string;
};

/**
 * The `<title>` element of the engine's `index.html`, replaced by the deck's title.
 */
const TITLE_PATTERN = /<title>[\s\S]*?<\/title>/;

/**
 * The layouts a deck can use and what its slides are checked against besides them.
 */
type DeckLayouts = DeckCatalog & {
  /**
   * The code layouts `brand add` left out of the deck's brand, when it recorded any.
   */
  skipped: SkippedCodeLayouts | undefined;
};

/**
 * The parts of Vite's plugin context the load hooks use.
 */
type LoadContext = Pick<Rollup.PluginContext, 'addWatchFile' | 'warn' | 'resolve'>;

/**
 * Options for {@link deckPlugin}.
 */
export type DeckPluginOptions = {
  /**
   * The absolute workspace root, the folder that contains `decks/`.
   */
  workspaceRoot: string;

  /**
   * The deck folder name under `decks/` to serve or build.
   */
  deck: string;

  /**
   * Modules whose default export is a `DeckPlugin`, merged into the engine in order. Bare
   * specifiers resolve from this package. Defaults to {@link DEFAULT_RUNTIME_PLUGINS}.
   */
  runtimePlugins?: readonly string[];

  /**
   * Runtime plugins loaded after {@link DeckPluginOptions.runtimePlugins} while serving, never in a
   * build. Defaults to {@link DEV_RUNTIME_PLUGINS}.
   */
  devRuntimePlugins?: readonly string[];

  /**
   * Modules whose default export is a `LayoutCatalog` (`defineLayoutCatalog` from
   * `@deckster/engine/layout`), loaded in Node after the engine's own to validate slides. Every
   * layout a runtime plugin registers needs its contract in one of them. Bare specifiers resolve
   * from this package. Defaults to {@link DEFAULT_LAYOUT_CATALOGS}.
   */
  layoutCatalogs?: readonly string[];

  /**
   * Modules whose default export is an `MdxExtension` (`defineMdxExtension` from
   * `@deckster/engine/mdx`), loaded in Node to add remark and rehype plugins to every slide's MDX
   * compile. The kit's extension highlights code blocks and turns image, video and icon tags into
   * imports. Bare specifiers resolve from this package. Defaults to
   * {@link DEFAULT_MDX_EXTENSIONS}.
   */
  mdxExtensions?: readonly string[];

  /**
   * A brand folder under `brands/` that overrides the deck config's `brand`, for previewing a deck
   * in another brand without editing it.
   */
  brand?: string;
};

/**
 * What the deck plugin shares with other Vite plugins through its `api`.
 */
export type DeckPluginApi = {
  /**
   * The served deck's config and slides, reloaded after the manifest or slide list changes.
   */
  activeDeck: () => Promise<LoadedDeck>;

  /**
   * The warnings the MDX extensions reported the last time a file compiled, such as a missing image
   * or an unknown code language; `deckster lint` turns them into findings.
   *
   * @param file - The absolute path of the slide file.
   */
  slideWarnings: (file: string) => readonly MdxWarning[];
};

/**
 * The deck Vite plugin. It serves `virtual:deck` (the deck's slides in manifest order) and
 * `virtual:deck/plugins`, compiles MDX slides, validates every slide's frontmatter and slots
 * against the layout catalogs, and adds each slide's `slideMeta` export. Only files the deck config
 * lists are slides; other MDX under `slides/` compiles as plain MDX and other TSX is left alone.
 * Invalid decks fail with errors that name the file and the fix.
 *
 * @param options - The workspace, the deck and the runtime plugins.
 */
export function deckPlugin(
  options: DeckPluginOptions,
): Plugin<DeckPluginApi> & { api: DeckPluginApi } {
  const { workspaceRoot } = options;
  const basePlugins = options.runtimePlugins ?? DEFAULT_RUNTIME_PLUGINS;
  const devPlugins = options.devRuntimePlugins ?? DEV_RUNTIME_PLUGINS;
  const run = makeRunEffect();
  let development = true;
  let serving = false;
  let location: Promise<DeckLocation> | undefined;
  let loadedDeck: Promise<LoadedDeck> | undefined;
  let catalog: { brand: LoadedBrand; layouts: Promise<DeckLayouts> } | undefined;
  const deckLoads = trackHeldLoads();
  const contractLoads = trackHeldLoads();

  /**
   * Finds the deck once and remembers the result, so every hook sees the same location.
   */
  const findActiveDeck = (): Promise<DeckLocation> => {
    location ??= run(findDeck(workspaceRoot, options.deck));
    return location;
  };

  /**
   * Loads the deck config and slide list, reused until the manifest or the slide files change; a
   * failed load is retried on the next call. A load while an agent turn holds the config is noted
   * at its start and its end, so the end of the hold reloads the page.
   */
  const activeDeck = (): Promise<LoadedDeck> => {
    loadedDeck ??= findActiveDeck()
      .then((deck) => {
        /**
         * Notes the config, when an agent turn holds it now.
         */
        const noteHeld = () => deckLoads.note([deck.configFile]);
        noteHeld();
        return run(loadDeck(workspaceRoot, deck)).finally(noteHeld);
      })
      .catch((error: unknown) => {
        loadedDeck = undefined;
        throw error;
      });
    return loadedDeck;
  };

  const brand = createActiveBrand({
    workspaceRoot,
    override: options.brand,
    deck: findActiveDeck,
    run,
  });

  /**
   * Loads the layout catalogs, the active brand's layouts and the code layouts of the brand and the
   * deck. They are reused until the brand is read again (a switch, or an edit to its files,
   * including `layouts.ts` and its contracts) or the deck's `layouts/` change, and loaded afresh
   * then; a failed load is retried on the next call. The `layouts/` folders are noted at the start
   * and the end, for when an agent turn holds them: the contracts are then the ones loaded before
   * the turn, and load for real once it ends.
   */
  const deckLayouts = async (): Promise<DeckLayouts> => {
    const loaded = await brand.load();
    if (catalog?.brand !== loaded) {
      const deck = await findActiveDeck();
      /**
       * Notes the layout folders, when an agent turn holds them now.
       */
      const noteHeld = () =>
        contractLoads.note([
          path.join(deck.dir, LAYOUTS_DIR),
          path.join(loaded.location.dir, LAYOUTS_DIR),
        ]);
      noteHeld();
      const layouts = run(
        Effect.gen(function* () {
          const found = yield* deckCatalog({
            root: workspaceRoot,
            brand: loaded,
            deck,
            code: 'load',
            specifiers: options.layoutCatalogs ?? DEFAULT_LAYOUT_CATALOGS,
          });
          const skipped = yield* readSkippedCodeLayouts(loaded.location.dir);
          return { ...found, skipped };
        }),
      ).finally(noteHeld);
      const entry = { brand: loaded, layouts };
      catalog = entry;
      layouts.catch(() => {
        if (catalog === entry) {
          catalog = undefined;
        }
      });
    }

    return catalog.layouts;
  };

  /**
   * Every layout the deck can use.
   */
  const layoutCatalog = async (): Promise<LayoutCatalogIndex> => (await deckLayouts()).index;

  /**
   * The resolved id of `virtual:deck/brand.css`, a path in the deck's folder.
   */
  const brandCssId = async (): Promise<string> => resolvedBrandCssId((await findActiveDeck()).dir);

  /**
   * The runtime plugins of this server or build: the dev plugins only while serving.
   */
  const runtimePlugins = (): readonly string[] => {
    const base = withLocalLayouts(basePlugins);
    return serving ? [...base, ...devPlugins] : base;
  };

  const warnings = new Map<string, MdxWarning[]>();

  return {
    name: 'deck',
    enforce: 'pre',
    api: { activeDeck, slideWarnings: (file) => warnings.get(file) ?? [] },

    async config(_, { command }): Promise<UserConfig | undefined> {
      if (command !== 'serve') {
        return undefined;
      }

      // The dependency scan does not follow virtual modules, so it would miss what the code
      // layouts import, and a dependency found late reloads the page.
      const entries = await layoutScanEntries(workspaceRoot, activeDeck, options.brand);
      return { optimizeDeps: { entries } };
    },

    configResolved(config) {
      development = !config.isProduction;
      serving = config.command === 'serve';
    },

    async buildStart() {
      await activeDeck();
      await layoutCatalog();
      await brand.load();
    },

    async resolveId(id) {
      if (id === VIRTUAL_DECK_ID) {
        return RESOLVED_DECK_ID;
      }

      if (id === VIRTUAL_BRAND_ID) {
        return RESOLVED_BRAND_ID;
      }

      if (id === VIRTUAL_BRAND_CSS_ID) {
        return brandCssId();
      }

      if (id === VIRTUAL_LOCAL_LAYOUTS_ID) {
        return RESOLVED_LOCAL_LAYOUTS_ID;
      }

      if (id === VIRTUAL_KIT_RUNTIME_ID) {
        return RESOLVED_KIT_RUNTIME_ID;
      }

      return id === VIRTUAL_PLUGINS_ID ? RESOLVED_PLUGINS_ID : undefined;
    },

    async load(id) {
      if (id === RESOLVED_DECK_ID) {
        const { tokens } = await brand.load();
        return deckModule(this, await activeDeck(), tokens.name);
      }

      if (id === RESOLVED_BRAND_ID || id === (await brandCssId())) {
        const resolved = await resolveRuntimePlugins(this, workspaceRoot, runtimePlugins());
        const pluginFiles = await withKitRuntimeFile(this, workspaceRoot, resolved);
        const deck = await findActiveDeck();
        return brandModuleSource(this, { id, brand: await brand.load(), deck, pluginFiles });
      }

      if (id === RESOLVED_LOCAL_LAYOUTS_ID) {
        return localLayoutsModule(this, workspaceRoot, (await deckLayouts()).local);
      }

      if (id === RESOLVED_KIT_RUNTIME_ID) {
        return kitRuntimeModule(this, workspaceRoot, (await deckLayouts()).local.replaced);
      }

      return id === RESOLVED_PLUGINS_ID
        ? loadPluginsModule(this, workspaceRoot, runtimePlugins())
        : undefined;
    },

    async transform(code, id) {
      const file = slideSource(workspaceRoot, id, code);
      if (file === undefined) {
        return undefined;
      }

      const deck = await activeDeck();
      const { tokens } = await brand.load();
      const mdx = await run(
        loadMdxExtensions(
          options.mdxExtensions ?? DEFAULT_MDX_EXTENSIONS,
          mdxContextOf(workspaceRoot, deck.location.dir, tokens),
        ),
      );
      const reported: MdxWarning[] = [];
      warnings.set(file.file, reported);
      /**
       * Prints a plugin's warning with the slide it belongs to, and keeps it for `deckster lint`.
       *
       * @param message - The warning as the build prints it.
       * @param warning - Its parts: reason, line, rule id and fix.
       */
      const onWarning = (message: string, warning: MdxWarning): void => {
        reported.push(warning);
        this.warn(`${file.displayPath}: ${message}`);
      };
      const isListed = deck.slides.some((slide) => slide.file === file.file);
      if (!isListed) {
        const partial =
          file.extension === 'mdx'
            ? transformMdxPartial({ ...file, mdx, onWarning }, development)
            : undefined;
        return partial === undefined ? undefined : { code: await run(partial), map: null };
      }

      for (const layoutsFile of brandLayoutsFiles(workspaceRoot)) {
        this.addWatchFile(layoutsFile);
      }

      const layouts = await deckLayouts();
      for (const layoutFile of layouts.local.files) {
        this.addWatchFile(layoutFile);
      }

      const slide = {
        ...file,
        mdx,
        onWarning,
        layouts: layouts.index,
        local: { found: layouts.local, skipped: layouts.skipped },
        brand: slideBrandOf(tokens),
        fallback: { workspaceRoot, brand: tokens.name },
      };
      if (file.extension === 'mdx') {
        return { code: await run(transformMdxSlide(slide, development)), map: null };
      }

      return run(transformTsxSlideMapped(slide));
    },

    async configureServer(server) {
      const session = devSessionOf(server);
      server.middlewares.use(issueDevSession(session));
      server.middlewares.use(OPEN_IN_EDITOR_ENDPOINT, refuseOpenInEditor);
      const deck = await findActiveDeck();
      watchManifest(server, deck, deckLoads, () => {
        loadedDeck = undefined;
      });
      server.middlewares.use(
        REORDER_ENDPOINT,
        reorderMiddleware({
          workspaceRoot,
          deck: findActiveDeck,
          run,
          guard: (request) => session.refusal(request),
        }),
      );
      watchBrand(server, { workspaceRoot, deck, brand });
      watchDeckLayouts(server, {
        deck,
        heldLoads: contractLoads,
        onChange: () => {
          catalog = undefined;
        },
      });
    },

    async transformIndexHtml(html) {
      const deck = await activeDeck();
      return html.replace(TITLE_PATTERN, `<title>${escapeHtml(deck.config.title)}</title>`);
    },
  };
}

/**
 * Generates `virtual:deck` for a loaded deck, watching its config and reporting its warnings.
 *
 * @param context - The plugin context.
 * @param deck - The loaded deck.
 * @param brand - The brand the deck renders with.
 */
function deckModule(context: LoadContext, deck: LoadedDeck, brand: string): string {
  context.addWatchFile(deck.location.configFile);
  for (const warning of deck.warnings) {
    context.warn(warning);
  }

  return deckModuleCode(deck, brand);
}

/**
 * The runtime plugins as the deck loads them: the kit's runtime swapped for
 * `virtual:deck/kit-runtime`, which leaves out the kit layouts a code layout replaces, and the code
 * layouts' plugin right after it, or last when the kit's runtime is not among the plugins.
 *
 * @param plugins - The runtime plugin specifiers, in load order.
 */
export function withLocalLayouts(plugins: readonly string[]): string[] {
  const swapped = plugins.map((specifier) =>
    specifier === KIT_RUNTIME_PLUGIN ? VIRTUAL_KIT_RUNTIME_ID : specifier,
  );
  const kit = swapped.indexOf(VIRTUAL_KIT_RUNTIME_ID);
  const at = kit === -1 ? swapped.length : kit + 1;
  return [...swapped.slice(0, at), VIRTUAL_LOCAL_LAYOUTS_ID, ...swapped.slice(at)];
}

/**
 * The `layout.tsx` files of the deck's and its brand's code layouts, as globs for the dependency
 * scan. Nothing when the deck or its config cannot be read; the build reports that itself.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param activeDeck - Loads the deck.
 * @param override - A brand that replaces the deck config's.
 */
async function layoutScanEntries(
  workspaceRoot: string,
  activeDeck: () => Promise<LoadedDeck>,
  override: string | undefined,
): Promise<string[]> {
  try {
    const deck = await activeDeck();
    const brandDir = path.join(workspaceRoot, BRANDS_DIR, deckBrandName(deck.config, override));
    return [deck.location.dir, brandDir].map((dir) =>
      normalizePath(path.join(dir, LAYOUTS_DIR, '*', COMPONENT_FILE)),
    );
  } catch {
    return [];
  }
}

/**
 * Generates `virtual:deck/local-layouts` from the code layouts whose contracts are in the catalog,
 * watching their files and reporting every problem with the others. A layout with a problem is not
 * registered: the build already fails the slides that name it.
 *
 * @param context - The plugin context.
 * @param workspaceRoot - The absolute workspace root, for the paths in warnings.
 * @param local - The code layouts found.
 */
function localLayoutsModule(
  context: LoadContext,
  workspaceRoot: string,
  local: LocalLayouts,
): string {
  for (const file of local.files) {
    context.addWatchFile(file);
  }

  for (const problem of [...local.problems, ...local.warnings]) {
    context.warn(`${displayPath(workspaceRoot, problem.file)}: ${problem.message} ${problem.fix}`);
  }

  const loaded = new Set(local.catalogs.map((entry) => entry.ref.file));
  return localLayoutsModuleCode(local.layouts.filter((layout) => loaded.has(layout.contractFile)));
}

/**
 * Generates `virtual:deck/kit-runtime`: the kit's runtime plugin without the replaced kit layouts.
 * The kit's folder is the one `@deckster/kit/runtime` resolves to, so the generated module imports
 * the same files the static runtime does.
 *
 * @param context - The plugin context, to resolve the kit.
 * @param workspaceRoot - The absolute workspace root, for the error.
 * @param replaced - The kit layout names a code layout replaces.
 * @throws DeckBuildError when the kit's runtime does not resolve.
 */
async function kitRuntimeModule(
  context: LoadContext,
  workspaceRoot: string,
  replaced: readonly string[],
): Promise<string> {
  const runtime = await resolveKitRuntime(context, workspaceRoot);
  const names = kitCatalog.layouts.map((contract) => contract.name);
  return kitRuntimeModuleCode(path.dirname(runtime), names, replaced);
}

/**
 * The runtime plugin files with `virtual:deck/kit-runtime` as the kit's runtime file, for the brand
 * stylesheet's Tailwind sources: the generated module imports the kit's `src/` files, so the kit's
 * classes must still be scanned there.
 *
 * @param context - The plugin context, to resolve the kit.
 * @param workspaceRoot - The absolute workspace root, for the error.
 * @param files - The resolved runtime plugin ids, virtual ones as written.
 */
async function withKitRuntimeFile(
  context: LoadContext,
  workspaceRoot: string,
  files: readonly string[],
): Promise<string[]> {
  if (!files.includes(VIRTUAL_KIT_RUNTIME_ID)) {
    return [...files];
  }

  const runtime = await resolveKitRuntime(context, workspaceRoot);
  return files.map((file) => (file === VIRTUAL_KIT_RUNTIME_ID ? runtime : file));
}

/**
 * The resolved file of the kit's static runtime, `@deckster/kit/runtime`, from this package.
 *
 * @param context - The plugin context, to resolve the specifier.
 * @param workspaceRoot - The absolute workspace root, for the error.
 * @throws DeckBuildError when it does not resolve.
 */
async function resolveKitRuntime(context: LoadContext, workspaceRoot: string): Promise<string> {
  const [file] = await resolveRuntimePlugins(context, workspaceRoot, [KIT_RUNTIME_PLUGIN]);
  return file ?? KIT_RUNTIME_PLUGIN;
}

/**
 * Generates `virtual:deck/plugins` from the runtime plugins, resolved from this package.
 *
 * @param context - The plugin context, to resolve the specifiers.
 * @param workspaceRoot - The absolute workspace root, for the error.
 * @param runtimePlugins - The plugin specifiers, in load order.
 */
async function loadPluginsModule(
  context: LoadContext,
  workspaceRoot: string,
  runtimePlugins: readonly string[],
): Promise<string> {
  return pluginsModuleCode(await resolveRuntimePlugins(context, workspaceRoot, runtimePlugins));
}

/**
 * The resolved module ids of the runtime plugins, in load order. The deck plugin's own virtual
 * modules stay as written: `resolve` skips the plugin that calls it, and an import of the resolved
 * `\0` id would not load in a build.
 *
 * @param context - The plugin context, to resolve the specifiers.
 * @param workspaceRoot - The absolute workspace root, for the error.
 * @param runtimePlugins - The plugin specifiers.
 * @throws DeckBuildError naming a specifier that does not resolve.
 */
async function resolveRuntimePlugins(
  context: LoadContext,
  workspaceRoot: string,
  runtimePlugins: readonly string[],
): Promise<string[]> {
  return Promise.all(
    runtimePlugins.map(async (specifier) => {
      if (isVirtualPlugin(specifier)) {
        return specifier;
      }

      const resolved = await context.resolve(specifier, PLUGIN_IMPORTER);
      if (resolved === null) {
        throw runtimePluginNotFound(workspaceRoot, specifier);
      }

      return resolved.id;
    }),
  );
}

/**
 * The slide a module id belongs to, or `undefined` when the module is not a slide file of a deck.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param id - The module id, possibly with a query string.
 * @param code - The module's source.
 */
function slideSource(workspaceRoot: string, id: string, code: string): SlideFileSource | undefined {
  const file = id.replace(QUERY_PATTERN, '');
  const relative = displayPath(workspaceRoot, file);
  const match = SLIDE_PATH_PATTERN.exec(relative);
  if (match === null) {
    return undefined;
  }

  const [, slideId = '', extension = ''] = match;
  return { id: slideId, extension, code, file, displayPath: relative };
}

/**
 * Reloads the page when slide files are added or removed or the manifest changes, and when an agent
 * turn's hold on the config ends after the deck was loaded during it. Other files appearing in
 * `slides/`, such as the temporary file a turn's sync writes before renaming it over a slide,
 * change no slide list and reload nothing.
 *
 * @param server - The dev server.
 * @param deck - The deck.
 * @param heldLoads - The deck loads made while a turn held the config.
 * @param onChange - Called before the reload, to forget the loaded deck.
 */
function watchManifest(
  server: ViteDevServer,
  deck: DeckLocation,
  heldLoads: HeldLoads,
  onChange: () => void,
): void {
  /**
   * Forgets the loaded deck and reloads the page with the new manifest.
   */
  const reload = () => {
    onChange();
    const environment = server.environments.client;
    const deckNode = environment.moduleGraph.getModuleById(RESOLVED_DECK_ID);
    if (deckNode !== undefined) {
      environment.moduleGraph.invalidateModule(deckNode);
    }

    environment.hot.send({ type: 'full-reload' });
  };
  const slideFilesChanged = trackSlideFileChanges(deck.slidesDir);
  server.watcher.add(deck.dir);
  server.watcher.on('all', (event, file) => {
    const isConfigChange = file === deck.configFile;
    if (isConfigChange || slideFilesChanged(event, file)) {
      reload();
    }
  });
  // While an agent turn runs the config is held; once the turn guard has settled the turn (its
  // working copy synced and retired, everything else verified), the hold ends. A deck loaded during
  // the hold may show a config held back from the turn, so the page reloads to load it for real. A
  // page that loaded no deck during the turn already shows the config, and keeps its state.
  const stop = onCodeReleased((root) => {
    if (heldLoads.released(root)) {
      reload();
    }
  });
  server.httpServer?.once('close', stop);
}

/**
 * The error for a runtime plugin specifier that does not resolve.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param specifier - The specifier that failed.
 */
function runtimePluginNotFound(workspaceRoot: string, specifier: string): Error {
  return unresolvedRuntimePlugin(
    { file: PLUGIN_IMPORTER, displayPath: displayPath(workspaceRoot, PLUGIN_IMPORTER) },
    {
      message: `"${specifier}" could not be resolved.`,
      fix: 'Add the package as a dependency of @deckster/vite-plugin, or pass an absolute path.',
    },
  );
}

/**
 * Escapes `&`, `<` and `>` for text inside an HTML element.
 *
 * @param text - Any text.
 */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
