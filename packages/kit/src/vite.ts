import type { PluginOption } from 'vite-plus';

import { fileURLToPath } from 'node:url';
import Icons from 'unplugin-icons/vite';

import { csvPlugin } from '#charts/data/csv-plugin.ts';
import { compileIcon } from '#icons/compile-icon.ts';

/**
 * The kit's package folder, where its dependencies (the icon sets) are installed.
 */
const KIT_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The kit's runtime plugin, as a path for Vite's dependency scan. The deck loads the kit through a
 * virtual module, which the scan does not follow, so imports that only the kit makes (the Magic
 * Move animation, the Lottie player, the link components' QR code) are found late: Vite then
 * reloads the page and leaves two copies of React. Scanning the plugin up front finds them all.
 */
export const KIT_SCAN_ENTRY = fileURLToPath(new URL('./runtime.ts', import.meta.url));

/**
 * The Vite plugins the kit's components need, added to every deck's build by
 * `@deckster/vite-plugin`. `unplugin-icons` serves `~icons/<set>/<name>` imports as React
 * components built from the Iconify set, so a deck ships only the icons its slides use. The sets
 * are resolved from the kit's own dependencies, so a deck needs no icon package of its own. CSV
 * files a slide imports become their rows, parsed at build time, for charts.
 */
export function kitVitePlugins(): PluginOption[] {
  return [
    csvPlugin(),
    Icons({
      compiler: { compiler: compileIcon, extension: 'js' },
      collectionsNodeResolvePath: KIT_ROOT,
    }),
  ];
}
