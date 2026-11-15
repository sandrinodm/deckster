import { Effect, FileSystem, Option, Predicate } from 'effect';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { FontFaceRule } from '#compile/font-face.ts';
import type { BrandTokens } from '#resolve/brand-tokens.ts';

import { compileBrand, type CompiledBrand } from '#compile/compile-brand.ts';
import { assetProblem, IMAGE_EXTENSIONS } from '#node/asset-files.ts';
import { resolveBackgroundFiles } from '#node/background-files.ts';
import {
  BRANDS_DIR,
  brandLocation,
  fileExists,
  listBrands,
  type BrandLocation,
} from '#node/brand-paths.ts';
import { gatedLoad, isCodeHeld, rememberLoaded } from '#node/code-gate.ts';
import { resolveFontFiles } from '#node/font-files.ts';
import { BRAND_CALLEE } from '#node/static-module.ts';
import { recoverTurnsForBrand } from '#node/turn-guard.ts';
import { resolveBrand } from '#resolve/resolve-brand.ts';
import { DEFAULT_BRAND } from '#schema/brand-schema.ts';
import { isSafeName, SAFE_NAME_RULE } from '#schema/safe-name.ts';
import { brandError, type BrandError, type BrandProblem } from '#validate/brand-error.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * The fix for a brand file whose default export is missing or cannot be read.
 */
const SHAPE_FIX =
  'Export the brand as `export default defineBrand({ ... })` from "@deckster/brand".';

/**
 * The summary of every failure to import a brand file.
 */
const UNREADABLE_SUMMARY = 'Could not read the brand';

/**
 * The framework's own workspace, whose `brands/default` is used by workspaces that have no
 * `brands/default` of their own, such as a fresh project or a test workspace.
 */
const FRAMEWORK_ROOT = path.resolve(import.meta.dirname, '../../../..');

/**
 * A brand that passed every check, compiled and ready to serve.
 */
export type LoadedBrand = {
  /**
   * Where the brand lives on disk.
   */
  location: BrandLocation;

  /**
   * The brand's resolved tokens.
   */
  tokens: BrandTokens;

  /**
   * `@font-face` rules whose URLs are absolute file paths.
   */
  fontFaces: readonly FontFaceRule[];

  /**
   * The brand compiled to CSS, a Tailwind theme, `@font-face` rules and Shiki themes.
   */
  compiled: CompiledBrand;

  /**
   * Absolute path of each logo variant's file.
   */
  logoFiles: Readonly<Record<string, string>>;

  /**
   * Absolute path of each background layer file, keyed by the path the brand writes, such as
   * `backgrounds/paper.jpg`.
   */
  backgroundFiles: Readonly<Record<string, string>>;

  /**
   * Findings that do not stop the build, such as waived contrast or fonts with no files.
   */
  warnings: readonly BrandProblem[];
};

/**
 * Loads `brands/<name>/brand.ts`, validates it, finds its fonts, logos and background files, and
 * compiles it. The brand file is imported fresh whenever it changes on disk; files it imports are
 * not. A workspace without `brands/default` gets the framework's default brand.
 *
 * @param workspaceRoot - The absolute workspace root (the folder with `brands/`).
 * @param name - The brand folder name.
 * @throws BrandError in the error channel, naming the brand file, each problem's field and its fix:
 *   a brand that does not exist (with the brands that do), fails to import, fails validation, has a
 *   `name` that differs from its folder, or names fonts or logo files that cannot be found.
 */
export const loadBrand = Effect.fn('loadBrand')(function* (
  workspaceRoot: string,
  name: string,
): Effect.fn.Return<LoadedBrand, BrandError, FileSystem.FileSystem> {
  const location = yield* locateBrand(workspaceRoot, name);
  yield* assertExists(workspaceRoot, location);
  if (!isCodeHeld(location.file)) {
    // A turn a crash left unfinished on a deck that renders with this brand is finished first.
    yield* recoverTurnsForBrand(workspaceRoot, location.name).pipe(
      Effect.mapError((error) =>
        failure(location, UNREADABLE_SUMMARY, [
          {
            path: '',
            message: error.message.split('\n')[0] ?? error.message,
            fix: error.message.split('\n').slice(1).join(' '),
          },
        ]),
      ),
    );
  }

  const exported = yield* importBrand(location);
  const resolved = yield* resolveBrand(exported, {
    source: location.displayPath,
    file: location.file,
  });
  const { tokens } = resolved;
  const fonts = yield* resolveFontFiles(tokens.typography, location);
  const logos = yield* resolveLogoFiles(tokens, location);
  const backgrounds = yield* resolveBackgroundFiles(tokens, location);
  const problems = [
    ...nameProblems(tokens, location),
    ...fonts.problems,
    ...logos.problems,
    ...backgrounds.problems,
  ];
  if (problems.length > 0) {
    return yield* failure(location, 'The brand cannot be loaded', problems);
  }

  const compiled = yield* Effect.try({
    try: () => compileBrand(tokens, fonts.faces),
    catch: (error) =>
      failure(location, 'The brand cannot be compiled', [
        {
          path: '',
          message:
            'Writing its CSS failed: ' + (error instanceof Error ? error.message : String(error)),
          fix:
            'Look for an unusual font file name, family name or number in the brand; if it ' +
            'looks fine, report it, since the brand checks should have named it.',
        },
      ]),
  });
  return {
    location,
    tokens,
    fontFaces: fonts.faces,
    compiled,
    logoFiles: logos.files,
    backgroundFiles: backgrounds.files,
    warnings: [...resolved.warnings, ...fonts.warnings, ...backgrounds.warnings],
  };
});

/**
 * The workspace's brand, or the framework's default brand when the workspace has none. The name is
 * checked first, so a name such as `../decks/x/evil` never reaches the import of a `brand.ts`.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param name - The brand folder name.
 * @throws BrandError in the error channel when the name is not a kebab-case folder name.
 */
const locateBrand = Effect.fn('locateBrand')(function* (
  workspaceRoot: string,
  name: string,
): Effect.fn.Return<BrandLocation, BrandError, FileSystem.FileSystem> {
  if (!isSafeName(name)) {
    const brands = yield* listBrands(workspaceRoot);
    return yield* brandError({
      summary: 'Invalid brand name',
      source: `${BRANDS_DIR}/`,
      problems: [
        {
          path: '',
          message:
            `"${name}" is not a brand folder name: a brand is named by its folder under ` +
            `${BRANDS_DIR}/, in ${SAFE_NAME_RULE}.`,
          fix:
            `Name the folder, not a path, such as "${DEFAULT_BRAND}". ` +
            pickFrom(name, brands, 'brand'),
        },
      ],
    });
  }

  const location = brandLocation(workspaceRoot, name);
  if (name !== DEFAULT_BRAND || (yield* fileExists(location.file))) {
    return location;
  }

  const builtIn = brandLocation(FRAMEWORK_ROOT, name);
  return (yield* fileExists(builtIn.file)) ? builtIn : location;
});

/**
 * Fails with the brands that do exist when the brand file is missing.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param location - The brand to check.
 */
const assertExists = Effect.fn('assertExists')(function* (
  workspaceRoot: string,
  location: BrandLocation,
): Effect.fn.Return<void, BrandError, FileSystem.FileSystem> {
  if (yield* fileExists(location.file)) {
    return;
  }

  const brands = yield* listBrands(workspaceRoot);
  const create = `create ${location.displayPath}`;
  const fix =
    brands.length === 0
      ? `No brands exist yet; ${create}.`
      : `${pickFrom(location.name, brands, 'brand')} Or ${create}.`;
  return yield* failure(location, 'No such brand', [
    { path: '', message: `There is no ${location.displayPath}.`, fix },
  ]);
});

/**
 * Imports the brand file and returns its default export, which must be an object.
 *
 * @param location - The brand to import.
 */
const importBrand = Effect.fn('importBrand')(function* (
  location: BrandLocation,
): Effect.fn.Return<object, BrandError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(location.file)
    .pipe(
      Effect.mapError((error) =>
        failure(location, UNREADABLE_SUMMARY, [
          { path: '', message: error.message, fix: `Fix that error. ${SHAPE_FIX}` },
        ]),
      ),
    );
  const gate = gatedLoad(location.file, text, BRAND_CALLEE);
  if (gate.kind === 'held') {
    return yield* failure(location, UNREADABLE_SUMMARY, [
      {
        path: '',
        message:
          'An agent turn on a deck that uses this brand is in flight, so it is not loaded until the turn ends.',
        fix: 'Wait for the turn to end; the brand is loaded again then.',
      },
    ]);
  }

  const url = yield* versionedUrl(location);
  const module = yield* gate.kind === 'value'
    ? Effect.succeed({ default: gate.value })
    : Effect.tryPromise({
        try: (): Promise<unknown> => import(/* @vite-ignore */ url),
        catch: (error) =>
          failure(location, UNREADABLE_SUMMARY, [
            {
              path: '',
              message:
                'Importing it failed: ' + (error instanceof Error ? error.message : String(error)),
              fix: `Fix that error. ${SHAPE_FIX}`,
            },
          ]),
      });
  const exported = Predicate.isObjectOrArray(module) ? Reflect.get(module, 'default') : undefined;
  if (!Predicate.isObject(exported)) {
    return yield* failure(location, UNREADABLE_SUMMARY, [
      { path: '', message: 'The file has no default export with the brand.', fix: SHAPE_FIX },
    ]);
  }

  rememberLoaded(location.file, exported);
  return exported;
});

/**
 * The brand file's URL with its modification time, which makes Node import an edited brand again.
 *
 * @param location - The brand to import.
 */
const versionedUrl = Effect.fn('versionedUrl')(function* (
  location: BrandLocation,
): Effect.fn.Return<string, BrandError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const info = yield* fs.stat(location.file).pipe(
    Effect.mapError((error) =>
      failure(location, UNREADABLE_SUMMARY, [
        {
          path: '',
          message: `It changed or disappeared while it was being read: ${error.message}`,
          fix: 'Save the brand file again, or restore it, then retry.',
        },
      ]),
    ),
  );
  const mtimeMs = Option.match(info.mtime, { onNone: () => 0, onSome: (date) => date.getTime() });
  return `${pathToFileURL(location.file).href}?mtime=${mtimeMs}`;
});

/**
 * A problem when the brand's `name` differs from its folder name.
 *
 * @param tokens - The resolved tokens.
 * @param location - Where the brand lives.
 */
function nameProblems(tokens: BrandTokens, location: BrandLocation): BrandProblem[] {
  if (tokens.name === location.name) {
    return [];
  }

  return [
    {
      path: 'name',
      message: `The brand is named "${tokens.name}" but lives in ${BRANDS_DIR}/${location.name}/.`,
      fix:
        `Set \`name: "${location.name}"\`, or rename the folder to ` +
        `${BRANDS_DIR}/${tokens.name}/.`,
    },
  ];
}

/**
 * The absolute file of each logo variant, and a problem for each one that does not exist.
 *
 * @param tokens - The resolved tokens.
 * @param location - Where the brand lives; logo paths are relative to its folder.
 */
const resolveLogoFiles = Effect.fn('resolveLogoFiles')(function* (
  tokens: BrandTokens,
  location: BrandLocation,
): Effect.fn.Return<
  { files: Record<string, string>; problems: BrandProblem[] },
  never,
  FileSystem.FileSystem
> {
  const entries = yield* Effect.forEach(
    Object.entries(tokens.logo.variants),
    ([variant, logo]) => {
      const file = path.resolve(location.dir, logo.file);
      const check = {
        file,
        root: location.dir,
        rootName: `${BRANDS_DIR}/${location.name}/`,
        written: logo.file,
        extensions: IMAGE_EXTENSIONS,
      };
      return Effect.map(assetProblem(check), (problem) => ({ variant, file, problem }));
    },
    // A brand has a handful of logo variants.
    { concurrency: 'unbounded' },
  );
  const problems = entries.flatMap((entry) =>
    entry.problem === undefined
      ? []
      : [
          {
            path: `logo.variants.${entry.variant}.file`,
            message: entry.problem,
            fix:
              'Put the logo itself (an SVG, PNG or WebP, not a link to a file elsewhere) in the ' +
              'brand folder, usually logos/, or fix the path.',
          },
        ],
  );
  const files = Object.fromEntries(entries.map((entry) => [entry.variant, entry.file]));
  return { files, problems };
});

/**
 * The error for a brand that cannot be loaded, naming its file.
 *
 * @param location - Where the brand lives.
 * @param summary - What went wrong overall.
 * @param problems - Every problem found.
 */
function failure(
  location: BrandLocation,
  summary: string,
  problems: readonly BrandProblem[],
): BrandError {
  return brandError({ summary, source: location.displayPath, file: location.file, problems });
}
