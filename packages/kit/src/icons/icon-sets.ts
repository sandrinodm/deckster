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
