import type { Plugin } from 'vite-plus';

/**
 * The hook `@tailwindcss/node` calls before it imports a JavaScript module for a stylesheet
 * (`@plugin`, `@config`): `globalThis.__tw_load(url)`. Whatever it throws fails the compile. It is
 * the one place every such import passes through, whichever stylesheet asked and however that
 * stylesheet was reached (imported by a slide, by another stylesheet through `@import`, which
 * Tailwind inlines itself without Vite seeing the file, or spelled with escapes or in upper case).
 */
const TAILWIND_LOAD_HOOK = '__tw_load';

/**
 * The message a stylesheet that would load JavaScript fails with.
 *
 * @param url - The module Tailwind was about to import.
 */
export function stylesheetCodeMessage(url: string): string {
  return (
    `A stylesheet asked Tailwind to load JavaScript (${url}) through @plugin or @config, which ` +
    'would run it in this Node process. Deck and brand stylesheets may not load code: use plain ' +
    "CSS and the brand's tokens, and remove the @plugin or @config rule."
  );
}

/**
 * Makes every JavaScript import Tailwind would make for a stylesheet fail, for the rest of this
 * process: `@plugin` and `@config` never run code in Node, whoever wrote the stylesheet. The hook
 * is defined read-only and cannot be replaced. Safe to call more than once.
 */
export function refuseStylesheetCode(): void {
  const existing = Object.getOwnPropertyDescriptor(globalThis, TAILWIND_LOAD_HOOK);
  if (existing !== undefined && existing.configurable === false) {
    return;
  }

  Object.defineProperty(globalThis, TAILWIND_LOAD_HOOK, {
    value: (url: unknown): never => {
      throw new Error(stylesheetCodeMessage(String(url)));
    },
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

/**
 * Refuses stylesheet code at the build tool: as soon as Vite reads the config, Tailwind's module
 * loader is closed for this process (`refuseStylesheetCode`), so `@plugin` and `@config` fail the
 * build or the dev server's transform with a clear error, in the deck, the brand or anywhere else.
 */
export function deckCssGuardPlugin(): Plugin {
  return {
    name: 'deck:css-guard',
    enforce: 'pre',

    config() {
      refuseStylesheetCode();
    },
  };
}
