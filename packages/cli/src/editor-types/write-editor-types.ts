import {
  FRAMEWORK_INSTALLED,
  FRAMEWORK_PACKAGES,
  FRAMEWORK_ROOT,
  frameworkEntryPoints,
  frameworkModulesDir,
} from '@deckster/brand/node';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';
import {
  EDITOR_ENV_FILE,
  envDeclarations,
  mergeTsconfig,
  USER_PACKAGES,
} from '#editor-types/editor-tsconfig.ts';
import { packagePaths } from '#editor-types/package-paths.ts';

/**
 * The file `deckster types` writes the compiler settings to, relative to the workspace root.
 */
export const TSCONFIG_FILE = 'tsconfig.json';

/**
 * The files of global declarations a deck needs, relative to the framework's `node_modules`: Node's
 * types (the framework's own source uses them), MDX modules, and the icon imports.
 */
const DECLARATION_FILES = [
  '@types/node/index.d.ts',
  '@types/mdx/index.d.ts',
  'unplugin-icons/types/react.d.ts',
];

/**
 * What `deckster types` did.
 */
export type EditorTypesResult =
  | {
      /**
       * The CLI runs from the repository, whose packages are already linked.
       */
      _tag: 'NotNeeded';
    }
  | {
      /**
       * The files were written.
       */
      _tag: 'Written';

      /**
       * The workspace's `tsconfig.json`.
       */
      tsconfig: string;

      /**
       * The declaration file.
       */
      declarations: string;

      /**
       * How many `@deckster/*` entry points the settings map.
       */
      entryPoints: number;
    };

/**
 * Makes a workspace type-checkable in an editor without installing anything in it: writes the
 * workspace's `tsconfig.json` so `@deckster/*` imports map to the framework's source files in this
 * install and every other package resolves from the framework's own dependencies, and a declaration
 * file for the global types. Settings the workspace already has are kept. The paths name this
 * install's folders, so they go stale when the CLI is upgraded or moved: run it again.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @returns What was written, or that nothing is needed in the repository checkout.
 * @throws CliError in the error channel when the existing `tsconfig.json` is not plain JSON or the
 *   framework's dependencies cannot be found; FileSystemError when a file cannot be written.
 */
export const writeEditorTypes = Effect.fn('writeEditorTypes')(function* (
  workspaceRoot: string,
): Effect.fn.Return<EditorTypesResult, CliError | FileSystemError, FileSystem.FileSystem> {
  if (!FRAMEWORK_INSTALLED) {
    return { _tag: 'NotNeeded' };
  }

  const fs = yield* FileSystem.FileSystem;
  const modules = frameworkModulesDir(FRAMEWORK_ROOT);
  if (modules === undefined) {
    return yield* cliError(
      `Could not find the framework's dependencies next to ${FRAMEWORK_ROOT}.\n` +
        'Reinstall @deckster/cli, then run `deckster types` again.',
    );
  }

  const entries = frameworkEntryPoints(FRAMEWORK_PACKAGES);
  const paths = {
    ...Object.fromEntries(entries.map(({ specifier, file }) => [specifier, [file]])),
    ...(yield* userPackagePaths(modules)),
    '*': [path.join(modules, '*'), path.join(modules, '@types', '*')],
  };
  const tsconfig = path.join(workspaceRoot, TSCONFIG_FILE);
  const existing = yield* fs.exists(tsconfig).pipe(
    Effect.flatMap((found) => (found ? fs.readFileString(tsconfig) : Effect.succeed(undefined))),
    Effect.mapError((error) =>
      fileSystemError('read', tsconfig, error, 'Check that the file is readable.'),
    ),
  );
  const declarations = path.join(workspaceRoot, EDITOR_ENV_FILE);
  for (const file of [tsconfig, declarations]) {
    if (yield* isSymbolicLink(file)) {
      return yield* cliError(
        `${file} is a symbolic link, so \`deckster types\` will not write through it.\n` +
          'Replace it with a regular file, or remove it, and run `deckster types` again.',
      );
    }
  }

  const merged = mergeTsconfig(existing, paths);
  if (merged === undefined) {
    return yield* cliError(
      `${TSCONFIG_FILE} is not plain JSON (comments or trailing commas), so \`deckster types\` will not rewrite it.\n` +
        'Remove the comments, or move the file aside and run `deckster types` again.',
    );
  }

  const present = yield* Effect.filter(
    [...DECLARATION_FILES, ...(yield* viteClientFile(modules))].map((file) =>
      path.join(modules, file),
    ),
    (file) => Effect.orElseSucceed(fs.exists(file), () => false),
  );
  yield* writeWithFolders(declarations, envDeclarations(present));
  yield* writeWithFolders(tsconfig, merged);
  return { _tag: 'Written', tsconfig, declarations, entryPoints: entries.length };
});

/**
 * Whether a path is a symbolic link, which is never written through.
 *
 * @param file - The absolute path.
 */
const isSymbolicLink = Effect.fn('isSymbolicLink')(function* (
  file: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readLink(file).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
});

/**
 * Writes a file, creating its folders.
 *
 * @param file - The absolute path.
 * @param content - The file's text.
 */
const writeWithFolders = Effect.fn('writeWithFolders')(function* (
  file: string,
  content: string,
): Effect.fn.Return<void, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(path.dirname(file), { recursive: true }).pipe(
    Effect.andThen(fs.writeFileString(file, content)),
    Effect.mapError((error) =>
      fileSystemError('write', file, error, 'Check that the workspace is writable.'),
    ),
  );
});

/**
 * The path mappings of the packages decks import: each from its `@types` package when it has one,
 * else from the package itself.
 *
 * @param modules - The framework's `node_modules` folder.
 */
const userPackagePaths = Effect.fn('userPackagePaths')(function* (
  modules: string,
): Effect.fn.Return<Record<string, string[]>, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const paths: Record<string, string[]> = {};
  for (const name of USER_PACKAGES) {
    const typed = path.join(modules, '@types', name);
    const dir = (yield* Effect.orElseSucceed(fs.exists(typed), () => false))
      ? typed
      : path.join(modules, name);
    const manifest = yield* fs.readFileString(path.join(dir, 'package.json')).pipe(
      Effect.map((text): unknown => JSON.parse(text)),
      Effect.orElseSucceed(() => undefined),
    );
    Object.assign(paths, packagePaths(name, dir, manifest));
  }

  return paths;
});

/**
 * The declaration file of Vite's client types (`import.meta.env`, asset imports), found through the
 * package's own `exports`, since the file's place inside the package is Vite's business.
 *
 * @param modules - The framework's `node_modules` folder.
 * @returns The file relative to that folder, or nothing when the package does not name one.
 */
const viteClientFile = Effect.fn('viteClientFile')(function* (
  modules: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const manifest = yield* fs.readFileString(path.join(modules, 'vite', 'package.json')).pipe(
    Effect.map((text): unknown => JSON.parse(text)),
    Effect.orElseSucceed(() => undefined),
  );
  const client = clientTypes(manifest);
  return client === undefined ? [] : [path.join('vite', client)];
});

/**
 * The `types` file of a package manifest's `./client` export.
 *
 * @param manifest - The parsed `package.json`.
 */
function clientTypes(manifest: unknown): string | undefined {
  if (typeof manifest !== 'object' || manifest === null || !('exports' in manifest)) {
    return undefined;
  }

  const { exports } = manifest;
  const client =
    typeof exports === 'object' && exports !== null && './client' in exports
      ? exports['./client']
      : undefined;
  return typeof client === 'object' &&
    client !== null &&
    'types' in client &&
    typeof client.types === 'string'
    ? client.types
    : undefined;
}
