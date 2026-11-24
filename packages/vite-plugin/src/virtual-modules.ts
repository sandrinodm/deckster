import { budgetSeconds } from '@deckster/engine/frontmatter';
import { normalizePath } from 'vite';

import type { LoadedDeck } from '#decks/load-deck.ts';

import { SLIDES_DIR } from '#decks/deck-paths.ts';

/**
 * The active deck; its default export is a `DeckManifest` from `@deckster/engine/manifest`.
 */
export const VIRTUAL_DECK_ID = 'virtual:deck';

/**
 * The runtime plugins; its default export is a `readonly DeckPlugin[]` from `@deckster/engine`.
 */
export const VIRTUAL_PLUGINS_ID = 'virtual:deck/plugins';

/**
 * The code layouts of the deck and its brand; its default export is a `DeckPlugin` whose layouts
 * each load their component on first use.
 */
export const VIRTUAL_LOCAL_LAYOUTS_ID = 'virtual:deck/local-layouts';

/**
 * The start of every virtual module id the deck plugin serves.
 */
const VIRTUAL_PREFIX = 'virtual:';

/**
 * The resolved id of {@link VIRTUAL_DECK_ID}; the `\0` keeps other plugins away from it.
 */
export const RESOLVED_DECK_ID = `\0${VIRTUAL_DECK_ID}`;

/**
 * The resolved id of {@link VIRTUAL_PLUGINS_ID}.
 */
export const RESOLVED_PLUGINS_ID = `\0${VIRTUAL_PLUGINS_ID}`;

/**
 * The resolved id of {@link VIRTUAL_LOCAL_LAYOUTS_ID}.
 */
export const RESOLVED_LOCAL_LAYOUTS_ID = `\0${VIRTUAL_LOCAL_LAYOUTS_ID}`;

/**
 * Whether a runtime plugin specifier is one of the deck plugin's own virtual modules, which it
 * resolves itself and which has no folder on disk.
 *
 * @param specifier - A runtime plugin specifier or resolved id.
 */
export function isVirtualPlugin(specifier: string): boolean {
  return specifier.startsWith(VIRTUAL_PREFIX);
}

/**
 * Generates `virtual:deck`: one namespace import per slide, in manifest order, and the manifest
 * object the engine renders.
 *
 * @param deck - A loaded, validated deck.
 * @param brand - The brand the deck renders with, set as `data-brand` on the deck.
 * @returns JavaScript source.
 */
export function deckModuleCode(deck: LoadedDeck, brand: string): string {
  const imports = deck.slides.map(
    (slide, index) =>
      `import * as slide${index} from ${JSON.stringify(normalizePath(slide.file))};`,
  );
  const entries = deck.slides.map((slide, index) => {
    const fields = [
      `id: ${JSON.stringify(slide.id)}`,
      `file: ${JSON.stringify(`${SLIDES_DIR}/${slide.fileName}`)}`,
      `kind: ${JSON.stringify(slide.kind)}`,
      `module: slide${index}`,
    ];
    return `    { ${fields.join(', ')} },`;
  });
  const durationSeconds = budgetSeconds(deck.config.duration);
  const duration =
    durationSeconds === undefined ? [] : [`  durationSeconds: ${JSON.stringify(durationSeconds)},`];
  return [
    ...imports,
    '',
    'export default {',
    `  id: ${JSON.stringify(deck.location.id)},`,
    `  title: ${JSON.stringify(deck.config.title)},`,
    `  brand: ${JSON.stringify(brand)},`,
    `  mouseNavigation: ${JSON.stringify(deck.config.mouseNavigation ?? true)},`,
    ...duration,
    '  slides: [',
    ...entries,
    '  ],',
    '};',
    '',
  ].join('\n');
}

/**
 * Generates `virtual:deck/plugins`: the default export of each plugin module, in order.
 *
 * @param files - Absolute paths of the plugin modules.
 * @returns JavaScript source.
 */
export function pluginsModuleCode(files: readonly string[]): string {
  const imports = files.map(
    (file, index) => `import plugin${index} from ${JSON.stringify(normalizePath(file))};`,
  );
  const names = files.map((_, index) => `plugin${index}`);
  return [...imports, '', `export default [${names.join(', ')}];`, ''].join('\n');
}

/**
 * A code layout the generated runtime plugin registers.
 */
export type LocalLayoutModule = {
  /**
   * The layout name.
   */
  readonly name: string;

  /**
   * The absolute path of its `layout.tsx`.
   */
  readonly componentFile: string;
};

/**
 * Generates `virtual:deck/local-layouts`: a runtime plugin that registers each code layout with the
 * engine's `lazyLayout`, so a `layout.tsx` is imported when a slide first needs it and one that
 * fails to load breaks only the slides on that layout. A deck without code layouts gets a plugin
 * with no layouts.
 *
 * @param layouts - The layouts, in catalog order.
 * @returns JavaScript source.
 */
export function localLayoutsModuleCode(layouts: readonly LocalLayoutModule[]): string {
  const names = layouts.length === 0 ? 'definePlugin' : 'definePlugin, lazyLayout';
  const entries = layouts.map((layout) => {
    const file = JSON.stringify(normalizePath(layout.componentFile));
    return `  lazyLayout(${JSON.stringify(layout.name)}, () => import(${file})),`;
  });
  return [
    `import { ${names} } from '@deckster/engine';`,
    '',
    "export default definePlugin({ name: 'local-layouts', layouts: [",
    ...entries,
    '] });',
    '',
  ].join('\n');
}
