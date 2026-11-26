import type { BrandError } from '@deckster/brand';
import type { LoadedBrand } from '@deckster/brand/node';

import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import {
  BRAND_CODE_SOURCE_PREFIX,
  COMPONENT_FILE,
  CONTRACT_FILE,
  deckCatalog,
  type DeckBuildError,
  type DeckLocation,
} from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, type CliError, type FileSystemError } from '#cli-error.ts';
import {
  checkDeckLayoutsFree,
  checkWriteTargets,
  displayPath,
  existingEntries,
  findOwnerFolder,
} from '#layouts/eject/eject-owner.ts';
import { LIMITS_FILE } from '#layouts/layout-limits.ts';
import { BRAND_SOURCE_PREFIX } from '#layouts/list-layouts.ts';
import { createNewDirectory, writeNewFiles } from '#scaffold/write-files.ts';

/**
 * The stylesheet a new layout's component imports.
 */
export const STYLESHEET_FILE = 'layout.css';

/**
 * The longest title of a new layout, in characters: two lines at the title size in the kit's
 * brands, as for the kit's `content` layout.
 */
const TITLE_MAX_CHARS = 60;

/**
 * The words a new layout's body holds.
 */
const BODY_MAX_WORDS = 60;

/**
 * The bullets a new layout's body holds.
 */
const BODY_MAX_BULLETS = 5;

/**
 * The line width of the repository's formatter, which the scaffold's files are written to.
 */
const MAX_LINE_CHARS = 100;

/**
 * The class of the element that holds a new layout's body; the stylesheet keys it on the layout.
 */
const BODY_CLASS = 'layout-body';

/**
 * What {@link createLayout} wrote.
 */
export type CreatedLayout = {
  /**
   * The layout name.
   */
  readonly name: string;

  /**
   * The new absolute folder, `layouts/<name>/` of the brand or the deck.
   */
  readonly dir: string;

  /**
   * The absolute files written, in order: `contract.ts`, `layout.tsx`, `layout.css`, `limits.ts`.
   */
  readonly files: readonly string[];
};

/**
 * What a layout name may not be, because something the deck or brand can use already has it.
 */
type TakenName = {
  /**
   * What has the name, as the end of "is already ...".
   */
  readonly what: string;

  /**
   * Whether a code layout may take the name with `replaces: true`: an engine or kit layout.
   */
  readonly replaceable: boolean;
};

/**
 * The files of a new code layout, by file name: a contract with one `body` slot, a title, an
 * eyebrow, a description, an example and a PowerPoint mapping whose title placeholder is the
 * header's `.kit-title`; a component drawn with `Frame`, `SlideHeader` and `Region` from
 * `@deckster/kit/layout-parts`; its stylesheet, in the kit's cascade layers; and one limit case,
 * the body at its budget. The files pass `deckster layouts check` and `deckster brand check` as
 * they are, and are written as the repository's formatter prints them.
 *
 * @param name - The layout name, a safe kebab-case name (`isSafeName`).
 * @returns The content of each file, by file name.
 */
export function layoutFiles(name: string): Readonly<Record<string, string>> {
  return {
    [CONTRACT_FILE]: contractSource(name),
    [COMPONENT_FILE]: componentSource(name),
    [STYLESHEET_FILE]: stylesheetSource(name),
    [LIMITS_FILE]: limitsSource(),
  };
}

/**
 * Writes a new code layout into a brand's or a deck's `layouts/<name>/`. The name must be a safe
 * kebab-case name that no folder there has yet and that no layout the brand or the deck can use
 * already has: an engine or kit layout, a data layout of the brand, or, for a deck, a code layout
 * of its brand; for a brand, no deck of the brand may have a layout folder of that name either. The
 * brand or deck must be the workspace's own, not the framework's built-in `default` brand, and no
 * link may lie on the way to the folder. Nothing is written when a check fails; the folder and its
 * files are created new, and a write that fails midway removes the folder again.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck to add it to.
 * @param name - The layout name.
 * @returns The folder and the files written.
 * @throws CliError in the error channel for a bad or taken name, an existing folder (in any letter
 *   case), a deck layout of the brand with the name, a link on the way or a brand outside the
 *   workspace; BrandError when the brand does not load; DeckBuildError when the deck does not
 *   exist, its config does not load or the brand's data layouts do not fit; FileSystemError when a
 *   file cannot be written.
 */
export const createLayout = Effect.fn('createLayout')(function* (
  root: string,
  owner: LayoutsOwner,
  name: string,
): Effect.fn.Return<
  CreatedLayout,
  BrandError | CliError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem
> {
  if (!isSafeName(name)) {
    return yield* cliError(
      `"${name}" is not a layout name: a layout is named by its folder, in ${SAFE_NAME_RULE}.\n` +
        'Pick a name such as `kpi-wall`.',
    );
  }

  const folder = yield* findOwnerFolder(root, owner);
  const { brand, deck } = folder;
  const dir = path.join(folder.layoutsDir, name);
  const existing = (yield* existingEntries(folder.layoutsDir, [name])).get(name);
  if (existing !== undefined) {
    return yield* cliError(
      `${displayPath(root, path.join(folder.layoutsDir, existing))}/ already exists.\n` +
        `Pick another name, or edit the files in it and run \`${deckCommand()} layouts check ${name} ` +
        `--${owner.kind} ${owner.name}\`.`,
    );
  }

  const taken = yield* takenName(root, brand, deck, name);
  if (taken !== undefined) {
    const replace = taken.replaceable
      ? ' To replace the kit layout on purpose instead, write the folder yourself with a contract ' +
        "that says `replaces: true` and keeps what the kit layout's slides use; `deckster layouts " +
        'check` checks that.'
      : '';
    return yield* cliError(
      `"${name}" is already ${taken.what}, so a slide naming it would not get the new layout.\n` +
        `Pick another name, such as "${owner.name}-${name}".${replace}`,
    );
  }

  yield* checkDeckLayoutsFree(root, folder, [name]);
  yield* checkWriteTargets(root, folder, [dir]);
  const files = Object.fromEntries(
    Object.entries(layoutFiles(name)).map(([file, content]) => [path.join(dir, file), content]),
  );
  return { name, dir, files: yield* writeLayoutFolder(dir, files) };
});

/**
 * Creates the layout's folder exclusively and writes its files into it, each created new; when a
 * write fails, the folder is removed again so the name stays free.
 *
 * @param dir - The new layout's folder.
 * @param files - The content of each file, by absolute path.
 * @returns The absolute paths written.
 */
const writeLayoutFolder = Effect.fn('writeLayoutFolder')(function* (
  dir: string,
  files: Readonly<Record<string, string>>,
): Effect.fn.Return<string[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* createNewDirectory(dir);
  return yield* writeNewFiles(files).pipe(
    Effect.onError(() => fs.remove(dir, { recursive: true, force: true }).pipe(Effect.ignore)),
  );
});

/**
 * What already has the name among the layouts the brand, and the deck, can use; `undefined` when
 * the name is free. No code is run: the brand's and the deck's code layouts are only listed. Every
 * data layout of the brand counts, also one the catalog leaves out because its fallback is a code
 * layout that is not loaded.
 *
 * @param root - The absolute workspace root.
 * @param brand - The brand.
 * @param deck - The deck, when the layout is the deck's.
 * @param name - The layout name.
 */
const takenName = Effect.fn('takenName')(function* (
  root: string,
  brand: LoadedBrand,
  deck: DeckLocation | undefined,
  name: string,
): Effect.fn.Return<TakenName | undefined, DeckBuildError, FileSystem.FileSystem> {
  const { index, local } = yield* deckCatalog({ root, brand, deck, code: 'skip' });
  const known = index.get(name);
  const isBrandDataLayout =
    known?.source.startsWith(BRAND_SOURCE_PREFIX) === true ||
    brand.tokens.layouts.some((layout) => layout.name === name);
  if (isBrandDataLayout) {
    return {
      what: `a layout of the ${brand.tokens.name} brand (its layouts.ts)`,
      replaceable: false,
    };
  }

  if (known !== undefined) {
    return { what: `a layout of ${known.source}`, replaceable: true };
  }

  const brandCode = `${BRAND_CODE_SOURCE_PREFIX}${brand.tokens.name}`;
  const code = local.layouts.find((layout) => layout.name === name && layout.source === brandCode);
  return code === undefined
    ? undefined
    : {
        what: `a code layout of the ${brand.tokens.name} brand (${displayPath(root, code.contractFile)})`,
        replaceable: false,
      };
});

/**
 * The `contract.ts` of a new layout.
 *
 * @param name - The layout name.
 */
function contractSource(name: string): string {
  return [
    "import { defineLayoutContract } from '@deckster/engine/layout';",
    "import { CHROME_HINT, chromeField, EYEBROW_HINT, EyebrowField } from '@deckster/kit/layout-fields';",
    "import { Schema } from 'effect';",
    '',
    '/**',
    ' * The longest title, in characters: two lines at the title size.',
    ' */',
    `const TITLE_MAX_CHARS = ${TITLE_MAX_CHARS};`,
    '',
    '/**',
    " * The layout's contract: the fields a slide sets, the slot it fills, how much fits, an example and",
    ' * the PowerPoint mapping. Contracts run in Node: import only `effect`, `@deckster/engine/layout`,',
    ' * `@deckster/engine/command`, `@deckster/kit/layout-fields`, `@deckster/brand` and `.ts` files in',
    ' * this folder or in `layouts/_shared/`.',
    ' */',
    'export default defineLayoutContract({',
    `  name: '${name}',`,
    '  description:',
    "    'A title that states the point, then a short paragraph or up to five bullets. Say here " +
      "' +",
    "    'when to pick this layout over the others.',",
    '  schema: Schema.Struct({',
    '    eyebrow: EyebrowField,',
    '    chrome: chromeField(true),',
    '  }),',
    '  hints: {',
    '    eyebrow: EYEBROW_HINT,',
    '    chrome: CHROME_HINT,',
    '  },',
    '  title: { required: true, maxChars: TITLE_MAX_CHARS },',
    '  slots: {',
    '    body: {',
    "      description: 'A short paragraph, up to five bullets, or a sentence followed by bullets.',",
    '      required: true,',
    "      accepts: ['text', 'bullets'],",
    '    },',
    '  },',
    `  budget: { body: { maxWords: ${BODY_MAX_WORDS}, maxBullets: ${BODY_MAX_BULLETS} } },`,
    '  pptx: {',
    "    type: 'content',",
    '    placeholders: [',
    "      { kind: 'title', from: { selector: '.kit-title' } },",
    "      { kind: 'body', from: { slot: 'body' } },",
    '    ],',
    '  },',
    '  example: {',
    "    frontmatter: { title: 'Every slide makes one point', eyebrow: 'How we write slides' },",
    '    body: [',
    "      'The title says the point; the body backs it up.',",
    "      '',",
    "      '- One idea per slide',",
    "      '- A title that reads as a sentence',",
    "      '- Detail in the speaker notes, not on the slide',",
    "      '',",
    "      '<Notes>Say the title first, then the three habits behind it.</Notes>',",
    "      '',",
    "    ].join('\\n'),",
    '  },',
    '});',
    '',
  ].join('\n');
}

/**
 * The `layout.tsx` of a new layout.
 *
 * @param name - The layout name.
 */
function componentSource(name: string): string {
  return [
    "import type { ReactNode } from 'react';",
    '',
    "import { defineLayout, type LayoutProps } from '@deckster/engine';",
    "import { Frame, Region, SlideHeader } from '@deckster/kit/layout-parts';",
    '',
    "import type contract from './contract.ts';",
    '',
    `import './${STYLESHEET_FILE}';`,
    '',
    '/**',
    ' * The shared header with the eyebrow and the title, then the body in a region that takes the height',
    ' * left, in an eight-column reading measure. Content taller than the region spills out of it, which',
    ' * `deckster lint` and `deckster layouts check` report.',
    ' */',
    'function Layout({ frontmatter, slots }: LayoutProps<typeof contract>): ReactNode {',
    '  return (',
    `    <Frame layout="${name}">`,
    '      <SlideHeader eyebrow={frontmatter.eyebrow} title={frontmatter.title} />',
    '      <Region>',
    '        <div className="kit-grid">',
    `          <div className="${BODY_CLASS} kit-prose">{slots.body}</div>`,
    '        </div>',
    '      </Region>',
    '    </Frame>',
    '  );',
    '}',
    '',
    '/**',
    " * The layout's component, registered under the name of its folder and its contract.",
    ' */',
    'export default defineLayout<typeof contract>({',
    `  name: '${name}',`,
    '  component: Layout,',
    '});',
    '',
  ].join('\n');
}

/**
 * The `layout.css` of a new layout.
 *
 * @param name - The layout name.
 */
function stylesheetSource(name: string): string {
  return [
    '/*',
    " * The body in the first eight of the twelve columns, the reading measure of the kit's text",
    ' * layouts. Every rule is keyed on the layout, so it styles no other slide.',
    ' */',
    '@layer theme, base, components, utilities;',
    '',
    '@layer components {',
    ...bodySelector(name),
    '    grid-column: 1 / span 8;',
    '    min-width: 0;',
    '  }',
    '}',
    '',
  ].join('\n');
}

/**
 * The selector lines of the body's rule, broken before the body's class as the formatter breaks a
 * selector longer than a line.
 *
 * @param name - The layout name.
 */
function bodySelector(name: string): string[] {
  const frame = `  .kit-frame[data-layout='${name}']`;
  const line = `${frame} .${BODY_CLASS} {`;
  return line.length <= MAX_LINE_CHARS ? [line] : [frame, `    .${BODY_CLASS} {`];
}

/**
 * The `limits.ts` of a new layout.
 */
function limitsSource(): string {
  return [
    "import type { LimitCase } from '@deckster/kit/limit-cases';",
    '',
    '/**',
    " * The slides `deckster layouts check` fills to the layout's limits. Each case is rendered with the",
    ' * title and the eyebrow at their longest and body at its word budget, as a paragraph and as a list.',
    ' * Add a case for each variant: its `frontmatter`, and in `filled` the named slots it fills besides',
    ' * body. The file runs in Node like `contract.ts`, so import types only, or the modules a contract',
    ' * may import.',
    ' */',
    "export default [{ name: 'full-body', frontmatter: {}, filled: [] }] satisfies readonly LimitCase[];",
    '',
  ].join('\n');
}
