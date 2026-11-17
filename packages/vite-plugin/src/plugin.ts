import type { Plugin, Rollup, ViteDevServer } from 'vite';

import { onCodeReleased } from '@deckster/brand/node';
import { devSessionOf, issueDevSession } from '@deckster/comments/dev-session';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { MdxWarning } from '#slides/compile-mdx.ts';

import { brandModuleSource, createActiveBrand, watchBrand } from '#brand/active-brand.ts';
import {
  RESOLVED_BRAND_ID,
  resolvedBrandCssId,
  VIRTUAL_BRAND_CSS_ID,
  VIRTUAL_BRAND_ID,
} from '#brand/brand-modules.ts';
import { DECKS_DIR, displayPath, SLIDES_DIR, type DeckLocation } from '#decks/deck-paths.ts';
import { findDeck } from '#decks/discover-decks.ts';
import { loadDeck, type LoadedDeck } from '#decks/load-deck.ts';
import { REORDER_ENDPOINT, reorderMiddleware } from '#decks/reorder-middleware.ts';
import { unresolvedRuntimePlugin } from '#errors.ts';
import {
  DEFAULT_LAYOUT_CATALOGS,
  loadLayoutCatalog,
  type LayoutCatalogIndex,
} from '#layouts/load-layout-catalog.ts';
import { OPEN_IN_EDITOR_ENDPOINT, refuseOpenInEditor } from '#open-in-editor-guard.ts';
import { makeRunEffect } from '#run-effect.ts';
import { DEFAULT_MDX_EXTENSIONS, loadMdxExtensions } from '#slides/load-mdx-extensions.ts';
import {
  transformMdxPartial,
  transformMdxSlide,
  transformTsxSlide,
} from '#slides/transform-slide.ts';
import {
  deckModuleCode,
  pluginsModuleCode,
  RESOLVED_DECK_ID,
  RESOLVED_PLUGINS_ID,
  VIRTUAL_DECK_ID,
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
   * or an unknown code language; `deck lint` turns them into findings.
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
  let catalog: Promise<LayoutCatalogIndex> | undefined;

  /**
   * Finds the deck once and remembers the result, so every hook sees the same location.
   */
  const findActiveDeck = (): Promise<DeckLocation> => {
    location ??= run(findDeck(workspaceRoot, options.deck));
    return location;
  };

  /**
   * Loads the deck config and slide list, reused until the manifest or the slide files change; a
   * failed load is retried on the next call.
   */
  const activeDeck = (): Promise<LoadedDeck> => {
    loadedDeck ??= findActiveDeck()
      .then((deck) => run(loadDeck(workspaceRoot, deck)))
      .catch((error: unknown) => {
        loadedDeck = undefined;
        throw error;
      });
    return loadedDeck;
  };

  /**
   * Loads the layout catalogs once.
   */
  const layoutCatalog = (): Promise<LayoutCatalogIndex> => {
    catalog ??= run(loadLayoutCatalog(options.layoutCatalogs ?? DEFAULT_LAYOUT_CATALOGS));
    return catalog;
  };

  const brand = createActiveBrand({
    workspaceRoot,
    override: options.brand,
    deck: findActiveDeck,
    run,
  });

  /**
   * The resolved id of `virtual:deck/brand.css`, a path in the deck's folder.
   */
  const brandCssId = async (): Promise<string> => resolvedBrandCssId((await findActiveDeck()).dir);

  /**
   * The runtime plugins of this server or build: the dev plugins only while serving.
   */
  const runtimePlugins = (): readonly string[] =>
    serving ? [...basePlugins, ...devPlugins] : basePlugins;

  const warnings = new Map<string, MdxWarning[]>();

  return {
    name: 'deck',
    enforce: 'pre',
    api: { activeDeck, slideWarnings: (file) => warnings.get(file) ?? [] },

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

      return id === VIRTUAL_PLUGINS_ID ? RESOLVED_PLUGINS_ID : undefined;
    },

    async load(id) {
      if (id === RESOLVED_DECK_ID) {
        const { tokens } = await brand.load();
        return deckModule(this, await activeDeck(), tokens.name);
      }

      if (id === RESOLVED_BRAND_ID || id === (await brandCssId())) {
        const pluginFiles = await resolveRuntimePlugins(this, workspaceRoot, runtimePlugins());
        const deck = await findActiveDeck();
        return brandModuleSource(this, { id, brand: await brand.load(), deck, pluginFiles });
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
        loadMdxExtensions(options.mdxExtensions ?? DEFAULT_MDX_EXTENSIONS, {
          workspaceRoot,
          deckDir: deck.location.dir,
          brand: {
            name: tokens.name,
            icons: tokens.icons,
            treatments: Object.keys(tokens.imagery.treatments),
          },
        }),
      );
      const reported: MdxWarning[] = [];
      warnings.set(file.file, reported);
      /**
       * Prints a plugin's warning with the slide it belongs to, and keeps it for `deck lint`.
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

      const slide = {
        ...file,
        mdx,
        onWarning,
        layouts: await layoutCatalog(),
        brand: { name: tokens.name, surfaces: Object.keys(tokens.surfaces) },
      };
      const transformed = await run(
        file.extension === 'mdx' ? transformMdxSlide(slide, development) : transformTsxSlide(slide),
      );
      return { code: transformed, map: null };
    },

    async configureServer(server) {
      const session = devSessionOf(server);
      server.middlewares.use(issueDevSession(session));
      server.middlewares.use(OPEN_IN_EDITOR_ENDPOINT, refuseOpenInEditor);
      const deck = await findActiveDeck();
      watchManifest(server, deck, () => {
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
 * The resolved module ids of the runtime plugins, in load order.
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
 * Reloads the page when slides are added or removed or the manifest changes.
 *
 * @param server - The dev server.
 * @param deck - The deck.
 * @param onChange - Called before the reload, to forget the loaded deck.
 */
function watchManifest(server: ViteDevServer, deck: DeckLocation, onChange: () => void): void {
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
  server.watcher.add(deck.dir);
  server.watcher.on('all', (event, file) => {
    const isConfigChange = file === deck.configFile;
    const isSlideListChange =
      (event === 'add' || event === 'unlink') && path.dirname(file) === deck.slidesDir;
    if (isConfigChange || isSlideListChange) {
      reload();
    }
  });
  // While an agent turn runs the config is held; once the turn guard has settled the turn (its
  // working copy synced and retired, everything else verified), the hold ends and the config (with
  // any slide-list edit) loads again.
  const stop = onCodeReleased((root) => {
    if (path.resolve(deck.configFile).startsWith(`${root}${path.sep}`)) {
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
