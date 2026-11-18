import type { BrandProblem, BrandTokens } from '@deckster/brand';

import { Effect, FileSystem, Schema } from 'effect';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

import { WORKSPACE_MANIFEST } from '#brand-add/fetch-brand.ts';

/**
 * The prefix of a pnpm catalog dependency: `catalog:` or `catalog:<name>`.
 */
const CATALOG_PREFIX = 'catalog:';

/**
 * The catalog a bare `catalog:` names.
 */
const DEFAULT_CATALOG = 'default';

/**
 * A version or range that is plain enough to hand to a package manager: `5.3.0`, `^5.3.0`, `~5.3`.
 * Git URLs, file paths, tags and `workspace:` specifiers are left out.
 */
const VERSION_PATTERN = /^[\^~]?\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/;

/**
 * The path of a font problem about a Fontsource package: `typography.families.body.source.package`.
 */
const FONT_PACKAGE_PATH = /^typography\.families\.[a-z]+\.source\.package$/;

/**
 * What the font check says of a package that does not resolve from the brand folder.
 */
const NOT_INSTALLED = 'is not installed';

/**
 * The parts of a `package.json` this module reads.
 */
const PackageManifest = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
});

/**
 * The parts of a `pnpm-workspace.yaml` this module reads.
 */
const WorkspaceManifest = Schema.Struct({
  catalog: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  catalogs: Schema.optionalKey(
    Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String)),
  ),
});

/**
 * A pnpm workspace's catalogs, by catalog name.
 */
type Catalogs = ReadonlyMap<string, Readonly<Record<string, string>>>;

/**
 * A Fontsource package a brand uses, with the version its repository pins.
 */
export type FontPackage = {
  /**
   * The package name, such as `@fontsource/source-sans-3`.
   */
  name: string;

  /**
   * The version or range the brand's repository gives it, or `undefined` when it gives none that is
   * a plain version.
   */
  version: string | undefined;
};

/**
 * The Fontsource packages a brand's families load, once each, in family order.
 *
 * @param tokens - The brand's resolved tokens.
 * @returns The package names; empty when no family uses Fontsource.
 */
export function fontsourcePackages(tokens: BrandTokens): string[] {
  const names = Object.values(tokens.typography.families).flatMap((family) =>
    family.source.kind === 'fontsource' ? [family.source.package] : [],
  );
  return [...new Set(names)];
}

/**
 * Whether a brand problem is a Fontsource package that is not installed, which installing the
 * package fixes.
 *
 * @param problem - A problem from loading the brand.
 */
export function isMissingFontPackage(problem: BrandProblem): boolean {
  return FONT_PACKAGE_PATH.test(problem.path) && problem.message.includes(NOT_INSTALLED);
}

/**
 * The versions the brand's repository gives its font packages: from the brand's `package.json`,
 * with `catalog:` entries looked up in the repository's `pnpm-workspace.yaml`. A file that is
 * missing or unreadable gives no versions.
 *
 * @param names - The package names.
 * @param brandDir - The fetched brand folder.
 * @param checkout - The fetched repository folder.
 * @returns Each package with its version, or `undefined` when there is none to use.
 */
export const remoteFontPackages = Effect.fn('remoteFontPackages')(function* (
  names: readonly string[],
  brandDir: string,
  checkout: string,
): Effect.fn.Return<FontPackage[], never, FileSystem.FileSystem> {
  const manifest = yield* readFile(
    path.join(brandDir, 'package.json'),
    JSON.parse,
    PackageManifest,
  );
  const catalogs = yield* readCatalogs(checkout);
  const dependencies = manifest?.dependencies ?? {};
  return names.map((name) => ({ name, version: versionOf(dependencies[name], name, catalogs) }));
});

/**
 * The package names the default catalog of a pnpm workspace lists.
 *
 * @param root - The workspace root.
 * @returns The names; empty when the workspace has no readable `pnpm-workspace.yaml`.
 */
export const catalogPackages = Effect.fn('catalogPackages')(function* (
  root: string,
): Effect.fn.Return<ReadonlySet<string>, never, FileSystem.FileSystem> {
  const catalogs = yield* readCatalogs(root);
  return new Set(Object.keys(catalogs.get(DEFAULT_CATALOG) ?? {}));
});

/**
 * The version a dependency specifier stands for.
 *
 * @param spec - The specifier in `package.json`, if any.
 * @param name - The package name, to look up in a catalog.
 * @param catalogs - The repository's catalogs.
 */
function versionOf(spec: string | undefined, name: string, catalogs: Catalogs): string | undefined {
  const resolved = spec?.startsWith(CATALOG_PREFIX)
    ? catalogs.get(spec.slice(CATALOG_PREFIX.length) || DEFAULT_CATALOG)?.[name]
    : spec;
  return resolved !== undefined && VERSION_PATTERN.test(resolved) ? resolved : undefined;
}

/**
 * Reads the catalogs of a pnpm workspace: the `catalog` field is the default one.
 *
 * @param root - The workspace folder.
 */
const readCatalogs = Effect.fn('readCatalogs')(function* (
  root: string,
): Effect.fn.Return<Catalogs, never, FileSystem.FileSystem> {
  const manifest = yield* readFile(
    path.join(root, WORKSPACE_MANIFEST),
    (text: string): unknown => parseYaml(text),
    WorkspaceManifest,
  );
  const named = Object.entries(manifest?.catalogs ?? {});
  const catalogs = new Map<string, Readonly<Record<string, string>>>(named);
  if (manifest?.catalog !== undefined) {
    catalogs.set(DEFAULT_CATALOG, manifest.catalog);
  }

  return catalogs;
});

/**
 * Reads, parses and decodes a file.
 *
 * @param file - The absolute path.
 * @param parse - Turns the text into a value.
 * @param schema - The schema of the parts this module reads.
 * @returns The decoded value, or `undefined` when the file is missing, does not parse or does not
 *   match the schema.
 */
const readFile = Effect.fn('readFile')(function* <S extends Schema.ConstraintDecoder<unknown>>(
  file: string,
  parse: (text: string) => unknown,
  schema: S,
): Effect.fn.Return<S['Type'] | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(file, 'utf8').pipe(
    Effect.flatMap((text) => Effect.try(() => parse(text))),
    Effect.flatMap((value) => Schema.decodeUnknownEffect(schema)(value)),
    Effect.orElseSucceed(() => undefined),
  );
});
