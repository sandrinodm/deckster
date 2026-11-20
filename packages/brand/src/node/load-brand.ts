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
import { forgetLoaded, gatedLoad, isCodeHeld, rememberLoaded } from '#node/code-gate.ts';
import { resolveFontFiles, type FontPackageOptions } from '#node/font-files.ts';
import { FRAMEWORK_ROOT } from '#node/framework-root.ts';
import {
  BRAND_CALLEE,
  LAYOUTS_CALLEE,
  readStaticModule,
  type StaticCallee,
} from '#node/static-module.ts';
import { recoverTurnsForBrand } from '#node/turn-guard.ts';
import { resolveBrand, type LayoutsSource } from '#resolve/resolve-brand.ts';
import { DEFAULT_BRAND } from '#schema/brand-schema.ts';
import { LAYOUTS_FILE } from '#schema/layout-schema.ts';
import { isSafeName, SAFE_NAME_RULE } from '#schema/safe-name.ts';
import { brandError, type BrandError, type BrandProblem } from '#validate/brand-error.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * The fix for a brand file whose default export is missing or cannot be read.
 */
const SHAPE_FIX =
  'Export the brand as `export default defineBrand({ ... })` from "@deckster/brand".';

/**
 * The fix for a layouts file whose default export is missing or cannot be read.
 */
const LAYOUTS_SHAPE_FIX =
  'Export the layouts as `export default defineBrandLayouts([ ... ])` from "@deckster/brand".';

/**
 * The summary of every failure to import a brand file.
 */
const UNREADABLE_SUMMARY = 'Could not read the brand';

/**
 * The summary of every failure to import a layouts file.
 */
const UNREADABLE_LAYOUTS_SUMMARY = 'Could not read the layouts';

/**
 * What differs between reading `brand.ts` and `layouts.ts`: the one function the file may call, the
 * messages, and the shape of its default export.
 */
type ModuleKind = {
  /**
   * The function the default export may be wrapped in.
   */
  callee: StaticCallee;

  /**
   * The summary of a failure to read the file.
   */
  summary: string;

  /**
   * The fix for a file with no usable default export.
   */
  shapeFix: string;

  /**
   * What the file holds, for messages: `the brand` or `the layouts`.
   */
  noun: string;

  /**
   * Whether a default export has the right shape.
   */
  accepts: (value: unknown) => boolean;
};

/**
 * Reading `brand.ts`.
 */
const BRAND_MODULE: ModuleKind = {
  /**
   * The function a brand file wraps its literal in.
   */
  callee: BRAND_CALLEE,

  /**
   * The summary of a failure to read the brand file.
   */
  summary: UNREADABLE_SUMMARY,

  /**
   * The fix for a brand file with no usable default export.
   */
  shapeFix: SHAPE_FIX,

  /**
   * What the file holds.
   */
  noun: 'the brand',

  /**
   * A brand is an object.
   */
  accepts: Predicate.isObject,
};

/**
 * Reading `layouts.ts`, whose default export is a list.
 */
const LAYOUTS_MODULE: ModuleKind = {
  /**
   * The function a layouts file wraps its list in.
   */
  callee: LAYOUTS_CALLEE,

  /**
   * The summary of a failure to read the layouts file.
   */
  summary: UNREADABLE_LAYOUTS_SUMMARY,

  /**
   * The fix for a layouts file with no usable default export.
   */
  shapeFix: LAYOUTS_SHAPE_FIX,

  /**
   * What the file holds.
   */
  noun: 'the layouts',

  /**
   * The layouts are a list.
   */
  accepts: Array.isArray,
};

/**
 * How {@link loadBrand} reads a brand file: `import` runs it, as a brand in the workspace is run;
 * `data` reads it as a plain data literal without running it, and fails when it is more than that,
 * for a brand fetched from elsewhere that has not been installed yet.
 */
export type BrandRead = 'import' | 'data';

/**
 * Options for {@link loadBrand}.
 */
export type LoadBrandOptions =
  | {
      /**
       * How to read the brand file; `import` by default.
       */
      read?: BrandRead;
      fontPackages?: never;
    }
  | {
      read: 'data';

      /**
       * How to resolve Fontsource packages when validating a staged import.
       */
      fontPackages: FontPackageOptions;
    };

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
   * Fontsource packages that a staged import must install before the brand can render.
   */
  missingFontPackages: readonly string[];

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
   * The absolute path of the brand's `layouts.ts`, or `undefined` when it has none.
   */
  layoutsFile: string | undefined;

  /**
   * Findings that do not stop the build, such as waived contrast or fonts with no files.
   */
  warnings: readonly BrandProblem[];
};

/**
 * Loads `brands/<name>/brand.ts`, validates it, finds its fonts, logos and background files, and
 * compiles it. The brand file is imported fresh whenever it changes on disk; files it imports are
 * not. A sibling `layouts.ts` is always read as data. A workspace without `brands/default` gets the
 * framework's default brand.
 *
 * @param workspaceRoot - The absolute workspace root (the folder with `brands/`).
 * @param name - The brand folder name.
 * @param options - How to read the brand file.
 * @throws BrandError in the error channel, naming the brand file, each problem's field and its fix:
 *   a brand that does not exist (with the brands that do), fails to import (or, read as data, is
 *   more than a data literal), fails validation, has a `name` that differs from its folder, or
 *   names fonts or logo files that cannot be found.
 */
export const loadBrand = Effect.fn('loadBrand')(function* (
  workspaceRoot: string,
  name: string,
  options: LoadBrandOptions = {},
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

  const read = options.read ?? 'import';
  const exported = yield* loadBrandModule(location, read);
  const layouts = yield* loadLayouts(location, read);
  const resolved = yield* resolveBrand(
    exported,
    { source: location.displayPath, file: location.file },
    layouts?.source,
  );
  const { tokens } = resolved;
  const fontPackages = read === 'data' ? options.fontPackages : undefined;
  const fonts = yield* resolveFontFiles(tokens.typography, location, fontPackages);
  const logos = yield* resolveLogoFiles(tokens, location);
  const backgrounds = yield* resolveBackgroundFiles(tokens, location);
  const problems = [
    ...nameProblems(tokens, location),
    ...fonts.problems,
    ...logos.problems,
    ...backgrounds.problems,
  ];
  const layoutProblems = problems.filter(inLayouts);
  const brandProblems = problems.filter((problem) => !inLayouts(problem));
  if (brandProblems.length > 0) {
    return yield* failure(location, 'The brand cannot be loaded', brandProblems);
  }

  if (layoutProblems.length > 0 && layouts !== undefined) {
    return yield* failure(layouts.location, 'The layouts cannot be loaded', layoutProblems);
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
    missingFontPackages: fonts.missingPackages,
    compiled,
    logoFiles: logos.files,
    backgroundFiles: backgrounds.files,
    layoutsFile: layouts?.location.file,
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
    const brands = yield* availableBrands(workspaceRoot);
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

  const brands = yield* availableBrands(workspaceRoot);
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
 * The brands a deck in the workspace can name: the workspace's own, plus the framework's built-in
 * `default`, which `locateBrand` falls back to when the workspace has no `brands/default` (an
 * installed CLI's workspace usually has none).
 *
 * @param workspaceRoot - The absolute workspace root.
 * @returns Brand names, sorted and without duplicates; empty only when neither exists.
 */
const availableBrands = Effect.fn('availableBrands')(function* (
  workspaceRoot: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const own = yield* listBrands(workspaceRoot);
  const hasBuiltIn = yield* fileExists(brandLocation(FRAMEWORK_ROOT, DEFAULT_BRAND).file);
  return hasBuiltIn ? [...new Set([DEFAULT_BRAND, ...own])].toSorted() : own;
});

/**
 * Reads a brand or layouts file, reporting a filesystem error against that file.
 *
 * @param location - The file to read.
 * @param kind - Which file it is.
 */
const readModuleText = Effect.fn('readModuleText')(function* (
  location: BrandLocation,
  kind: ModuleKind,
): Effect.fn.Return<string, BrandError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(location.file)
    .pipe(
      Effect.mapError((error) =>
        failure(location, kind.summary, [
          { path: '', message: error.message, fix: `Fix that error. ${kind.shapeFix}` },
        ]),
      ),
    );
});

/**
 * Gets the default export of `brand.ts` by importing it or reading it as data.
 *
 * @param location - The brand file to load.
 * @param read - Whether to import the file or read it as a data literal.
 */
const loadBrandModule = Effect.fn('loadBrandModule')(function* (
  location: BrandLocation,
  read: BrandRead,
): Effect.fn.Return<object, BrandError, FileSystem.FileSystem> {
  const kind = BRAND_MODULE;
  const text = yield* readModuleText(location, kind);
  if (read === 'data') {
    return yield* readModuleData(location, text, kind);
  }

  const gate = gatedLoad(location.file, text, kind.callee);
  if (gate.kind === 'held') {
    return yield* failure(location, kind.summary, [
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
          failure(location, kind.summary, [
            {
              path: '',
              message:
                'Importing it failed: ' + (error instanceof Error ? error.message : String(error)),
              fix: `Fix that error. ${kind.shapeFix}`,
            },
          ]),
      });
  const exported = Predicate.isObjectOrArray(module) ? Reflect.get(module, 'default') : undefined;
  const value = yield* moduleValue(location, exported, kind);
  rememberLoaded(location.file, value);
  return value;
});

/**
 * Reads a brand's `brand.ts` or `layouts.ts` as a data literal, without running it.
 *
 * @param location - The file's location.
 * @param text - The file's content.
 * @param kind - Which file it is.
 * @throws BrandError in the error channel when the file is more than `export default <callee>(...)`
 *   around a literal, or the literal has the wrong shape.
 */
const readModuleData = Effect.fn('readModuleData')(function* (
  location: BrandLocation,
  text: string,
  kind: ModuleKind,
): Effect.fn.Return<object, BrandError> {
  const read = readStaticModule(text, kind.callee);
  if (!read.ok) {
    return yield* failure(location, kind.summary, [
      {
        path: '',
        message: `${capitalized(kind.noun)} is read as data without running it, so it must be plain data. ${read.reason}`,
        fix:
          `Write ${kind.noun} as \`export default ${kind.callee.name}(...)\` around a plain ` +
          'literal: no variables, function calls, spreads or imports besides ' +
          `${kind.callee.name}.`,
      },
    ]);
  }

  return yield* moduleValue(location, read.value, kind);
});

/**
 * Checks the shape of a module's default export, or reports that it is missing or unusable.
 *
 * @param location - The file's location.
 * @param value - The export, or `undefined` when there is none.
 * @param kind - Which file it is.
 */
const moduleValue = Effect.fn('moduleValue')(function* (
  location: BrandLocation,
  value: unknown,
  kind: ModuleKind,
): Effect.fn.Return<object, BrandError> {
  if (typeof value === 'object' && value !== null && kind.accepts(value)) {
    return value;
  }

  return yield* failure(location, kind.summary, [
    {
      path: '',
      message: `The file has no default export with ${kind.noun}.`,
      fix: kind.shapeFix,
    },
  ]);
});

/**
 * A text with its first letter in upper case.
 *
 * @param text - Any text.
 */
function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A brand's `layouts.ts`: where it is and what it exports.
 */
type LoadedLayouts = {
  /**
   * Where the layouts file is, shaped like a brand location so errors can name it.
   */
  location: BrandLocation;

  /**
   * What {@link resolveBrand} takes for the layouts.
   */
  source: LayoutsSource;
};

/**
 * Reads the brand's `layouts.ts` as data. During a turn, the code gate only serves vouched data or
 * the last loaded value. An unvouched file with no last loaded value is left out.
 *
 * @param location - The brand.
 * @param read - Whether the brand is being loaded for use or checked in a staging folder.
 * @returns The layouts file, or `undefined` when the brand has none.
 */
const loadLayouts = Effect.fn('loadLayouts')(function* (
  location: BrandLocation,
  read: BrandRead,
): Effect.fn.Return<LoadedLayouts | undefined, BrandError, FileSystem.FileSystem> {
  const file = path.join(location.dir, LAYOUTS_FILE);
  if (!(yield* fileExists(file))) {
    forgetLoaded(file);
    return undefined;
  }

  const layoutsLocation: BrandLocation = {
    ...location,
    file,
    displayPath: `${BRANDS_DIR}/${location.name}/${LAYOUTS_FILE}`,
  };
  const text = yield* readModuleText(layoutsLocation, LAYOUTS_MODULE);
  const gate = gatedLoad(file, text, LAYOUTS_CALLEE);
  if (gate.kind === 'held') {
    return undefined;
  }

  const input = yield* gate.kind === 'value'
    ? moduleValue(layoutsLocation, gate.value, LAYOUTS_MODULE)
    : readModuleData(layoutsLocation, text, LAYOUTS_MODULE);
  if (read === 'import') {
    rememberLoaded(file, input);
  }

  return {
    location: layoutsLocation,
    source: { input, source: layoutsLocation.displayPath, file },
  };
});

/**
 * Whether a problem is about a layout, by its path.
 *
 * @param problem - A problem found while loading.
 */
function inLayouts(problem: BrandProblem): boolean {
  return problem.path.startsWith('layouts[');
}

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
