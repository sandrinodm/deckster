import type { ComponentType, SVGProps } from 'react';

/**
 * An icon component, as `unplugin-icons` serves one.
 */
export type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * A web address or absolute path that needs no import: `https:`, `data:` or `/` from the deck's
 * `public/` folder.
 */
const DIRECT_SOURCE = /^(?:[a-z][a-z0-9+.-]*:|\/)/iu;

/**
 * The icons and files that layout fields name, by key: `icon:<set>/<name>` and `asset:<path as
 * written>`. A slide module fills it when it loads, before anything renders.
 */
const registry = new Map<string, unknown>();

/**
 * Records the icons and files a slide's frontmatter names. The kit's MDX extension calls it from
 * every MDX slide whose layout fields name an icon (`icon: leaf`) or a local file (`photo:
 * ../assets/dana.jpg`), with the imports it added, so a layout can draw them from its frontmatter.
 *
 * @param entries - Imported icons and file URLs, by key.
 * @returns The same entries, so the module can export them.
 */
export function registerFrontmatterAssets(
  entries: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  for (const [key, value] of Object.entries(entries)) {
    registry.set(key, value);
  }

  return entries;
}

/**
 * The key a frontmatter icon is registered under.
 *
 * @param name - The name as written: `leaf`, or `set:name` for another installed set.
 * @param brandSet - The brand's icon set, for a bare name.
 */
export function frontmatterIconKey(name: string, brandSet: string): string {
  const [first, second] = name.split(':');
  return second === undefined ? `icon:${brandSet}/${name}` : `icon:${first ?? brandSet}/${second}`;
}

/**
 * The key a frontmatter file is registered under. A path written relative to its slide
 * (`./photo.png`) names a different file in each folder, so the key carries the slide's file when
 * there is one.
 *
 * @param source - The path as written in the frontmatter.
 * @param slideFile - The slide file, relative to the deck folder (`slides/intro.mdx`); left out for
 *   a key shared by every slide.
 */
export function frontmatterAssetKey(source: string, slideFile?: string): string {
  return slideFile === undefined ? `asset:${source}` : `asset:${slideFile}::${source}`;
}

/**
 * The icon a layout field names, resolved at build time from the brand's icon set.
 *
 * @param name - The name as written, or nothing.
 * @param brandSet - The brand's icon set.
 * @returns The component; `undefined` when the field is empty or the icon was not resolved (a TSX
 *   slide, whose frontmatter is not compiled).
 */
export function frontmatterIcon(
  name: string | undefined,
  brandSet: string,
): IconComponent | undefined {
  if (name === undefined) {
    return undefined;
  }

  const icon = registry.get(frontmatterIconKey(name, brandSet));
  return typeof icon === 'function' ? (icon as IconComponent) : undefined;
}

/**
 * The URL of a file a layout field names: the build's import of a local path, or the value itself
 * for a web address or a `public/` path.
 *
 * @param source - The path as written, or nothing.
 * @param slideFile - The slide the field is on, so a path relative to the slide finds the file of
 *   that slide's folder.
 * @returns The URL; `undefined` when the field is empty or a local file was not found.
 */
export function frontmatterAsset(
  source: string | undefined,
  slideFile?: string,
): string | undefined {
  if (source === undefined || source === '') {
    return undefined;
  }

  const imported =
    registry.get(frontmatterAssetKey(source, slideFile)) ??
    registry.get(frontmatterAssetKey(source));
  if (typeof imported === 'string') {
    return imported;
  }

  return DIRECT_SOURCE.test(source) ? source : undefined;
}
