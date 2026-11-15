import type { LoadedBrand } from '@deckster/brand/node';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePath } from 'vite';

/**
 * The active brand's tokens (default export) and logo URLs (`logoUrls`), for `useBrand()`.
 */
export const VIRTUAL_BRAND_ID = 'virtual:deck/brand';

/**
 * The active brand's stylesheet: Tailwind, the brand's custom properties and its fonts.
 */
export const VIRTUAL_BRAND_CSS_ID = 'virtual:deck/brand.css';

/**
 * The resolved id of {@link VIRTUAL_BRAND_ID}.
 */
export const RESOLVED_BRAND_ID = `\0${VIRTUAL_BRAND_ID}`;

/**
 * The file name of the stylesheet's resolved id, in the deck folder; no such file exists.
 */
const BRAND_CSS_FILE_NAME = 'deck-brand.virtual.css';

/**
 * The resolved id of {@link VIRTUAL_BRAND_CSS_ID}. Unlike the other virtual modules it is a path in
 * an existing folder (the deck's, though no such file exists), because Tailwind scans from the
 * stylesheet's folder and a `\0` id or a missing folder gives it nothing to scan.
 *
 * @param deckDir - The absolute deck folder.
 */
export function resolvedBrandCssId(deckDir: string): string {
  return normalizePath(path.join(deckDir, BRAND_CSS_FILE_NAME));
}

/**
 * Tailwind's stylesheets, imported by absolute path so the virtual module needs no resolver.
 */
const TAILWIND_CSS = {
  /**
   * The default theme variables, in the `theme` layer.
   */
  theme: tailwindFile('tailwindcss/theme.css'),

  /**
   * The base reset, in the `base` layer.
   */
  preflight: tailwindFile('tailwindcss/preflight.css'),

  /**
   * The utility classes, in the `utilities` layer, generated only for the scanned sources.
   */
  utilities: tailwindFile('tailwindcss/utilities.css'),
};

/**
 * Generates `virtual:deck/brand`: the tokens as JSON and an import per logo and background layer
 * file, so they become hashed assets in a build.
 *
 * @param brand - The loaded brand.
 * @returns JavaScript source.
 */
export function brandModuleCode(brand: LoadedBrand): string {
  const logos = urlImports('logo', brand.logoFiles);
  const backgrounds = urlImports('background', brand.backgroundFiles);
  return [
    ...logos.imports,
    ...backgrounds.imports,
    '',
    'export const logoUrls = {',
    ...logos.entries,
    '};',
    '',
    'export const backgroundUrls = {',
    ...backgrounds.entries,
    '};',
    '',
    `export default ${JSON.stringify(brand.tokens)};`,
    '',
  ].join('\n');
}

/**
 * A `?url` import per file and the object entries that map each key to it.
 *
 * @param prefix - The local name's prefix, such as `logo`.
 * @param files - Key to absolute file.
 */
function urlImports(
  prefix: string,
  files: Readonly<Record<string, string>>,
): { imports: string[]; entries: string[] } {
  const list = Object.entries(files);
  return {
    imports: list.map(
      ([, file], index) =>
        `import ${prefix}${index} from ${JSON.stringify(`${normalizePath(file)}?url`)};`,
    ),
    entries: list.map(([key], index) => `  ${JSON.stringify(key)}: ${prefix}${index},`),
  };
}

/**
 * Generates `virtual:deck/brand.css`: Tailwind v4 (theme, preflight, utilities) scanning only the
 * given folders, the brand's Tailwind theme, its `@font-face` rules and its custom properties.
 *
 * @param brand - The loaded brand.
 * @param sources - Absolute folders Tailwind scans for class names: the deck, the kit, the brand.
 * @returns CSS for `@tailwindcss/vite` to compile.
 */
export function brandCssCode(brand: LoadedBrand, sources: readonly string[]): string {
  const { compiled } = brand;
  return [
    '@layer theme, base, components, utilities;',
    `@import ${JSON.stringify(TAILWIND_CSS.theme)} layer(theme);`,
    `@import ${JSON.stringify(TAILWIND_CSS.preflight)} layer(base);`,
    `@import ${JSON.stringify(TAILWIND_CSS.utilities)} layer(utilities) source(none);`,
    ...sources.map((source) => `@source ${JSON.stringify(normalizePath(source))};`),
    '',
    compiled.tailwind,
    '',
    compiled.fontFaces,
    '',
    compiled.css,
    '',
  ].join('\n');
}

/**
 * The absolute path of a file Tailwind ships, with forward slashes.
 *
 * @param specifier - The file's specifier, such as `tailwindcss/theme.css`.
 */
function tailwindFile(specifier: string): string {
  return normalizePath(fileURLToPath(import.meta.resolve(specifier)));
}
