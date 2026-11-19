import type { DeckBuildError } from '@deckster/vite-plugin';
import type { PlatformError } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import {
  brandError,
  isSafeName,
  resolveBrand,
  SAFE_NAME_RULE,
  type BrandError,
  type BrandTokens,
} from '@deckster/brand';
import {
  BRAND_CALLEE,
  BRAND_FILE,
  BRANDS_DIR,
  brandLocation,
  fileExists,
  loadBrand,
  readStaticModule,
  type LoadedBrand,
} from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { Effect, FileSystem, Predicate, type Scope } from 'effect';
import os from 'node:os';
import path from 'node:path';

import { planBrandFiles, type SkippedFile } from '#brand-add/brand-files.ts';
import { parseBrandSource } from '#brand-add/brand-source.ts';
import { fetchBrand, type FetchedBrand, type GitProtocol } from '#brand-add/fetch-brand.ts';
import {
  catalogPackages,
  fontsourcePackages,
  remoteFontPackages,
  type FontPackage,
} from '#brand-add/font-packages.ts';
import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';
import {
  brandProblemWithFile,
  checkCatalogLayouts,
  layoutsDisplayPath,
  type BrandFileProblem,
} from '#layouts/check-brand-layouts.ts';

/**
 * The prefix of a brand package's name in the repository checkout: `@deckster/brand-acme`.
 */
const PACKAGE_PREFIX = '@deckster/brand-';

/**
 * The `tsconfig.json` of a brand in the repository checkout, as the other brands have it.
 */
const BRAND_TSCONFIG = [
  '{',
  '  "extends": "../../tsconfig.base.json",',
  `  "include": ["${BRAND_FILE}"]`,
  '}',
  '',
].join('\n');

/**
 * The fix for a file operation that failed for no reason the author can see.
 */
const RETRY_FIX = 'Try again.';

/**
 * Spaces of indentation in a written `package.json`.
 */
const JSON_INDENT_SPACES = 2;

/**
 * What `deck brand add` is asked to do.
 */
export type AddBrandRequest = {
  /**
   * The brand source as written, such as `gh:acme/brand-kit/brands/acme#v2`.
   */
  source: string;

  /**
   * Whether to replace a brand of the same name that the workspace already has.
   */
  force: boolean;

  /**
   * Whether the CLI is a published copy. The repository checkout makes each brand a workspace
   * package with its own `package.json`; a published CLI's workspace has none.
   */
  installed: boolean;

  /**
   * The protocols git may use; https and ssh by default (`NETWORK_PROTOCOLS`). Tests add `file`.
   */
  protocols?: readonly GitProtocol[];
};

/**
 * A font package the added brand uses.
 */
export type AddedFont = FontPackage & {
  /**
   * Whether it already resolves from the brand folder.
   */
  installed: boolean;
};

/**
 * What `deck brand add` did.
 */
export type AddedBrand = {
  /**
   * The brand name, which is its folder under `brands/`.
   */
  brand: string;

  /**
   * The brand folder relative to the workspace: `brands/acme`.
   */
  dir: string;

  /**
   * The source as written.
   */
  source: string;

  /**
   * The full commit the files come from.
   */
  commit: string;

  /**
   * Whether a brand of the same name was replaced.
   */
  replaced: boolean;

  /**
   * The files copied from the source, relative to the brand folder.
   */
  files: readonly string[];

  /**
   * The files written for this workspace, such as `package.json`.
   */
  written: readonly string[];

  /**
   * The source's files that were left out, and why.
   */
  skipped: readonly SkippedFile[];

  /**
   * The Fontsource packages the brand uses.
   */
  fonts: readonly AddedFont[];

  /**
   * Findings that do not stop the brand from loading.
   */
  warnings: readonly BrandFileProblem[];

  /**
   * The commands to run before decks can use the brand, in order.
   */
  next: readonly string[];
};

/**
 * Everything the brand files say about the brand before they are copied.
 */
type ReadBrand = {
  /**
   * The brand name, from its `name` field.
   */
  name: string;

  /**
   * The resolved tokens.
   */
  tokens: BrandTokens;
};

/**
 * Fetches a brand folder from a git repository and adds it to the workspace as `brands/<name>`,
 * named by the brand's own `name`. `brand.ts` is read as data and never run, and the brand is
 * validated in a temporary folder before anything is written; only its data, images, fonts and
 * documents are copied (see `planBrandFiles`). In the repository checkout the brand also gets a
 * `package.json` and `tsconfig.json` like the other brands. Fontsource packages are not installed;
 * the result names the command that installs them.
 *
 * @param root - The workspace root.
 * @param request - The source, whether to replace an existing brand, and the CLI's kind.
 * @returns What was added and what to run next.
 * @throws CliError in the error channel when the source is not valid, cannot be fetched, is not a
 *   brand folder, is code rather than data, or names a brand the workspace already has (without
 *   `force`); BrandError when the brand fails validation; DeckBuildError when the layout catalog
 *   cannot load; FileSystemError when it cannot be written.
 */
export const addBrand = Effect.fn('addBrand')(function* (
  root: string,
  request: AddBrandRequest,
): Effect.fn.Return<
  AddedBrand,
  CliError | BrandError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  return yield* Effect.scoped(addBrandScoped(root, request));
});

/**
 * {@link addBrand}, with the temporary folder in the scope.
 *
 * @param root - The workspace root.
 * @param request - What to add.
 */
const addBrandScoped = Effect.fn('addBrandScoped')(function* (
  root: string,
  request: AddBrandRequest,
): Effect.fn.Return<
  AddedBrand,
  CliError | BrandError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const source = yield* parseBrandSource(request.source);
  const temporary = yield* makeTemporaryFolder();
  const checkout = yield* makeFolder(path.join(temporary, 'checkout'));
  const fetched = yield* fetchBrand(source, checkout, request.protocols);
  const plan = yield* planBrandFiles(fetched.files, request.source);
  const brand = yield* readBrand(fetched);
  const target = brandLocation(root, brand.name);
  const exists = yield* checkTarget(target.dir, brand.name, request);

  const remoteFonts = yield* remoteFontPackages(
    fontsourcePackages(brand.tokens),
    fetched.dir,
    fetched.checkout,
  );
  const stageRoot = path.join(temporary, 'stage');
  const stageDir = brandLocation(stageRoot, brand.name).dir;
  yield* copyFiles(fetched.dir, stageDir, plan.copy);
  const dependencies = request.installed
    ? new Map<string, string>()
    : yield* checkoutFontDependencies(root, remoteFonts);
  const written = request.installed
    ? []
    : yield* writePackageFiles(stageDir, brand.name, dependencies);
  const staged = yield* loadBrand(stageRoot, brand.name, {
    read: 'data',
    fontPackages: {
      // The new brand has no private node_modules, even when it replaces another brand.
      fromDir: path.dirname(target.dir),
      allowMissing: new Set(remoteFonts.map((font) => font.name)),
    },
  });
  const warnings = yield* checkStagedLayouts(staged);
  yield* placeBrand(stageDir, target.dir, path.join(temporary, 'replaced'));

  const missing = new Set(staged.missingFontPackages);
  const fonts = remoteFonts.map((font) => ({ ...font, installed: !missing.has(font.name) }));
  return {
    brand: brand.name,
    dir: `${BRANDS_DIR}/${brand.name}`,
    source: request.source,
    commit: fetched.commit,
    replaced: exists,
    files: plan.copy,
    written,
    skipped: plan.skipped,
    fonts,
    warnings,
    next: nextSteps(brand.name, fonts, request.installed ? undefined : dependencies),
  };
});

/**
 * Whether the workspace already has a brand of that name, which only `force` may replace.
 *
 * @param dir - The brand folder in the workspace.
 * @param name - The brand name.
 * @param request - The source and `force`.
 * @returns Whether the folder exists.
 * @throws CliError in the error channel when it exists and `force` is not set.
 */
const checkTarget = Effect.fn('checkTarget')(function* (
  dir: string,
  name: string,
  request: AddBrandRequest,
): Effect.fn.Return<boolean, CliError, FileSystem.FileSystem> {
  const exists = yield* fileExists(dir);
  if (exists && !request.force) {
    return yield* cliError(
      `The workspace already has ${BRANDS_DIR}/${name}/.\n` +
        `Pass --force to replace it with the brand from ${request.source}.`,
    );
  }

  return exists;
});

/**
 * Reads the fetched `brand.ts` as data and resolves it, so its name is known and checked before it
 * names a folder.
 *
 * @param fetched - The fetched brand.
 * @throws CliError in the error channel when `brand.ts` is more than data or its name is not a
 *   folder name; BrandError when it fails validation.
 */
const readBrand = Effect.fn('readBrand')(function* (
  fetched: FetchedBrand,
): Effect.fn.Return<ReadBrand, CliError | BrandError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const file = path.join(fetched.dir, BRAND_FILE);
  const text = yield* fs
    .readFileString(file)
    .pipe(Effect.mapError(() => cliError(`Could not read the fetched ${BRAND_FILE}.`)));
  const read = readStaticModule(text, BRAND_CALLEE);
  if (!read.ok) {
    return yield* cliError(
      `The fetched ${BRAND_FILE} is not plain data, so deck will not add it: a brand from a ` +
        `repository is read without running it. ${read.reason}\n` +
        'Ask its authors to write it as `export default defineBrand({ ... })` around a literal.',
    );
  }

  const name = Predicate.isObject(read.value) ? Reflect.get(read.value, 'name') : undefined;
  if (typeof name !== 'string' || !isSafeName(name)) {
    return yield* cliError(
      `The fetched ${BRAND_FILE} has no \`name\` that can be a brand folder name ` +
        `(${SAFE_NAME_RULE}), so deck cannot tell which folder under ${BRANDS_DIR}/ it belongs in.`,
    );
  }

  const displayPath = `${BRANDS_DIR}/${name}/${BRAND_FILE}`;
  const { tokens } = yield* resolveBrand(read.value, { source: displayPath, file });
  return { name, tokens };
});

/**
 * Checks the staged brand against the deck catalog and attaches the source file to each warning.
 *
 * @param brand - The staged brand, with its files checked and layouts resolved from data.
 * @throws BrandError in the error channel when its layouts do not fit the catalog.
 */
const checkStagedLayouts = Effect.fn('checkStagedLayouts')(function* (
  brand: LoadedBrand,
): Effect.fn.Return<BrandFileProblem[], BrandError | DeckBuildError> {
  const file = brand.location.displayPath;
  const layoutsFile = layoutsDisplayPath(file);
  const check = yield* checkCatalogLayouts(brand.tokens.layouts);
  if (check.errors.length > 0) {
    return yield* brandError({
      summary: 'Invalid brand layouts',
      source: layoutsFile,
      file: brand.layoutsFile,
      problems: check.errors,
    });
  }

  return [...brand.warnings, ...check.warnings].map((warning) =>
    brandProblemWithFile(warning, { file, layoutsFile }),
  );
});

/**
 * Copies the planned files of the fetched brand into a folder.
 *
 * @param fromDir - The fetched brand folder.
 * @param toDir - The folder to create.
 * @param files - The paths to copy, relative to the brand folder.
 */
const copyFiles = Effect.fn('copyFiles')(function* (
  fromDir: string,
  toDir: string,
  files: readonly string[],
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  for (const file of files) {
    const to = path.join(toDir, file);
    yield* makeFolder(path.dirname(to));
    yield* fs
      .copyFile(path.join(fromDir, file), to)
      .pipe(Effect.mapError((error) => fileSystemError('copy', to, error, RETRY_FIX)));
  }
});

/**
 * Picks the Fontsource dependencies to put in the brand's checkout manifest. A package must be in
 * the workspace catalog or have a supported version in the fetched brand's manifest.
 *
 * @param root - The workspace root, whose catalog is read.
 * @param fonts - The brand's font packages.
 */
const checkoutFontDependencies = Effect.fn('checkoutFontDependencies')(function* (
  root: string,
  fonts: readonly FontPackage[],
): Effect.fn.Return<ReadonlyMap<string, string>, never, FileSystem.FileSystem> {
  const catalog = yield* catalogPackages(root);
  const entries = fonts.flatMap((font) => {
    const version = catalog.has(font.name) ? 'catalog:' : font.version;
    return version === undefined ? [] : [[font.name, version] as const];
  });
  return new Map(entries);
});

/**
 * Writes the `package.json` and `tsconfig.json` a brand has in the repository checkout.
 *
 * @param stageDir - The staged brand folder.
 * @param name - The brand name.
 * @param fontDependencies - Fontsource dependencies and their version specifiers.
 * @returns The files written, relative to the brand folder.
 */
const writePackageFiles = Effect.fn('writePackageFiles')(function* (
  stageDir: string,
  name: string,
  fontDependencies: ReadonlyMap<string, string>,
): Effect.fn.Return<string[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const manifest = {
    name: `${PACKAGE_PREFIX}${name}`,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: { typecheck: 'tsc --noEmit' },
    dependencies: Object.fromEntries(
      [['@deckster/brand', 'workspace:*'] as const, ...fontDependencies].toSorted(([a], [b]) =>
        a.localeCompare(b),
      ),
    ),
    devDependencies: { typescript: 'catalog:' },
  };
  const files = {
    'package.json': `${JSON.stringify(manifest, null, JSON_INDENT_SPACES)}\n`,
    'tsconfig.json': BRAND_TSCONFIG,
  };
  for (const [file, text] of Object.entries(files)) {
    const to = path.join(stageDir, file);
    yield* fs
      .writeFileString(to, text)
      .pipe(Effect.mapError((error) => fileSystemError('write', to, error, RETRY_FIX)));
  }

  return Object.keys(files);
});

/**
 * Moves the staged brand into the workspace. A brand already there is set aside first and put back
 * if the copy fails, so a failed replace leaves the old brand as it was. The staged folder is
 * copied, not renamed, because the temporary folder may be on another file system.
 *
 * @param stageDir - The staged brand folder.
 * @param target - The brand folder in the workspace.
 * @param aside - A temporary path to keep the replaced brand at.
 */
const placeBrand = Effect.fn('placeBrand')(function* (
  stageDir: string,
  target: string,
  aside: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  /**
   * The error for a failed step of the move.
   *
   * @param action - What the step tried, such as `set aside`.
   * @param file - The folder it acted on.
   */
  const failed = (action: string, file: string) => (error: PlatformError.PlatformError) =>
    fileSystemError(action, file, error, 'Check the folder, then try again.');
  const replacing = yield* fileExists(target);
  if (replacing) {
    yield* fs.copy(target, aside).pipe(Effect.mapError(failed('set aside', target)));
    yield* fs.remove(target, { recursive: true }).pipe(Effect.mapError(failed('replace', target)));
  }

  yield* makeFolder(path.dirname(target));
  const restore = replacing
    ? fs
        .remove(target, { recursive: true })
        .pipe(Effect.andThen(fs.copy(aside, target)), Effect.ignore)
    : fs.remove(target, { recursive: true }).pipe(Effect.ignore);
  yield* fs.copy(stageDir, target).pipe(
    Effect.mapError(failed('write', target)),
    Effect.tapError(() => restore),
  );
});

/**
 * The commands to run before decks can use the added brand. A checkout links the new brand package
 * with `pnpm install` and adds missing fonts without a version from the source or catalog. A
 * published CLI's workspace installs missing fonts with `npm install`. Then `deck brand check`.
 *
 * @param name - The brand name.
 * @param fonts - Its font packages.
 * @param dependencies - The dependencies already written for a checkout, if applicable.
 */
function nextSteps(
  name: string,
  fonts: readonly AddedFont[],
  dependencies: ReadonlyMap<string, string> | undefined,
): string[] {
  const check = `${deckCommand()} brand check ${name}`;
  const missing = fonts.filter((font) => !font.installed);
  if (dependencies !== undefined) {
    const unlisted = missing.filter((font) => !dependencies.has(font.name));
    const install = ['pnpm install'];
    if (unlisted.length > 0) {
      install.push(
        `pnpm --filter ${PACKAGE_PREFIX}${name} add ${unlisted.map((font) => font.name).join(' ')}`,
      );
    }

    return [...install, check];
  }

  if (missing.length === 0) {
    return [check];
  }

  const packages = missing.map((font) =>
    font.version === undefined ? font.name : `${font.name}@${font.version}`,
  );
  return [`npm install ${packages.join(' ')}`, check];
}

/**
 * Creates a temporary folder that is deleted when the scope closes. Its name is its real path.
 */
const makeTemporaryFolder = Effect.fn('makeTemporaryFolder')(function* (): Effect.fn.Return<
  string,
  FileSystemError,
  FileSystem.FileSystem | Scope.Scope
> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.makeTempDirectoryScoped({ prefix: 'deck-brand-add-' }).pipe(
    Effect.flatMap((dir) => fs.realPath(dir)),
    Effect.mapError((error) =>
      fileSystemError('create a temporary folder in', os.tmpdir(), error, 'Free some disk space.'),
    ),
  );
});

/**
 * Creates a folder and its parents.
 *
 * @param dir - The absolute folder.
 * @returns The folder.
 */
const makeFolder = Effect.fn('makeFolder')(function* (
  dir: string,
): Effect.fn.Return<string, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .makeDirectory(dir, { recursive: true })
    .pipe(Effect.mapError((error) => fileSystemError('create', dir, error, RETRY_FIX)));
  return dir;
});
