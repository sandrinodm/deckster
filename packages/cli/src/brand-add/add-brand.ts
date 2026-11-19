import type { ChildProcessSpawner } from 'effect/process';

import {
  brandError,
  isSafeName,
  resolveBrand,
  SAFE_NAME_RULE,
  type BrandError,
  type BrandProblem,
  type BrandTokens,
} from '@deckster/brand';
import {
  BRAND_CALLEE,
  BRAND_FILE,
  BRANDS_DIR,
  brandLocation,
  loadBrand,
  readStaticModule,
  resolveFontFiles,
} from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { Effect, FileSystem, Predicate, type Scope } from 'effect';
import os from 'node:os';
import path from 'node:path';

import type { BrandSource } from '#brand-add/brand-source.ts';

import { planBrandFiles, type SkippedFile } from '#brand-add/brand-files.ts';
import { fetchBrand, type FetchedBrand, type GitProtocol } from '#brand-add/fetch-brand.ts';
import {
  catalogPackages,
  fontsourcePackages,
  isMissingFontPackage,
  remoteFontPackages,
  type FontPackage,
} from '#brand-add/font-packages.ts';
import { installBrand } from '#brand-add/install-brand.ts';
import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';

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
   * The source accepted by `parseBrandSource`.
   */
  source: BrandSource;

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
   * The validated source in the author's chosen syntax.
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
  warnings: readonly BrandProblem[];

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

  /**
   * What resolving the tokens found that does not stop the brand, such as a waived contrast.
   */
  warnings: readonly BrandProblem[];
};

/**
 * Fetches a brand folder from a git repository and adds it to the workspace as `brands/<name>`,
 * named by the brand's own `name`. `brand.ts` is read as data and never run, and the brand is
 * validated in a staging folder before it is installed; only its data, images, fonts and documents
 * are copied (see `planBrandFiles`). In the repository checkout the brand also gets a
 * `package.json` and `tsconfig.json` like the other brands. Fontsource packages are not installed;
 * the result names the command that installs them.
 *
 * @param root - The workspace root.
 * @param request - The source, whether to replace an existing brand, and the CLI's kind.
 * @returns What was added and what to run next.
 * @throws CliError in the error channel when the source cannot be fetched, is not a brand folder,
 *   is code rather than data, or names a brand the workspace already has (without `force`);
 *   BrandError when the brand fails validation; FileSystemError when it cannot be written.
 */
export const addBrand = Effect.fn('addBrand')(function* (
  root: string,
  request: AddBrandRequest,
): Effect.fn.Return<
  AddedBrand,
  CliError | BrandError | FileSystemError,
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
  CliError | BrandError | FileSystemError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner | Scope.Scope
> {
  const { source } = request;
  const temporary = yield* makeTemporaryFolder();
  const checkout = yield* makeFolder(path.join(temporary, 'checkout'));
  const fetched = yield* fetchBrand(source, checkout, request.protocols);
  const plan = yield* planBrandFiles(fetched.files, source.display);
  const brand = yield* readBrand(fetched);
  const remoteFonts = yield* remoteFontPackages(
    fontsourcePackages(brand.tokens),
    fetched.dir,
    fetched.checkout,
  );
  const installOptions = { source: source.display, force: request.force };
  const { prepared, replaced } = yield* installBrand(
    root,
    brand.name,
    installOptions,
    (stageRoot) =>
      Effect.gen(function* () {
        const stageDir = brandLocation(stageRoot, brand.name).dir;
        yield* copyFiles(fetched.dir, stageDir, plan.copy);
        const written = request.installed
          ? []
          : yield* writePackageFiles(root, stageDir, brand.name, remoteFonts);
        const warnings = yield* validateStaged(stageRoot, brand);
        return { written, warnings };
      }),
  );

  const fonts = yield* checkFonts(root, brand, remoteFonts);
  return {
    brand: brand.name,
    dir: `${BRANDS_DIR}/${brand.name}`,
    source: source.display,
    commit: fetched.commit,
    replaced,
    files: plan.copy,
    written: prepared.written,
    skipped: plan.skipped,
    fonts,
    warnings: prepared.warnings,
    next: nextSteps(brand.name, fonts, request.installed),
  };
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
  const { tokens, warnings } = yield* resolveBrand(read.value, { source: displayPath, file });
  return { name, tokens, warnings };
});

/**
 * Loads the staged brand as data, the way decks will load it, and returns its warnings. Problems
 * that installing a font package fixes are left for the next steps; the load stops at them, so the
 * warnings are then the tokens' own, and `deck brand check` after the install checks the rest (the
 * layouts and the compiled CSS).
 *
 * @param stageRoot - The temporary workspace that holds the staged brand.
 * @param brand - The brand, with the warnings its tokens resolved with.
 * @throws BrandError in the error channel with every other problem.
 */
const validateStaged = Effect.fn('validateStaged')(function* (
  stageRoot: string,
  brand: ReadBrand,
): Effect.fn.Return<readonly BrandProblem[], BrandError, FileSystem.FileSystem> {
  return yield* loadBrand(stageRoot, brand.name, { read: 'data' }).pipe(
    Effect.map((loaded) => loaded.warnings),
    Effect.catchTag('BrandError', (error) => {
      const problems = error.problems.filter((problem) => !isMissingFontPackage(problem));
      return problems.length === 0
        ? Effect.succeed(brand.warnings)
        : Effect.fail(brandError({ summary: error.summary, source: error.source, problems }));
    }),
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
 * Writes the `package.json` and `tsconfig.json` a brand has in the repository checkout. Each
 * Fontsource package uses the workspace catalog when it lists the package, else the version the
 * brand's repository gives; a package with neither is left out, and the font check names it.
 *
 * @param root - The workspace root, whose catalog is read.
 * @param stageDir - The staged brand folder.
 * @param name - The brand name.
 * @param fonts - The brand's font packages.
 * @returns The files written, relative to the brand folder.
 */
const writePackageFiles = Effect.fn('writePackageFiles')(function* (
  root: string,
  stageDir: string,
  name: string,
  fonts: readonly FontPackage[],
): Effect.fn.Return<string[], FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const catalog = yield* catalogPackages(root);
  const fontDependencies = fonts.flatMap((font) => {
    const version = catalog.has(font.name) ? 'catalog:' : font.version;
    return version === undefined ? [] : [[font.name, version] as const];
  });
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
 * Which of the brand's font packages already resolve from its folder in the workspace.
 *
 * @param root - The workspace root.
 * @param brand - The brand.
 * @param fonts - Its font packages, with versions.
 */
const checkFonts = Effect.fn('checkFonts')(function* (
  root: string,
  brand: ReadBrand,
  fonts: readonly FontPackage[],
): Effect.fn.Return<AddedFont[], never, FileSystem.FileSystem> {
  const resolved = yield* resolveFontFiles(
    brand.tokens.typography,
    brandLocation(root, brand.name),
  );
  const missing = resolved.problems.filter(isMissingFontPackage).map((problem) => problem.message);
  return fonts.map((font) => ({
    ...font,
    installed: !missing.some((message) => message.startsWith(`${font.name} `)),
  }));
});

/**
 * The commands to run before decks can use the added brand: in the repository checkout, `pnpm
 * install` links the new brand package (and installs its fonts); in a published CLI's workspace,
 * `npm install` adds the fonts that do not resolve yet. Then `deck brand check`.
 *
 * @param name - The brand name.
 * @param fonts - Its font packages.
 * @param installed - Whether the CLI is a published copy.
 */
function nextSteps(name: string, fonts: readonly AddedFont[], installed: boolean): string[] {
  const check = `${deckCommand()} brand check ${name}`;
  if (!installed) {
    return ['pnpm install', check];
  }

  const missing = fonts.filter((font) => !font.installed);
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
