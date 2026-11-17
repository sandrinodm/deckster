import type { PlatformError } from 'effect/PlatformError';

import { FRAMEWORK_MANIFEST, type FrameworkManifest } from '@deckster/brand/node';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect, FileSystem, Predicate, Schema } from 'effect';
import path from 'node:path';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * The folder inside the published package that holds the framework, relative to the package.
 */
export const FRAMEWORK_DIR = path.join('dist', 'framework');

/**
 * The folders of a package that ship besides `package.json`: its source and the files that source
 * reads at run time (the shell's icons, the export verifier's Docker context).
 */
const SHIPPED_FOLDERS = ['src', 'assets', 'docker'];

/**
 * The folders of the default brand that ship, besides `brand.ts`.
 */
const DEFAULT_BRAND_FOLDERS = ['logos'];

/**
 * The path segments (folders) whose files never ship: the release tooling itself, the export the
 * repository's docs site is generated from, test helpers and recorded test output.
 */
const EXCLUDED_FOLDERS = new Set(['release', 'docs-data', 'testing', '__snapshots__']);

/**
 * The files that never ship: tests, test fixtures and their stylesheets, and recorded snapshots.
 */
const EXCLUDED_FILE = /\.(?:test|fixtures?)\.[^/]+$|\.snap$/;

/**
 * The `package.json` fields a staged package keeps. Node needs `type`, `imports` and `exports` to
 * load it; the rest of the manifest is for the repository.
 */
const KEPT_MANIFEST_FIELDS = ['name', 'type', 'imports', 'exports', 'license'] as const;

/**
 * Spaces of indentation in the written JSON files.
 */
const JSON_INDENT_SPACES = 2;

/**
 * The part of a `package.json` the staging reads.
 */
const PackageManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

/**
 * Any JSON object.
 */
const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

/**
 * Where the staging reads from and writes to.
 */
export type StageOptions = {
  /**
   * The repository root, which contains `packages/` and `brands/`.
   */
  repoRoot: string;

  /**
   * The CLI package folder; the framework is written to `dist/framework` inside it.
   */
  cliDir: string;
};

/**
 * Copies the framework into the CLI package, laid out like the repository: `packages/<name>` for
 * every package (source, assets and a trimmed `package.json`), `brands/default` and a
 * `framework.json` that lists the CLI's dependencies. The published CLI runs from this copy, so it
 * keeps the folder structure the code finds its own files by. Anything already in the framework
 * folder is replaced.
 *
 * @param options - The repository and the CLI package.
 * @returns The names of the staged packages.
 * @throws CliError in the error channel when a manifest cannot be read; PlatformError when a file
 *   cannot be read or written.
 */
export const stageFramework = Effect.fn('stageFramework')(function* (
  options: StageOptions,
): Effect.fn.Return<string[], CliError | PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const target = path.join(options.cliDir, FRAMEWORK_DIR);
  yield* fs.remove(target, { recursive: true, force: true });
  yield* fs.makeDirectory(target, { recursive: true });

  const packagesDir = path.join(options.repoRoot, 'packages');
  const names = (yield* fs.readDirectory(packagesDir)).filter((name) => !name.startsWith('.'));
  const staged: string[] = [];
  for (const name of names.sort()) {
    const source = path.join(packagesDir, name);
    if (yield* fs.exists(path.join(source, 'package.json'))) {
      yield* stageFolder(source, path.join(target, 'packages', name), SHIPPED_FOLDERS);
      staged.push(name);
    }
  }

  const brand = path.join(options.repoRoot, 'brands', 'default');
  yield* stageFolder(brand, path.join(target, 'brands', 'default'), DEFAULT_BRAND_FOLDERS);
  yield* fs.copyFile(
    path.join(brand, 'brand.ts'),
    path.join(target, 'brands', 'default', 'brand.ts'),
  );

  const cli = yield* readJson(path.join(options.cliDir, 'package.json'), PackageManifest);
  const manifest: FrameworkManifest = {
    version: cli.version ?? '0.0.0',
    dependencies: Object.keys(cli.dependencies ?? {}).sort(),
  };
  yield* writeJson(path.join(target, FRAMEWORK_MANIFEST), manifest);
  return staged;
});

/**
 * Whether a file of a package ships.
 *
 * @param relative - The file's path inside the folder being staged.
 */
export function isShipped(relative: string): boolean {
  const segments = relative.split(path.sep);
  const file = segments.at(-1) ?? '';
  return !segments.some((segment) => EXCLUDED_FOLDERS.has(segment)) && !EXCLUDED_FILE.test(file);
}

/**
 * Stages one package or brand: the shipped folders and a trimmed `package.json`.
 *
 * @param source - The package folder in the repository.
 * @param target - The folder to write.
 * @param folders - The folders of the package that ship.
 */
const stageFolder = Effect.fn('stageFolder')(function* (
  source: string,
  target: string,
  folders: readonly string[],
): Effect.fn.Return<void, CliError | PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(target, { recursive: true });
  for (const folder of folders) {
    if (yield* fs.exists(path.join(source, folder))) {
      yield* copyShipped(path.join(source, folder), path.join(target, folder));
    }
  }

  const manifestFile = path.join(source, 'package.json');
  const manifest = yield* readJson(manifestFile, JsonObject);
  yield* writeJson(path.join(target, 'package.json'), pick(manifest, folders));
});

/**
 * Copies a folder's files that ship, keeping the structure.
 *
 * @param source - The folder to copy.
 * @param target - The folder to write.
 */
const copyShipped = Effect.fn('copyShipped')(function* (
  source: string,
  target: string,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectory(source, { recursive: true });
  for (const relative of entries.sort()) {
    const info = yield* fs.stat(path.join(source, relative));
    if (info.type === 'File' && isShipped(relative)) {
      yield* fs.makeDirectory(path.dirname(path.join(target, relative)), { recursive: true });
      yield* fs.copyFile(path.join(source, relative), path.join(target, relative));
    }
  }
});

/**
 * Keeps the fields of a package manifest that Node needs, without the `exports` entries whose file
 * does not ship.
 *
 * @param manifest - The parsed `package.json`.
 * @param folders - The folders of the package that ship.
 */
function pick(
  manifest: Readonly<Record<string, unknown>>,
  folders: readonly string[],
): Record<string, unknown> {
  const kept: Record<string, unknown> = Object.fromEntries(
    KEPT_MANIFEST_FIELDS.flatMap((field) => (field in manifest ? [[field, manifest[field]]] : [])),
  );
  if (Predicate.isObject(kept.exports)) {
    const entries = Object.entries(kept.exports);
    kept.exports = Object.fromEntries(
      entries.filter(([, target]) => typeof target !== 'string' || targetShips(target, folders)),
    );
  }

  return kept;
}

/**
 * Whether the file an `exports` target names ships: a target outside the shipped folders (such as
 * `./package.json`) always does, one inside them when `isShipped` keeps it.
 *
 * @param target - The target as written, such as `./src/index.ts`.
 * @param folders - The folders of the package that ship.
 */
function targetShips(target: string, folders: readonly string[]): boolean {
  const [folder = '', ...rest] = path.normalize(target).split(path.sep);
  return !folders.includes(folder) || isShipped(rest.join(path.sep));
}

/**
 * Reads a JSON file and checks its shape.
 *
 * @param file - The absolute path of the file.
 * @param schema - The shape the file must have.
 */
const readJson = Effect.fn('readJson')(function* <S extends Schema.Decoder<unknown>>(
  file: string,
  schema: S,
): Effect.fn.Return<
  S['Type'],
  CliError | PlatformError,
  FileSystem.FileSystem | S['DecodingServices']
> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs.readFileString(file);
  return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text).pipe(
    Effect.mapError(() => cliError(`${file} is not the JSON this release step expects.`)),
  );
});

/**
 * Writes a JSON file the way the formatter prints one.
 *
 * @param file - The absolute path to write.
 * @param value - The value.
 */
const writeJson = Effect.fn('writeJson')(function* (
  file: string,
  value: unknown,
): Effect.fn.Return<void, PlatformError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.writeFileString(file, `${JSON.stringify(value, null, JSON_INDENT_SPACES)}\n`);
});

/**
 * The entry point of `scripts/stage-framework.ts`: stages the framework as the process's main
 * program, printing a failure without a stack trace.
 *
 * @param options - The repository and the CLI package.
 */
export function runStageFramework(options: StageOptions): void {
  NodeRuntime.runMain(
    stageFramework(options).pipe(
      Effect.flatMap((names) =>
        Console.log(`Staged ${names.length} packages in ${FRAMEWORK_DIR}.`),
      ),
      Effect.catch((error) =>
        Console.error(error.message).pipe(
          Effect.andThen(
            Effect.sync(() => {
              process.exitCode = 1;
            }),
          ),
        ),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );
}
