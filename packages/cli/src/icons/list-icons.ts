import { DEFAULT_BRAND, isSafeName, type BrandError } from '@deckster/brand';
import { listBrands, loadBrand } from '@deckster/brand/node';
import { iconSetNames } from '@deckster/kit/icon-sets';
import { Effect, type FileSystem } from 'effect';

import { cliError, usageError, type CliError } from '#cli-error.ts';
import { Workspace } from '#workspace.ts';

/**
 * A brand and the icon set it draws from.
 */
export type BrandIconSet = {
  /**
   * The brand folder name.
   */
  name: string;

  /**
   * The Iconify set id, such as `lucide`.
   */
  set: string;
};

/**
 * The icon names several brands share, as `deck icons --json` prints them.
 */
export type IconListing = {
  /**
   * The brands asked about, each with its icon set.
   */
  brands: BrandIconSet[];

  /**
   * How many names are in `icons`.
   */
  count: number;

  /**
   * The names every one of those sets has, sorted; narrowed by the search when there is one.
   */
  icons: string[];
};

/**
 * Lists the icon names available in every one of the sets the brands use: the names `<Icon name>`
 * and a layout's `icon` field accept in a deck that renders in all of those brands.
 *
 * @param requested - The brand folder names; every brand in `brands/` when empty.
 * @param search - A substring the names must contain, case-insensitive; every name when omitted.
 * @throws CliError in the error channel when a brand does not exist or fails to load, or a set's
 *   package is not installed.
 */
export const listIcons = Effect.fn('listIcons')(function* (
  requested: readonly string[],
  search: string | undefined,
): Effect.fn.Return<IconListing, CliError | BrandError, FileSystem.FileSystem | Workspace> {
  const { root } = yield* Workspace;
  // The built-in default brand is available in a workspace that has no brands/default of its own.
  const available = [...new Set([DEFAULT_BRAND, ...(yield* listBrands(root))])].toSorted();
  const names = requested.length === 0 ? available : [...new Set(requested)];
  if (names.length === 0) {
    return yield* cliError('There are no brands under brands/. Add one with a brand.ts file.');
  }

  for (const name of names) {
    if (!isSafeName(name) || !available.includes(name)) {
      return yield* usageError(
        `There is no brand "${name}". Brands: ${available.join(', ')}.`,
        'icons',
      );
    }
  }

  const brands: BrandIconSet[] = [];
  for (const name of names) {
    brands.push({ name, set: (yield* loadBrand(root, name)).tokens.icons.set });
  }

  const sets = [...new Set(brands.map((brand) => brand.set))];
  let shared: string[] | undefined;
  for (const set of sets) {
    const names = iconSetNames(set);
    if (names === undefined) {
      return yield* cliError(
        `The "${set}" icon set is not installed.\n` +
          `Add \`@iconify-json/${set}\` to @deckster/kit, or change the brand's icons.set.`,
      );
    }

    const known = new Set(names);
    shared = shared === undefined ? names : shared.filter((name) => known.has(name));
  }

  const needle = search?.toLowerCase();
  const icons = (shared ?? []).filter((name) => needle === undefined || name.includes(needle));
  return { brands, count: icons.length, icons };
});
