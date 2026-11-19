import { Effect, FileSystem, Predicate, Schema } from 'effect';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { FontFaceRule } from '#compile/font-face.ts';
import type { FamilyTokens, TypographyTokens } from '#resolve/brand-tokens.ts';
import type { BrandProblem } from '#validate/brand-error.ts';

import { isUnicodeRange } from '#compile/css-syntax.ts';
import { assetProblem, FONT_EXTENSIONS } from '#node/asset-files.ts';
import { BRANDS_DIR, type BrandLocation } from '#node/brand-paths.ts';
import { FRAMEWORK_ANCHOR, FRAMEWORK_INSTALLED } from '#node/framework-root.ts';
import { ownValue } from '#resolve/own-value.ts';
import { FAMILY_ROLES, TYPE_STEPS, type FamilyRole } from '#schema/typography-schema.ts';
import { pickFrom } from '#validate/suggest.ts';

/**
 * Subsets loaded when a Fontsource source names none: Western European text.
 */
const DEFAULT_SUBSETS = ['latin', 'latin-ext'];

/**
 * The file set loaded from a variable Fontsource package when the source names none.
 */
const DEFAULT_AXES = 'wght';

/**
 * The weight a variable package without a `wght` axis is drawn at: regular, CSS's `normal`.
 */
const REGULAR_WEIGHT = 400;

/**
 * The package scope of Fontsource's variable fonts, which ship one file per axis set.
 */
const VARIABLE_PREFIX = '@fontsource-variable/';

/**
 * A family source that names a Fontsource package.
 */
type FontsourceSource = Extract<FamilyTokens['source'], { kind: 'fontsource' }>;

/**
 * A family source that lists font files in the brand folder.
 */
type FilesSource = Extract<FamilyTokens['source'], { kind: 'files' }>;

/**
 * Resolving a Fontsource package can find it, miss it or find an unusable package.
 */
type PackageLookup =
  | { kind: 'found'; dir: string }
  | { kind: 'missing' }
  | { kind: 'invalid'; message: string };

/**
 * The parts of a Fontsource package's `metadata.json` this module reads.
 */
const FontsourceMetadata = Schema.Struct({
  id: Schema.String,
  subsets: Schema.Array(Schema.String),
  weights: Schema.Array(Schema.Finite),
  styles: Schema.Array(Schema.String),
  variable: Schema.Union([
    Schema.Literal(false),
    Schema.Record(Schema.String, Schema.Struct({ min: Schema.String, max: Schema.String })),
  ]),
});

/**
 * The decoded parts of a Fontsource package's `metadata.json`.
 */
type FontsourceMetadata = typeof FontsourceMetadata.Type;

/**
 * The part of a package's `package.json` this module reads: its name.
 */
const PackageManifest = Schema.Struct({ name: Schema.String });

/**
 * A Fontsource package's `unicode.json`: subset name to CSS `unicode-range`.
 */
const UnicodeRanges = Schema.Record(Schema.String, Schema.String);

/**
 * Fontsource resolution for a staged brand whose local font files live in its staging folder.
 */
export type FontPackageOptions = {
  /**
   * The directory to resolve Fontsource packages from, as they will be resolved after publication.
   */
  fromDir: string;

  /**
   * Packages the importer can install later. Problems with packages that resolve still fail.
   */
  allowMissing: ReadonlySet<string>;
};

/**
 * The `@font-face` rules for a brand, and anything that stops its fonts from loading.
 */
export type ResolvedFonts = {
  /**
   * The `@font-face` rules, each with an absolute file path as its URL.
   */
  faces: FontFaceRule[];

  /**
   * What stops the fonts from loading: packages that are not installed, missing files.
   */
  problems: BrandProblem[];

  /**
   * Families declared `unavailable`, which render in their fallback stack.
   */
  warnings: BrandProblem[];

  /**
   * Fontsource packages that could not be resolved, whether or not their absence is allowed.
   */
  missingPackages: string[];
};

/**
 * The result for a family that loads no files.
 */
const NO_FONTS: ResolvedFonts = {
  /**
   * No `@font-face` rules.
   */
  faces: [],

  /**
   * Nothing stops the family from rendering.
   */
  problems: [],

  /**
   * Nothing to warn about.
   */
  warnings: [],

  /**
   * No unresolved Fontsource package.
   */
  missingPackages: [],
};

/**
 * Finds the font files for a brand's families: Fontsource packages are resolved from the brand's
 * own `package.json`, local files from the brand folder. Each face's `url` is an absolute path; the
 * Vite build turns it into an asset URL.
 *
 * @param typography - The brand's resolved typography.
 * @param brand - Where the brand lives.
 * @param packages - Where and how to resolve Fontsource packages for a staged brand, if applicable.
 * @returns The faces, and problems such as a package that is not installed or a missing file.
 */
export const resolveFontFiles = Effect.fn('resolveFontFiles')(function* (
  typography: TypographyTokens,
  brand: BrandLocation,
  packages?: FontPackageOptions,
): Effect.fn.Return<ResolvedFonts, never, FileSystem.FileSystem> {
  const results = yield* Effect.forEach(
    FAMILY_ROLES,
    (role) => familyFaces(role, typography, brand, packages),
    // One per family role: display, body and mono.
    { concurrency: 'unbounded' },
  );
  return {
    faces: results.flatMap((result) => result.faces),
    problems: results.flatMap((result) => result.problems),
    warnings: results.flatMap((result) => result.warnings),
    missingPackages: [...new Set(results.flatMap((result) => result.missingPackages))],
  };
});

/**
 * The faces of one family role, by the kind of source it names.
 *
 * @param role - The family role.
 * @param typography - The brand's resolved typography.
 * @param brand - Where the brand lives.
 * @param packages - Where and how to resolve Fontsource packages for a staged brand, if applicable.
 */
function familyFaces(
  role: FamilyRole,
  typography: TypographyTokens,
  brand: BrandLocation,
  packages: FontPackageOptions | undefined,
): Effect.Effect<ResolvedFonts, never, FileSystem.FileSystem> {
  const family = typography.families[role];
  switch (family.source.kind) {
    case 'system': {
      return Effect.succeed(NO_FONTS);
    }

    case 'unavailable': {
      return Effect.succeed({ ...NO_FONTS, warnings: [unavailableWarning(role, family)] });
    }

    case 'files': {
      return localFaces(role, family.family, family.source, brand);
    }

    case 'fontsource': {
      return fontsourceFaces({
        role,
        family: family.family,
        source: family.source,
        typography,
        brand,
        packages,
      });
    }
  }
}

/**
 * The warning for a family declared `unavailable`: it renders in its fallback stack.
 *
 * @param role - The family role.
 * @param family - The family's tokens.
 */
function unavailableWarning(role: FamilyRole, family: FamilyTokens): BrandProblem {
  const reason = family.source.kind === 'unavailable' ? family.source.reason : '';
  return {
    path: `typography.families.${role}.source`,
    message: `${family.family} has no font files (${reason}), so text renders in ${family.stack}.`,
    fix: 'Add the licensed files to the brand\'s fonts/ folder and use `kind: "files"`.',
  };
}

/**
 * The faces of a family whose files live in the brand folder, and a problem per missing file.
 *
 * @param role - The family role.
 * @param family - The family name.
 * @param source - The files the brand lists.
 * @param brand - Where the brand lives; file paths are relative to its folder.
 */
const localFaces = Effect.fn('localFaces')(function* (
  role: FamilyRole,
  family: string,
  source: FilesSource,
  brand: BrandLocation,
): Effect.fn.Return<ResolvedFonts, never, FileSystem.FileSystem> {
  const checked = yield* Effect.forEach(
    source.files,
    (file, index) => {
      const url = path.resolve(brand.dir, file.path);
      const check = {
        file: url,
        root: brand.dir,
        rootName: `${BRANDS_DIR}/${brand.name}/`,
        written: file.path,
        extensions: FONT_EXTENSIONS,
      };
      return Effect.map(assetProblem(check), (problem) => ({ file, index, url, problem }));
    },
    // A family lists a few files, one per weight and style.
    { concurrency: 'unbounded' },
  );
  const problems = checked.flatMap((entry) =>
    entry.problem === undefined
      ? []
      : [
          {
            path: `typography.families.${role}.source.files[${entry.index}].path`,
            message: entry.problem,
            fix:
              'Put the font file itself (a .woff2, .woff, .ttf or .otf, not a link to a file ' +
              'elsewhere) in the brand folder, usually fonts/, or fix the path.',
          },
        ],
  );
  const faces = checked.map(({ file, url }) => ({
    family,
    url,
    weight: file.weight,
    style: file.style ?? 'normal',
    unicodeRange: file.unicodeRange,
  }));
  return { ...NO_FONTS, faces, problems };
});

/**
 * One family role that names a Fontsource package, with what is needed to plan its files.
 */
type FontsourceInput = {
  /**
   * The family role.
   */
  role: FamilyRole;

  /**
   * The family name.
   */
  family: string;

  /**
   * The Fontsource source the brand names.
   */
  source: FontsourceSource;

  /**
   * The brand's resolved typography, for the weights its type scale uses.
   */
  typography: TypographyTokens;

  /**
   * Where the brand lives; the package resolves from its folder.
   */
  brand: BrandLocation;

  /**
   * Where and how to resolve Fontsource packages for a staged brand, if applicable.
   */
  packages: FontPackageOptions | undefined;
};

/**
 * The faces a Fontsource package provides for a family, and a problem for each subset, style,
 * weight or file the package does not have.
 *
 * @param input - The family role and its source.
 */
const fontsourceFaces = Effect.fn('fontsourceFaces')(function* (
  input: FontsourceInput,
): Effect.fn.Return<ResolvedFonts, never, FileSystem.FileSystem> {
  const { role, source, brand, packages } = input;
  const field = `typography.families.${role}.source`;
  const lookup = yield* locatePackage(source.package, packages?.fromDir ?? brand.dir);
  if (lookup.kind === 'missing') {
    return missingFontPackage(input, field);
  }

  /**
   * The result for a package that cannot be used: no faces, one problem at its name.
   */
  const packageProblem = (message: string): ResolvedFonts => ({
    ...NO_FONTS,
    problems: [
      {
        path: `${field}.package`,
        message,
        fix: FRAMEWORK_INSTALLED
          ? `Reinstall ${source.package} (npm install ${source.package} --force), or pick another font.`
          : `Reinstall ${source.package} (pnpm install --force), or pick another font.`,
      },
    ],
  });
  if (lookup.kind === 'invalid') {
    return packageProblem(lookup.message);
  }

  const packageDir = lookup.dir;
  const files = yield* readPackageFiles(packageDir, source.package);
  if (typeof files === 'string') {
    return packageProblem(files);
  }

  const { metadata, ranges } = files;
  const problems = [
    ...unknownValues(
      source.subsets ?? DEFAULT_SUBSETS,
      metadata.subsets,
      `${field}.subsets`,
      'subset',
    ),
    ...unknownValues(source.styles ?? ['normal'], metadata.styles, `${field}.styles`, 'style'),
  ];
  const plan = facePlan(input, metadata);
  problems.push(...plan.problems);
  const faces = yield* Effect.forEach(
    plan.faces,
    (face) => {
      const file = path.join(packageDir, 'files', face.fileName);
      const check = {
        file,
        root: packageDir,
        rootName: `${source.package}/`,
        written: face.fileName,
        extensions: FONT_EXTENSIONS,
      };
      return Effect.map(assetProblem(check), (problem) => ({ face, file, problem }));
    },
    // One file per subset and style, and per weight for static packages: a few dozen at most.
    { concurrency: 'unbounded' },
  );
  for (const broken of faces) {
    if (broken.problem === undefined) {
      continue;
    }

    problems.push({
      path: `${field}.axes`,
      message: broken.problem.includes('does not exist')
        ? `${source.package} has no file ${broken.face.fileName}.`
        : `${source.package}: ${broken.problem}`,
      fix: `Pick a file set the package ships; its files are in ${source.package}/files/.`,
    });
  }

  const badRanges = faces.filter(
    (entry) => entry.problem === undefined && !isRange(ownValue(ranges, entry.face.subset)),
  );
  if (badRanges.length > 0) {
    return packageProblem(
      `${source.package}/unicode.json gives no valid unicode-range for ` +
        `${[...new Set(badRanges.map((entry) => entry.face.subset))].join(', ')}.`,
    );
  }

  return {
    ...NO_FONTS,
    faces: faces
      .filter((entry) => entry.problem === undefined)
      .map(({ face, file }) => ({
        family: input.family,
        url: file,
        weight: face.weight,
        style: face.style,
        unicodeRange: ownValue(ranges, face.subset),
      })),
    problems,
  };
});

/**
 * Records an unresolved Fontsource package and reports an error unless the import can install it.
 */
function missingFontPackage(input: FontsourceInput, field: string): ResolvedFonts {
  const { source, brand, packages } = input;
  const name = source.package;
  const result = { ...NO_FONTS, missingPackages: [name] };
  if (packages?.allowMissing.has(name)) {
    return result;
  }

  const dir = path.dirname(brand.displayPath);
  const problem = {
    path: `${field}.package`,
    message: `${name} is not installed for ${dir}.`,
    fix: FRAMEWORK_INSTALLED
      ? `Install it in the workspace folder, where the brand's fonts resolve from: ` +
        `npm install ${name}.`
      : `Add "${name}" to the dependencies in ${dir}/package.json and run pnpm install.`,
  };
  return { ...result, problems: [problem] };
}

/**
 * One file a Fontsource source loads, before checking that it exists.
 */
type PlannedFace = {
  /**
   * The file name inside the package's `files/` folder.
   */
  fileName: string;

  /**
   * The subset the file covers, such as `latin`.
   */
  subset: string;

  /**
   * The style the file draws.
   */
  style: 'normal' | 'italic';

  /**
   * The weight of a static file, or the weight range of a variable one.
   */
  weight: number | readonly [number, number];
};

/**
 * Which files a Fontsource source loads, before checking that they exist.
 *
 * @param input - The family role and its source.
 * @param metadata - The package's metadata.
 */
function facePlan(
  input: FontsourceInput,
  metadata: FontsourceMetadata,
): { faces: PlannedFace[]; problems: BrandProblem[] } {
  const { source } = input;
  const subsets = (source.subsets ?? DEFAULT_SUBSETS).filter((subset) =>
    metadata.subsets.includes(subset),
  );
  const styles = (source.styles ?? ['normal']).filter((style) => metadata.styles.includes(style));
  if (source.package.startsWith(VARIABLE_PREFIX)) {
    const range = variableWeights(metadata);
    const axes = source.axes ?? DEFAULT_AXES;
    const faces = subsets.flatMap((subset) =>
      styles.map((style) => ({
        fileName: `${metadata.id}-${subset}-${axes}-${style}.woff2`,
        subset,
        style,
        weight: range,
      })),
    );
    return { faces, problems: weightRangeProblems(input, range) };
  }

  const weights = source.weights ?? [];
  const problems = unknownValues(
    weights.map(String),
    metadata.weights.map(String),
    `typography.families.${input.role}.source.weights`,
    'weight',
  );
  const faces = subsets.flatMap((subset) =>
    styles.flatMap((style) =>
      weights
        .filter((weight) => metadata.weights.includes(weight))
        .map((weight) => ({
          fileName: `${metadata.id}-${subset}-${weight}-${style}.woff2`,
          subset,
          style,
          weight,
        })),
    ),
  );
  return { faces, problems };
}

/**
 * The weight range of a variable package's `wght` axis, or its single weight when it has none.
 *
 * @param metadata - The package's metadata.
 */
function variableWeights(metadata: FontsourceMetadata): readonly [number, number] {
  const axis = metadata.variable === false ? undefined : metadata.variable.wght;
  if (axis === undefined) {
    const weight = metadata.weights[0] ?? REGULAR_WEIGHT;
    return [weight, weight];
  }

  return [Number(axis.min), Number(axis.max)];
}

/**
 * Type steps that use a variable family must stay inside its weight axis.
 */
function weightRangeProblems(
  input: FontsourceInput,
  range: readonly [number, number],
): BrandProblem[] {
  return TYPE_STEPS.flatMap((step) => {
    const spec = input.typography.scale[step];
    if (spec.family !== input.role || (spec.weight >= range[0] && spec.weight <= range[1])) {
      return [];
    }

    return [
      {
        path: `typography.scale.${step}.weight`,
        message:
          `${input.source.package} has weights ${range[0]} to ${range[1]}, not ` +
          `${spec.weight}.`,
        fix: `Pick a weight from ${range[0]} to ${range[1]}.`,
      },
    ];
  });
}

/**
 * A problem for each value the package does not list, with the closest one it does.
 *
 * @param values - The values the brand names.
 * @param known - The values the package has.
 * @param field - The brand field the values come from.
 * @param what - What a value is, for messages: "subset", "style", "weight".
 */
function unknownValues(
  values: readonly string[],
  known: readonly string[],
  field: string,
  what: string,
): BrandProblem[] {
  return values
    .filter((value) => !known.includes(value))
    .map((value) => ({
      path: field,
      message: `The package has no ${what} "${value}".`,
      fix: pickFrom(value, known, what),
    }));
}

/**
 * The package's folder, resolved the way Node would from the brand folder. In a published copy, a
 * package the brand does not install itself falls back to the framework's own dependencies, so the
 * built-in brand's fonts load without the user installing anything.
 *
 * @param name - The package name.
 * @param brandDir - The absolute brand folder.
 * @returns The package folder, or why it could not be loaded.
 */
const locatePackage = Effect.fn('locatePackage')(function* (
  name: string,
  brandDir: string,
): Effect.fn.Return<PackageLookup, never, FileSystem.FileSystem> {
  const lookup = yield* resolvePackageFolder(name, path.join(brandDir, 'package.json'));
  if (lookup.kind === 'missing' && FRAMEWORK_INSTALLED) {
    return yield* resolvePackageFolder(name, FRAMEWORK_ANCHOR);
  }

  return lookup;
});

/**
 * The folder of a package as Node resolves it from a file.
 *
 * @param name - The package name.
 * @param from - The absolute path of the file that imports it.
 */
const resolvePackageFolder = Effect.fn('resolvePackageFolder')(function* (
  name: string,
  from: string,
): Effect.fn.Return<PackageLookup, never, FileSystem.FileSystem> {
  const resolve = createRequire(from).resolve;
  try {
    const manifest = resolve(`${name}/package.json`);
    return { kind: 'found', dir: path.dirname(manifest) };
  } catch (error) {
    if (Predicate.hasProperty(error, 'code') && error.code === 'MODULE_NOT_FOUND') {
      // A missing manifest or export target also produces MODULE_NOT_FOUND. Only an absent
      // package may be deferred to installation or resolved from the framework instead.
      const fs = yield* FileSystem.FileSystem;
      const candidates = resolve.paths(name) ?? [];
      const present = yield* Effect.forEach(candidates, (dir) =>
        fs.exists(path.join(dir, name)),
      ).pipe(
        Effect.map((entries) => entries.some(Boolean)),
        Effect.orElseSucceed(() => true),
      );
      if (!present) {
        return { kind: 'missing' };
      }
    }

    const reason = error instanceof Error ? error.message : String(error);
    return { kind: 'invalid', message: `Could not resolve ${name}: ${reason}` };
  }
});

/**
 * Whether a package's `unicode.json` gives a usable range: missing (every character) or a valid
 * `unicode-range`.
 *
 * @param range - The range the package gives for a subset.
 */
function isRange(range: string | undefined): boolean {
  return range === undefined || isUnicodeRange(range);
}

/**
 * A Fontsource package's `metadata.json` and `unicode.json`, after checking that the folder is the
 * package asked for. Packages come from the brand's `node_modules`, so a broken or foreign one is
 * reported against the brand instead of stopping the process.
 *
 * @param packageDir - The package's folder.
 * @param name - The package name the brand gives.
 * @returns The two files, or a message saying what is wrong with the package.
 */
const readPackageFiles = Effect.fn('readPackageFiles')(function* (
  packageDir: string,
  name: string,
): Effect.fn.Return<
  { metadata: FontsourceMetadata; ranges: Readonly<Record<string, string>> } | string,
  never,
  FileSystem.FileSystem
> {
  const manifest = yield* readJson(path.join(packageDir, 'package.json'), PackageManifest);
  if (manifest === undefined || manifest.name !== name) {
    return `${name} resolves to ${packageDir}, which is not that package.`;
  }

  const metadata = yield* readJson(path.join(packageDir, 'metadata.json'), FontsourceMetadata);
  const ranges = yield* readJson(path.join(packageDir, 'unicode.json'), UnicodeRanges);
  if (metadata === undefined || ranges === undefined) {
    return `${name} has no readable metadata.json and unicode.json, so it is not a Fontsource package.`;
  }

  return { metadata, ranges };
});

/**
 * Reads and decodes a JSON file a package ships.
 *
 * @param file - The absolute path of the JSON file.
 * @param schema - The schema of the parts this module reads.
 * @returns The decoded value, or `undefined` when the file is missing, is not JSON or does not
 *   match the schema.
 */
const readJson = Effect.fn('readJson')(function* <S extends Schema.ConstraintDecoder<unknown>>(
  file: string,
  schema: S,
): Effect.fn.Return<S['Type'] | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(file, 'utf8').pipe(
    Effect.flatMap((text) => Effect.try((): unknown => JSON.parse(text))),
    Effect.flatMap((json) => Schema.decodeUnknownEffect(schema)(json)),
    Effect.orElseSucceed(() => undefined),
  );
});
