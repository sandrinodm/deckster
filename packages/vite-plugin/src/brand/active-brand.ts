import type { Rollup, ViteDevServer } from 'vite';

import { DEFAULT_BRAND, describeProblem } from '@deckster/brand';
import { BRANDS_DIR, onCodeReleased, type LoadedBrand } from '@deckster/brand/node';
import { Effect } from 'effect';
import path from 'node:path';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { RunEffect } from '#run-effect.ts';

import { brandCssCode, brandModuleCode, RESOLVED_BRAND_ID } from '#brand/brand-modules.ts';
import { loadDeckBrand } from '#brand/load-deck-brand.ts';
import { loadDeck } from '#decks/load-deck.ts';

/**
 * The brand a deck renders with, loaded once and reloaded after edits.
 */
export type ActiveBrand = {
  /**
   * The loaded brand; a failed load is retried on the next call.
   */
  load: () => Promise<LoadedBrand>;

  /**
   * Forgets the loaded brand, so the next `load` reads the files again.
   */
  reset: () => void;

  /**
   * The brand folder name, once known.
   */
  name: () => string | undefined;
};

/**
 * What the active brand depends on.
 */
export type ActiveBrandOptions = {
  /**
   * The absolute workspace root.
   */
  workspaceRoot: string;

  /**
   * A brand that overrides the deck config's `brand`, for previewing a deck in another brand.
   */
  override: string | undefined;

  /**
   * Finds the deck whose config names the brand.
   */
  deck: () => Promise<DeckLocation>;

  /**
   * Runs the loading effects at the plugin's promise-based edge.
   */
  run: RunEffect;
};

/**
 * Tracks the deck's brand: the `brand` option if given, else the deck config's `brand`, else
 * `default`.
 *
 * @param options - The workspace, the override and how to find the deck.
 */
export function createActiveBrand(options: ActiveBrandOptions): ActiveBrand {
  let loaded: Promise<LoadedBrand> | undefined;
  let name: string | undefined;

  /**
   * Reads the deck config for the brand name, then loads and compiles that brand.
   */
  const load = async (): Promise<LoadedBrand> => {
    const location = await options.deck();
    return options.run(
      Effect.gen(function* () {
        const deck = yield* loadDeck(options.workspaceRoot, location);
        name = options.override ?? deck.config.brand ?? DEFAULT_BRAND;
        return yield* loadDeckBrand(options.workspaceRoot, name);
      }),
    );
  };
  return {
    load: () => {
      loaded ??= load().catch((error: unknown) => {
        loaded = undefined;
        throw error;
      });
      return loaded;
    },
    reset: () => {
      loaded = undefined;
    },
    name: () => name,
  };
}

/**
 * The parts of Vite's plugin context the brand modules use.
 */
type BrandModuleContext = Pick<Rollup.PluginContext, 'addWatchFile' | 'warn'>;

/**
 * Loads `virtual:deck/brand` (when `id` is its resolved id) or else `virtual:deck/brand.css`. The
 * stylesheet makes Tailwind scan the deck, the brand and the folders of the runtime plugins (the
 * kit's layouts).
 *
 * @param context - The plugin context, to watch the brand file and report its warnings.
 * @param input - Which module, the brand, the deck and the runtime plugin files.
 * @returns The module source.
 */
export function brandModuleSource(
  context: BrandModuleContext,
  input: { id: string; brand: LoadedBrand; deck: DeckLocation; pluginFiles: readonly string[] },
): string {
  const { id, brand, deck, pluginFiles } = input;
  context.addWatchFile(brand.location.file);
  if (id === RESOLVED_BRAND_ID) {
    for (const warning of brand.warnings) {
      context.warn(`${brand.location.displayPath}: ${describeProblem(warning)} ${warning.fix}`);
    }

    return brandModuleCode(brand);
  }

  const pluginDirs = pluginFiles.map((file) => path.dirname(file));
  const sources = [...new Set([deck.dir, brand.location.dir, ...pluginDirs])];
  return brandCssCode(brand, sources);
}

/**
 * Reloads the page with the brand read afresh whenever a file of the active brand changes, or the
 * deck config changes (it may name another brand). Every module is invalidated, because slides are
 * validated against the brand's surfaces.
 *
 * @param server - The dev server.
 * @param input - The workspace, the deck and its brand.
 */
export function watchBrand(
  server: ViteDevServer,
  input: { workspaceRoot: string; deck: DeckLocation; brand: ActiveBrand },
): void {
  const brandsDir = path.join(input.workspaceRoot, BRANDS_DIR);
  server.watcher.add(brandsDir);
  /**
   * Forgets the loaded brand and reloads every page.
   */
  const reload = () => {
    input.brand.reset();
    const environment = server.environments.client;
    environment.moduleGraph.invalidateAll();
    environment.hot.send({ type: 'full-reload' });
  };
  server.watcher.on('all', (_event, file) => {
    const isConfigChange = file === input.deck.configFile;
    if (isConfigChange || isActiveBrandFile(brandsDir, file, input.brand.name())) {
      reload();
    }
  });
  // A held brand or config loads again once the agent turn that held it is settled.
  const stop = onCodeReleased((root) => {
    const resolved = `${root}${path.sep}`;
    if (
      path.resolve(input.deck.configFile).startsWith(resolved) ||
      isActiveBrandFile(brandsDir, path.join(root, 'brand.ts'), input.brand.name())
    ) {
      reload();
    }
  });
  server.httpServer?.once('close', stop);
}

/**
 * Whether a file belongs to the active brand's folder, or to any brand while its name is not known
 * yet.
 *
 * @param brandsDir - The absolute `brands/` folder.
 * @param file - An absolute path the watcher reported.
 * @param name - The active brand's folder name, once known.
 */
function isActiveBrandFile(brandsDir: string, file: string, name: string | undefined): boolean {
  const relative = path.relative(brandsDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  return name === undefined || relative.split(path.sep)[0] === name;
}
