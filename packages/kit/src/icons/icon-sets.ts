import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { createRequire } from 'node:module';

/**
 * The names an Iconify set's `icons.json` defines.
 */
type IconSetData = {
  /**
   * The icon ids.
   */
  icons: Record<string, unknown>;

  /**
   * Alternative ids for icons.
   */
  aliases?: Record<string, unknown>;
};

/**
 * The kit's own `require`, so icon sets resolve from the kit's dependencies, as the build's icon
 * check (`hasIcon` in `mdx/remark-icons.ts`) resolves them.
 */
const require = createRequire(import.meta.url);

/**
 * The names of every icon an installed Iconify set has, by id and by alias: the names `<Icon name>`
 * and the layouts' `icon` fields accept for that set. Node only.
 *
 * @param set - The set id, such as `lucide`.
 * @returns The names, sorted; `undefined` when the set's package is not installed.
 */
export function iconSetNames(set: string): string[] | undefined {
  try {
    const data = require(`@iconify-json/${set}/icons.json`) as IconSetData;
    return [
      ...new Set([...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})]),
    ].toSorted();
  } catch {
    return undefined;
  }
}

/**
 * How to install an Iconify set the kit cannot find. The kit resolves sets from its own folder, so
 * a published CLI finds a set installed in the same place as the CLI (globally, when the CLI is
 * global), and the repository checkout finds one in `@deckster/kit`'s dependencies; a package
 * installed only in the deck's workspace folder is not on that path.
 *
 * @param set - The set id, such as `mdi`.
 * @param installed - Whether the CLI is a published copy; defaults to the running one.
 * @returns A clause naming the package and where to add it, without a full stop.
 */
export function installIconSetHint(set: string, installed: boolean = FRAMEWORK_INSTALLED): string {
  const name = `@iconify-json/${set}`;
  return installed
    ? `Install \`${name}\` where the deck CLI is installed, with the same tool (\`npm install ` +
        `--global ${name}\` for a global npm install, \`pnpm add --global ${name}\` for pnpm)`
    : `Add \`${name}\` to @deckster/kit's dependencies and run \`pnpm install\``;
}
