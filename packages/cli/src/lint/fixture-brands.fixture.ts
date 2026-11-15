import { Context, Effect, FileSystem, Layer } from 'effect';
import nodeFs from 'node:fs';
import path from 'node:path';

import { FIXTURE_WORKSPACE } from '#lint/lint.fixtures.ts';

/**
 * Scratch workspaces live inside this package so `@deckster/engine` resolves from them.
 */
const SCRATCH_ROOT = path.resolve(import.meta.dirname, '../../.tmp-workspaces');

/**
 * The logo every fixture brand that has one uses.
 */
const LOGO_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="8" fill="#4f6ffa"/></svg>\n';

/**
 * A brand that holds its accent, positive and negative only to the 3:1 large text and marks need
 * (about 4.2:1, 3.4:1 and 3.7:1 on white), so small text in those roles must use the derived text
 * colors. System fonts, only the default surface (the others are derived), its logo shown.
 */
const WEAK_ACCENT = {
  name: 'weak-accent',
  label: 'Weak accent',
  color: {
    palette: {
      gray: {
        0: '#ffffff',
        50: '#f5f5f6',
        200: '#dddde1',
        300: '#c4c5cc',
        600: '#565863',
        900: '#18191d',
        1000: '#000000',
      },
      blue: { 100: '#dde6ff', 300: '#93acff', 500: '#4f6ffa', 800: '#1c2f84' },
      orange: { 300: '#ffc078', 600: '#b45f00' },
      teal: { 500: '#1f9aa8' },
      red: { 500: '#e2583c' },
    },
    roles: {
      bg: 'gray.0',
      surface: 'gray.50',
      fg: 'gray.900',
      muted: 'gray.600',
      accent: 'blue.500',
      'accent-fg': 'gray.1000',
      border: 'gray.200',
      positive: 'teal.500',
      negative: 'red.500',
    },
    surfaces: { default: {} },
    data: {
      categorical: ['blue.500', 'orange.600', 'gray.900'],
      sequential: ['blue.100', 'blue.300', 'blue.500', 'blue.800'],
      diverging: ['orange.600', 'orange.300', 'gray.50', 'blue.300', 'blue.800'],
      context: 'gray.300',
    },
  },
  gradients: {},
  typography: {
    families: {
      display: { family: 'Arial', fallback: ['sans-serif'], source: { kind: 'system' } },
      body: { family: 'Arial', fallback: ['sans-serif'], source: { kind: 'system' } },
      mono: { family: 'Courier New', fallback: ['monospace'], source: { kind: 'system' } },
    },
    scale: {
      display: { family: 'display', size: 140, lineHeight: 1, tracking: -0.03, weight: 700 },
      headline: { family: 'display', size: 80, lineHeight: 1.05, tracking: -0.02, weight: 700 },
      title: { family: 'display', size: 48, lineHeight: 1.1, tracking: -0.01, weight: 600 },
      lead: { family: 'body', size: 38, lineHeight: 1.4, tracking: 0, weight: 400 },
      body: { family: 'body', size: 32, lineHeight: 1.45, tracking: 0, weight: 400 },
      small: { family: 'body', size: 24, lineHeight: 1.45, tracking: 0, weight: 400 },
      caption: { family: 'body', size: 20, lineHeight: 1.4, tracking: 0, weight: 500 },
      label: {
        family: 'body',
        size: 20,
        lineHeight: 1.2,
        tracking: 0.08,
        weight: 600,
        case: 'upper',
      },
      stat: { family: 'display', size: 160, lineHeight: 0.95, tracking: -0.04, weight: 700 },
      quote: { family: 'display', size: 60, lineHeight: 1.2, tracking: -0.01, weight: 500 },
      code: { family: 'mono', size: 26, lineHeight: 1.5, tracking: 0, weight: 400 },
    },
  },
  shape: {
    radius: { sm: 4, md: 8, lg: 16, xl: 24 },
    stroke: { hairline: 1, regular: 2, bold: 4 },
    shadow: { sm: 'none', md: 'none', lg: 'none' },
  },
  spacing: {
    scale: { '2xs': 4, xs: 8, sm: 16, md: 24, lg: 40, xl: 64, '2xl': 96, '3xl': 144 },
    margin: { x: 120, y: 100 },
    grid: { columns: 12, gutter: 32 },
  },
  logo: {
    variants: { primary: { file: 'logos/mark.svg', aspect: 1 } },
    default: 'primary',
    clearSpace: 0.5,
    placement: { corner: 'top-right', height: 40 },
  },
  icons: { set: 'lucide', strokeWidth: 1.5 },
  imagery: { treatments: { plain: { type: 'none' } }, default: 'plain' },
  chrome: {
    pageNumber: { show: true, format: '{n}', corner: 'bottom-right' },
    footer: { show: false, text: '', corner: 'top-right' },
    progress: { show: false, edge: 'bottom', thickness: 4 },
    logo: { show: true },
    skipFirst: false,
  },
  motion: {
    easings: { standard: [0.2, 0, 0, 1] },
    durations: { base: 300 },
    transition: { kind: 'fade', duration: 'base', easing: 'standard' },
  },
};

/**
 * A brand with metrics unlike the kit's: Verdana, a wide humanist sans, for every role, with body
 * text at 30 px and tighter margins, so a layout calibrated only against the kit's brands (Inter
 * and a geometric display face) shows where its limits depend on their narrow letters. The budget
 * stress test renders every layout's limit cases in it besides the kit's brands. A clear accent, so
 * contrast findings stay out of the way.
 */
const WIDE_SANS = {
  ...WEAK_ACCENT,
  name: 'wide-sans',
  label: 'Wide sans',
  color: {
    ...WEAK_ACCENT.color,
    palette: {
      ...WEAK_ACCENT.color.palette,
      blue: { 100: '#dde6ff', 300: '#93acff', 500: '#2f4fd8', 800: '#1c2f84' },
      teal: { 500: '#0f6f7a' },
      red: { 500: '#b8321a' },
    },
    roles: { ...WEAK_ACCENT.color.roles, 'accent-fg': 'gray.0' },
  },
  typography: {
    families: {
      display: { family: 'Verdana', fallback: ['sans-serif'], source: { kind: 'system' } },
      body: { family: 'Verdana', fallback: ['sans-serif'], source: { kind: 'system' } },
      mono: { family: 'Courier New', fallback: ['monospace'], source: { kind: 'system' } },
    },
    scale: {
      display: { family: 'display', size: 132, lineHeight: 1.02, tracking: -0.02, weight: 700 },
      headline: { family: 'display', size: 76, lineHeight: 1.08, tracking: -0.01, weight: 700 },
      title: { family: 'display', size: 46, lineHeight: 1.12, tracking: 0, weight: 700 },
      lead: { family: 'body', size: 36, lineHeight: 1.4, tracking: 0, weight: 400 },
      body: { family: 'body', size: 30, lineHeight: 1.45, tracking: 0, weight: 400 },
      small: { family: 'body', size: 24, lineHeight: 1.45, tracking: 0, weight: 400 },
      caption: { family: 'body', size: 21, lineHeight: 1.4, tracking: 0, weight: 400 },
      label: {
        family: 'body',
        size: 20,
        lineHeight: 1.2,
        tracking: 0.06,
        weight: 700,
        case: 'upper',
      },
      stat: { family: 'display', size: 150, lineHeight: 0.95, tracking: -0.03, weight: 700 },
      quote: { family: 'display', size: 56, lineHeight: 1.22, tracking: -0.01, weight: 400 },
      code: { family: 'mono', size: 26, lineHeight: 1.5, tracking: 0, weight: 400 },
    },
  },
  spacing: { ...WEAK_ACCENT.spacing, margin: { x: 112, y: 92 } },
};

/**
 * The roles of a dark surface over a photo in {@link LAYERED}.
 */
const DARK_ROLES = {
  bg: 'gray.900',
  surface: 'gray.800',
  fg: 'gray.0',
  muted: 'gray.300',
  accent: 'blue.300',
  'accent-fg': 'gray.900',
  border: 'gray.600',
  positive: 'teal.300',
  negative: 'red.300',
};

/**
 * A brand whose surfaces paint background layers, built on {@link WIDE_SANS}'s colors with Arial:
 * `photo`, a photo of grass under a dark tint with a mark in the bottom left corner; `raw-photo`, a
 * busy checkered photo with no tint, so text over it fails contrast; `dots`, a dotted pattern; and
 * `marked`, a large faint mark bleeding off the bottom left corner under a soft glow. Its files are
 * in `fixtures/brand-files/layered/`.
 */
const LAYERED = {
  ...WEAK_ACCENT,
  name: 'layered',
  label: 'Layered',
  color: {
    ...WIDE_SANS.color,
    palette: {
      ...WIDE_SANS.color.palette,
      gray: { ...WIDE_SANS.color.palette.gray, 800: '#2a2b31' },
      teal: { 300: '#99f6e4', 500: '#0f6f7a' },
      red: { 300: '#f87171', 500: '#b8321a' },
    },
    surfaces: {
      default: {},
      photo: {
        ...DARK_ROLES,
        background: [
          {
            type: 'image',
            file: 'backgrounds/grass.jpg',
            focal: { x: 50, y: 70 },
            tint: { color: 'gray.900', opacity: 0.85 },
          },
          {
            type: 'placed',
            file: 'backgrounds/mark.svg',
            aspect: 1,
            anchor: 'bottom-left',
            width: 72,
            offset: { x: 48, y: -40 },
          },
        ],
      },
      'raw-photo': {
        ...DARK_ROLES,
        background: [{ type: 'image', file: 'backgrounds/checker.jpg' }],
      },
      dots: {
        bg: 'gray.0',
        background: [
          { type: 'pattern', file: 'backgrounds/dots.svg', aspect: 1, tile: 24, opacity: 0.8 },
        ],
      },
      marked: {
        background: [
          { type: 'gradient', gradient: 'glow', opacity: 0.6 },
          {
            type: 'placed',
            file: 'backgrounds/mark.svg',
            aspect: 1,
            anchor: 'bottom-left',
            width: 520,
            offset: { x: -180, y: 200 },
            opacity: 0.12,
          },
        ],
      },
    },
  },
  gradients: {
    glow: {
      type: 'radial',
      at: { x: 90, y: 10 },
      stops: ['blue.100', 'gray.0'],
    },
  },
};

/**
 * The brands the scratch workspaces get, by folder name: `weak-accent`; `wide-sans`, the third
 * brand the budget stress test calibrates against; `hidden-logo`, which has a logo file and hides
 * it (`chrome.logo.show: false`), as a brand import does with a placeholder; `no-logo`, which has
 * no logo variant at all; and `layered`, whose surfaces paint background layers.
 */
export const FIXTURE_BRANDS: Readonly<Record<string, object>> = {
  'weak-accent': WEAK_ACCENT,
  'wide-sans': WIDE_SANS,
  'hidden-logo': {
    ...WEAK_ACCENT,
    name: 'hidden-logo',
    label: 'Hidden logo',
    chrome: { ...WEAK_ACCENT.chrome, logo: { show: false } },
  },
  'no-logo': {
    ...WEAK_ACCENT,
    name: 'no-logo',
    label: 'No logo',
    logo: { ...WEAK_ACCENT.logo, variants: {} },
    chrome: { ...WEAK_ACCENT.chrome, logo: { show: false } },
  },
  layered: LAYERED,
};

/**
 * Folders of files a fixture brand ships besides its logo, copied into its brand folder, by brand.
 */
const FIXTURE_BRAND_FILES: Readonly<Record<string, string>> = {
  layered: path.join(FIXTURE_WORKSPACE, 'brand-files', 'layered'),
};

/**
 * The `brand.ts` of a fixture brand.
 *
 * @param brand - One of {@link FIXTURE_BRANDS}.
 */
export function fixtureBrandSource(brand: object): string {
  return `export default ${JSON.stringify(brand, null, 2)};\n`;
}

/**
 * Writes a fixture brand's folder synchronously, for scratch workspaces made outside Effect.
 *
 * @param brandsDir - The workspace's `brands/` folder.
 * @param name - The brand's name in {@link FIXTURE_BRANDS}.
 */
export function writeFixtureBrandSync(brandsDir: string, name: string): void {
  const brand = FIXTURE_BRANDS[name];
  if (brand === undefined) {
    throw new Error(`There is no fixture brand "${name}".`);
  }

  const dir = path.join(brandsDir, name);
  nodeFs.mkdirSync(path.join(dir, 'logos'), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, 'logos', 'mark.svg'), LOGO_SVG);
  nodeFs.writeFileSync(path.join(dir, 'brand.ts'), fixtureBrandSource(brand));
  const files = FIXTURE_BRAND_FILES[name];
  if (files !== undefined) {
    nodeFs.cpSync(files, dir, { recursive: true });
  }
}

/**
 * A scratch workspace with copies of fixture decks and every brand of {@link FIXTURE_BRANDS},
 * removed when its layer's scope closes.
 */
export class BrandScratch extends Context.Service<BrandScratch, { readonly root: string }>()(
  'test/BrandScratch',
) {
  /**
   * A scratch workspace holding the given fixture decks.
   *
   * @param decks - Fixture deck folder names to copy.
   */
  static readonly withDecks = (decks: readonly string[]) =>
    Layer.effect(
      BrandScratch,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        yield* fs.makeDirectory(SCRATCH_ROOT, { recursive: true });
        const root = yield* fs.makeTempDirectoryScoped({
          directory: SCRATCH_ROOT,
          prefix: 'brands-',
        });
        for (const deck of decks) {
          yield* fs.copy(
            path.join(FIXTURE_WORKSPACE, 'decks', deck),
            path.join(root, 'decks', deck),
          );
        }

        for (const [name, brand] of Object.entries(FIXTURE_BRANDS)) {
          const dir = path.join(root, 'brands', name);
          yield* fs.makeDirectory(path.join(dir, 'logos'), { recursive: true });
          yield* fs.writeFileString(path.join(dir, 'logos', 'mark.svg'), LOGO_SVG);
          yield* fs.writeFileString(path.join(dir, 'brand.ts'), fixtureBrandSource(brand));
          const files = FIXTURE_BRAND_FILES[name];
          if (files !== undefined) {
            yield* fs.copy(files, dir);
          }
        }

        return BrandScratch.of({ root });
      }),
    );
}
