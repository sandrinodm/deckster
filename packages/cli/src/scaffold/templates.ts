import type { LayoutExample } from '@deckster/engine/layout';

import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';

import { exampleMdx } from '#layouts/list-layouts.ts';
import { titleFromName } from '#scaffold/names.ts';

/**
 * The dependency range every scaffolded dependency uses: the workspace catalog in
 * `pnpm-workspace.yaml`, so a new deck stays on the versions `decks/hello` uses.
 */
const CATALOG = 'catalog:';

/**
 * The `tsconfig.json` of a new deck, written as the formatter prints it. It matches
 * `decks/hello/tsconfig.json`.
 */
const DECK_TSCONFIG = [
  '{',
  '  "extends": "../../tsconfig.base.json",',
  '  "compilerOptions": {',
  '    "lib": ["es2023", "DOM", "DOM.Iterable"],',
  '    "jsx": "react-jsx",',
  '    "types": ["vite-plus/client"]',
  '  },',
  '  "include": ["deck.config.ts", "slides"]',
  '}',
  '',
].join('\n');

/**
 * Spaces of indentation in the generated `package.json`.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The brand a new deck names unless `--brand` says otherwise.
 */
export const DEFAULT_BRAND_NAME = 'default';

/**
 * What the files of a new deck are written from.
 */
export type DeckTemplate = {
  /**
   * The deck folder name.
   */
  id: string;

  /**
   * The deck title, which is also the cover's title.
   */
  title: string;

  /**
   * The brand folder the config names.
   */
  brand: string;

  /**
   * The talk length for the config, such as `20m`; left out of the config when absent.
   */
  duration?: string;

  /**
   * The `title` layout contract's example, which the cover starts from.
   */
  cover: LayoutExample;
};

/**
 * The files of a new deck, by path relative to the deck folder. They follow the workspace's
 * conventions: dependencies from the catalog, Vite+ client types, and sources the formatter leaves
 * as they are. A published CLI's workspace is a plain folder without a package manager of its own,
 * so a deck there is just its config and slides; `deck types` writes the one `tsconfig.json` an
 * editor needs.
 *
 * @param template - The deck's name, title, brand, duration and cover example.
 * @param installed - Whether the CLI is a published copy; defaults to the running one.
 */
export function deckFiles(
  template: DeckTemplate,
  installed: boolean = FRAMEWORK_INSTALLED,
): Record<string, string> {
  const packageJson = {
    name: `@deckster/deck-${template.id}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: { '@deckster/engine': 'workspace:*', react: CATALOG },
    devDependencies: {
      '@types/mdx': CATALOG,
      '@types/react': CATALOG,
      typescript: CATALOG,
      'vite-plus': CATALOG,
    },
  };
  return {
    ...(installed
      ? {}
      : {
          'package.json': `${JSON.stringify(packageJson, null, JSON_INDENT_SPACES)}\n`,
          'tsconfig.json': DECK_TSCONFIG,
        }),
    'deck.config.ts': deckConfig({
      title: template.title,
      brand: template.brand,
      ...(template.duration === undefined ? {} : { duration: template.duration }),
      slides: ['title'],
    }),
    'slides/title.mdx': coverSource(template.title, template.cover),
  };
}

/**
 * What goes in a `deck.config.ts`.
 */
export type DeckConfigTemplate = {
  /**
   * The deck title.
   */
  title: string;

  /**
   * The brand folder name.
   */
  brand: string;

  /**
   * The talk length, such as `20m`.
   */
  duration?: string;

  /**
   * The slide ids, in order.
   */
  slides: readonly string[];
};

/**
 * The `deck.config.ts` of a new deck.
 *
 * @param template - The title, brand, optional duration and slide ids.
 */
export function deckConfig(template: DeckConfigTemplate): string {
  const ids = template.slides.map((slide) => `'${slide}'`).join(', ');
  return [
    "import { defineDeck } from '@deckster/engine/config';",
    '',
    'export default defineDeck({',
    `  title: ${singleQuoted(template.title)},`,
    `  brand: ${singleQuoted(template.brand)},`,
    ...(template.duration === undefined ? [] : [`  duration: ${singleQuoted(template.duration)},`]),
    `  slides: [${ids}],`,
    '});',
    '',
  ].join('\n');
}

/**
 * The cover example's fields that describe the example's own talk, left out of a new deck.
 */
const PERSONAL_FIELDS = new Set(['eyebrow', 'byline', 'date']);

/**
 * The deck's first slide: the `title` layout's example with the deck's own title. The example's
 * eyebrow, byline and date are somebody else's, so they stay out, and so does its subtitle.
 *
 * @param title - The deck title.
 * @param example - The `title` layout contract's example.
 */
function coverSource(title: string, example: LayoutExample): string {
  const kept = Object.fromEntries(
    Object.entries(example.frontmatter).filter(([field]) => !PERSONAL_FIELDS.has(field)),
  );
  const body = [
    'One sentence that says what this talk is for.',
    '',
    '<Notes>',
    'Say what the audience should do or believe when the talk ends.',
    '</Notes>',
  ].join('\n');
  return exampleMdx({ layout: 'title', ...kept, title }, body, example.comments);
}

/**
 * The title for a slide created from its id.
 *
 * @param id - The slide id.
 */
export function slideTitle(id: string): string {
  return titleFromName(id);
}

/**
 * A string literal in single quotes, as the formatter writes them: `It's` becomes `'It\\'s'`.
 *
 * @param text - Any text, including quotes, backslashes and line breaks.
 */
function singleQuoted(text: string): string {
  const escaped = JSON.stringify(text).slice(1, -1).replaceAll('\\"', '"').replaceAll("'", "\\'");
  return `'${escaped}'`;
}
