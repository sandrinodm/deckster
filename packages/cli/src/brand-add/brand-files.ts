import { LAYOUTS_FILE } from '@deckster/brand';
import { BACKGROUND_EXTENSIONS, BRAND_FILE, FONT_EXTENSIONS } from '@deckster/brand/node';
import { Effect } from 'effect';
import path from 'node:path';

import type { FetchedFile } from '#brand-add/fetch-brand.ts';

import { codeLayoutNames } from '#brand-add/deckster-source.ts';
import { cliError, type CliError } from '#cli-error.ts';

/**
 * The most files a fetched brand may copy.
 */
export const MAX_BRAND_FILES = 500;

/**
 * Bytes in a mebibyte.
 */
const BYTES_PER_MIB = 1024 * 1024;

/**
 * The most mebibytes a fetched brand may copy in all.
 */
const MAX_BRAND_MIB = 50;

/**
 * The most bytes a fetched brand may copy in all.
 */
export const MAX_BRAND_BYTES = MAX_BRAND_MIB * BYTES_PER_MIB;

/**
 * The extensions of the documents a brand may carry besides its assets: its README, licences and
 * notes such as the brand-import skill's `import-notes.json`.
 */
const DOCUMENT_EXTENSIONS: readonly string[] = ['md', 'txt', 'json'];

/**
 * Every extension a copied file may have.
 */
const COPIED_EXTENSIONS = new Set([
  ...BACKGROUND_EXTENSIONS,
  ...FONT_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
]);

/**
 * Files without an extension that are copied: a font's or brand's licence and notices.
 */
const LICENCE_NAMES = new Set(['LICENSE', 'LICENCE', 'NOTICE', 'COPYING', 'OFL']);

/**
 * Extensions of code and stylesheets, which a brand never brings: its `brand.ts` is read as data.
 */
const CODE_EXTENSIONS = new Set(['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'css']);

/**
 * The brand's own modules, which are copied and read as data: `brand.ts` and `layouts.ts`.
 */
const BRAND_MODULES = new Set([BRAND_FILE, LAYOUTS_FILE]);

/**
 * File names, in lower case, that configure a package, a package manager or TypeScript. They are
 * never copied, at any depth and in any case: a case-insensitive file system would take
 * `Package.JSON` for `package.json`. `deckster brand add` writes the ones this workspace needs.
 */
const PACKAGE_FILE_NAMES = new Set([
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'tsconfig.json',
  'jsconfig.json',
  'deno.json',
  'deno.jsonc',
  'bunfig.toml',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

/**
 * Why a file of the fetched brand is not copied.
 */
export type SkipReason =
  | 'symlink'
  | 'package file'
  | 'code'
  | 'code layout'
  | 'not a brand file'
  | 'hidden';

/**
 * A file of the fetched brand that is not copied, and why.
 */
export type SkippedFile = {
  /**
   * The path inside the brand folder.
   */
  path: string;

  /**
   * Why it is left out.
   */
  reason: SkipReason;
};

/**
 * The folder of a brand that holds its layouts, data and code.
 */
const LAYOUTS_FOLDER = 'layouts';

/**
 * Which files of a fetched brand are copied.
 */
export type BrandFilePlan = {
  /**
   * The paths inside the brand folder to copy, `brand.ts` among them.
   */
  copy: readonly string[];

  /**
   * The files left out.
   */
  skipped: readonly SkippedFile[];
};

/**
 * Picks the files of a fetched brand to copy: `brand.ts` and `layouts.ts` (which the loader reads
 * as data), images, fonts, documents and licences. Symbolic links, hidden files, package files, any
 * other code and any other file type are left out, so a brand brings only data and assets into the
 * workspace. Everything inside the folder of a code layout (`layouts/<name>/` with a `contract.ts`
 * or `layout.tsx`) is left out with its code, as `code layout`: a folder with only its README and
 * images is an incomplete layout that `brand check` rejects.
 *
 * @param files - The files git lists under the brand folder.
 * @param source - The source as written, for messages.
 * @returns The files to copy and the files left out.
 * @throws CliError in the error channel when the folder has no `brand.ts`, or the files to copy
 *   exceed {@link MAX_BRAND_FILES} or {@link MAX_BRAND_BYTES}.
 */
export const planBrandFiles = Effect.fn('planBrandFiles')(function* (
  files: readonly FetchedFile[],
  source: string,
): Effect.fn.Return<BrandFilePlan, CliError> {
  const copy: FetchedFile[] = [];
  const skipped: SkippedFile[] = [];
  for (const file of files) {
    const reason = skipReason(file);
    if (reason === undefined) {
      copy.push(file);
    } else {
      skipped.push({ path: file.path, reason });
    }
  }

  const layoutFolders = new Set(codeLayoutNames(skipped));
  const kept = copy.filter((file) => {
    if (!isInsideCodeLayout(file.path, layoutFolders)) {
      return true;
    }

    skipped.push({ path: file.path, reason: 'code layout' });
    return false;
  });
  if (!kept.some((file) => file.path === BRAND_FILE)) {
    return yield* cliError(
      `${source} has no ${BRAND_FILE}, so it is not a brand folder.\n` +
        `Point at the folder that holds ${BRAND_FILE}, such as gh:owner/repo/brands/<name>.`,
    );
  }

  yield* checkLimits(kept, source);
  return { copy: kept.map((file) => file.path), skipped };
});

/**
 * Whether a file lies inside the folder of one of the code layouts.
 *
 * @param file - The path inside the brand folder.
 * @param layouts - The names of the code layouts found in the brand.
 */
function isInsideCodeLayout(file: string, layouts: ReadonlySet<string>): boolean {
  const [folder, name, ...rest] = file.split('/');
  return folder === LAYOUTS_FOLDER && name !== undefined && rest.length > 0 && layouts.has(name);
}

/**
 * Why a file is not copied, or `undefined` when it is.
 *
 * @param file - The file.
 */
function skipReason(file: FetchedFile): SkipReason | undefined {
  if (file.symlink) {
    return 'symlink';
  }

  const segments = file.path.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) {
    return 'hidden';
  }

  const name = segments.at(-1) ?? '';
  if (PACKAGE_FILE_NAMES.has(name.toLowerCase())) {
    return 'package file';
  }

  if (BRAND_MODULES.has(file.path)) {
    return undefined;
  }

  const extension = path.extname(name).slice(1).toLowerCase();
  if (extension === '' && LICENCE_NAMES.has(name.toUpperCase())) {
    return undefined;
  }

  if (COPIED_EXTENSIONS.has(extension)) {
    return undefined;
  }

  return CODE_EXTENSIONS.has(extension) ? 'code' : 'not a brand file';
}

/**
 * Fails when the files to copy are too many or too large.
 *
 * @param files - The files to copy.
 * @param source - The source as written, for messages.
 */
const checkLimits = Effect.fn('checkLimits')(function* (
  files: readonly FetchedFile[],
  source: string,
): Effect.fn.Return<void, CliError> {
  const bytes = files.reduce((total, file) => total + file.bytes, 0);
  if (files.length > MAX_BRAND_FILES || bytes > MAX_BRAND_BYTES) {
    return yield* cliError(
      `${source} has ${files.length} brand files (${Math.ceil(bytes / BYTES_PER_MIB)} MiB); a ` +
        `brand may bring at most ${MAX_BRAND_FILES} files and ${MAX_BRAND_MIB} MiB.\n` +
        'Point at the brand folder itself, not a folder above it.',
    );
  }
});
