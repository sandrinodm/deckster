import type { ViteDevServer } from 'vite';

import { onCodeReleased } from '@deckster/brand/node';
import path from 'node:path';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { HeldLoads } from '#held-loads.ts';

import { LAYOUTS_DIR } from '#layouts/local-layouts.ts';

/**
 * The files of a layout folder Vite's own hot update handles: components and their stylesheets.
 */
const HOT_EXTENSIONS: ReadonlySet<string> = new Set(['.tsx', '.css']);

/**
 * Whether a watcher event is an edit to a component or stylesheet inside a layout folder (or
 * `_shared/`), which Vite's hot update applies by itself. Everything else under `layouts/` (a
 * contract, `limits.ts`, a `.ts` helper, a file or folder added or removed) changes what the build
 * validates slides against, and needs the contracts loaded again. So does an edit to the component
 * of a layout that is not registered: nothing imports it, and the edit may fix the name it
 * registers, which the catalog checks.
 *
 * @param layoutsDir - The absolute `layouts/` folder of a brand or a deck.
 * @param event - The watcher's event name, such as `change` or `add`.
 * @param file - An absolute path the watcher reported.
 * @param isUnregistered - Whether a file is the component of a layout that is not registered; none
 *   is when left out.
 */
export function isHotLayoutEdit(
  layoutsDir: string,
  event: string,
  file: string,
  isUnregistered: (file: string) => boolean = () => false,
): boolean {
  const relative = path.relative(layoutsDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return false;
  }

  const isInFolder = relative.split(path.sep).length > 1;
  const isHotFile = isInFolder && HOT_EXTENSIONS.has(path.extname(file));
  return event === 'change' && isHotFile && !isUnregistered(file);
}

/**
 * Whether a path lies inside a folder.
 *
 * @param dir - An absolute folder.
 * @param file - An absolute path.
 */
function isUnder(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Reloads the page with the layout contracts loaded afresh when a file under the deck's `layouts/`
 * changes in a way Vite's hot update does not cover (see {@link isHotLayoutEdit}), and when an agent
 * turn's hold ends after contracts were asked for during it. Every module is invalidated, because
 * every slide is validated against the contracts. The brand's `layouts/` folder is watched with the
 * rest of the brand, by `watchBrand`.
 *
 * @param server - The dev server.
 * @param input - The deck, the contract loads made while a turn held them, which components belong
 *   to layouts that are not registered, and what forgets the loaded catalog.
 */
export function watchDeckLayouts(
  server: ViteDevServer,
  input: {
    deck: DeckLocation;
    heldLoads: HeldLoads;
    isUnregistered: (file: string) => boolean;
    onChange: () => void;
  },
): void {
  const layoutsDir = path.join(input.deck.dir, LAYOUTS_DIR);
  /**
   * Forgets the loaded catalog and reloads every page.
   */
  const reload = () => {
    input.onChange();
    const environment = server.environments.client;
    environment.moduleGraph.invalidateAll();
    environment.hot.send({ type: 'full-reload' });
  };
  server.watcher.add(layoutsDir);
  server.watcher.on('all', (event, file) => {
    const isLayoutsChange = file === layoutsDir || isUnder(layoutsDir, file);
    if (isLayoutsChange && !isHotLayoutEdit(layoutsDir, event, file, input.isUnregistered)) {
      reload();
    }
  });
  // A contract asked for while an agent turn held it was answered with its last value, or not at
  // all. Once the turn is settled it loads for real, so the page reloads with it.
  const stop = onCodeReleased((root) => {
    if (input.heldLoads.released(root)) {
      reload();
    }
  });
  server.httpServer?.once('close', stop);
}
