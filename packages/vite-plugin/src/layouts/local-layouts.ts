import { isSafeName } from '@deckster/brand';
import {
  DECK_CONFIG_CALLEE,
  forgetLoaded,
  FRAMEWORK_INSTALLED,
  FRAMEWORK_ROOT,
  readFrameworkManifest,
  readStaticModule,
  type BrandLocation,
} from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { Effect, FileSystem, Option, Predicate, Schema } from 'effect';
import path from 'node:path';

import type { DeckLocation } from '#decks/deck-paths.ts';
import type { FileRef } from '#errors.ts';
import type { LayoutProblem } from '#layouts/layout-problem.ts';

import { displayPath } from '#decks/deck-paths.ts';
import { checkContract } from '#layouts/check-contract.ts';
import {
  importContracts,
  SHARED_LAYOUTS_DIR,
  type ContractLoad,
} from '#layouts/import-contracts.ts';
import { RANGE_RULE, satisfiesRange } from '#layouts/version-range.ts';

/**
 * The folder inside a brand or a deck that holds one folder per code layout.
 */
export const LAYOUTS_DIR = 'layouts';

/**
 * The file of a layout folder that holds its contract, which runs in Node.
 */
export const CONTRACT_FILE = 'contract.ts';

/**
 * The file of a layout folder that holds its component, which runs in the browser.
 */
export const COMPONENT_FILE = 'layout.tsx';

/**
 * The optional file of a brand folder that declares the deckster versions its code layouts are
 * written for: `{ "deckster": ">=0.10 <0.12" }`.
 */
export const BRAND_MANIFEST_FILE = 'brand.json';

/**
 * The start of the `source` of a brand's code layout, followed by the brand folder name.
 */
export const BRAND_CODE_SOURCE_PREFIX = 'brand-code:';

/**
 * The start of the `source` of a deck's code layout, followed by the deck folder name.
 */
export const DECK_SOURCE_PREFIX = 'deck:';

/**
 * The CLI's `package.json` in a repository checkout, which holds the version there.
 */
const CLI_PACKAGE_FILE = path.join('packages', 'cli', 'package.json');

/**
 * A JSON file with a `version`.
 */
const VersionedJson = Schema.fromJsonString(Schema.Struct({ version: Schema.String }));

/**
 * A `brand.json`: the deckster versions the brand's code layouts are written for.
 */
const BrandManifestJson = Schema.fromJsonString(
  Schema.Struct({ deckster: Schema.optionalKey(Schema.String) }),
);

/**
 * One code layout found in a brand or a deck.
 */
export type LocalLayout = {
  /**
   * The layout name, which is its folder name.
   */
  readonly name: string;

  /**
   * Where it comes from: `brand-code:<brand>` or `deck:<deck>`.
   */
  readonly source: `brand-code:${string}` | `deck:${string}`;

  /**
   * The absolute path of its `contract.ts`.
   */
  readonly contractFile: string;

  /**
   * The absolute path of its `layout.tsx`.
   */
  readonly componentFile: string;
};

/**
 * One code layout's contract, loaded and checked, ready to join a layout catalog.
 */
export type LocalCatalog = {
  /**
   * Where the layout comes from: `brand-code:<brand>` or `deck:<deck>`.
   */
  readonly source: LocalLayout['source'];

  /**
   * The layout's `contract.ts`, for messages.
   */
  readonly ref: FileRef;

  /**
   * The contract itself: the default export of `contract.ts`. It passed `checkContract` and is
   * named like its folder.
   */
  readonly exported: unknown;
};

/**
 * The code layouts of a brand and a deck.
 */
export type LocalLayouts = {
  /**
   * Every layout folder that has both of its files: the brand's, then the deck's, each by folder
   * name. A layout listed here may still have a problem.
   */
  readonly layouts: readonly LocalLayout[];

  /**
   * The contracts that loaded without a problem, in the order of {@link LocalLayouts.layouts}; empty
   * when the code was not loaded.
   */
  readonly catalogs: readonly LocalCatalog[];

  /**
   * The names of kit layouts these layouts replace, which the kit then does not load. Always empty
   * until a contract can say `replaces`.
   */
  readonly replaced: readonly string[];

  /**
   * Every file found in the layout folders and in `layouts/_shared/`, and a brand's `brand.json`,
   * for watching.
   */
  readonly files: readonly string[];

  /**
   * Everything wrong with the layouts. Only the slides that name a layout with a problem fail.
   */
  readonly problems: readonly LayoutProblem[];
};

/**
 * Options for {@link localLayouts}.
 */
export type LocalLayoutsOptions = {
  /**
   * The absolute workspace root: contracts run in a Vite environment rooted there, and paths in
   * messages are relative to it.
   */
  readonly root: string;

  /**
   * The brand whose `layouts/` to read, from `LoadedBrand.location`, so the framework's built-in
   * brand and a brand staged outside `brands/` are found where they are.
   */
  readonly brand?: BrandLocation | undefined;

  /**
   * The deck whose `layouts/` to read, from `findDeck`.
   */
  readonly deck?: DeckLocation | undefined;

  /**
   * `load` imports the contracts; `skip` only lists the folders and checks their files, and never
   * runs the brand's or the deck's code.
   */
  readonly code: 'load' | 'skip';
};

/**
 * A brand or a deck, as the owner of a `layouts/` folder.
 */
type Owner = {
  /**
   * The `source` of its layouts.
   */
  readonly source: LocalLayout['source'];

  /**
   * What it is called in messages, such as `the acme brand`.
   */
  readonly label: string;

  /**
   * Its absolute `layouts/` folder.
   */
  readonly layoutsDir: string;

  /**
   * The absolute file that may declare a deckster version range.
   */
  readonly versionFile: string;

  /**
   * Whether the range is read from a `brand.json` or from a deck config.
   */
  readonly kind: 'brand' | 'deck';
};

/**
 * What was found in one owner's `layouts/` folder.
 */
type Discovery = {
  /**
   * The layout folders with both files.
   */
  readonly layouts: readonly LocalLayout[];

  /**
   * The files to watch.
   */
  readonly files: readonly string[];

  /**
   * The problems found without running anything.
   */
  readonly problems: readonly LayoutProblem[];

  /**
   * Whether the owner's contracts may be imported: `false` when its version range does not match.
   */
  readonly loadable: boolean;
};

/**
 * Finds the code layouts of a brand and a deck and, unless told to skip the code, loads their
 * contracts.
 *
 * A code layout is a folder `layouts/<name>/` with a `contract.ts` and a `layout.tsx`. Folders
 * whose name starts with `_` or `.` (`_shared`, `.eject`) or is not a safe kebab-case name are
 * never layouts, and files at the top of `layouts/` are a data layout's art. Before anything is
 * imported, a deckster version range declared in the brand's `brand.json` (`"deckster"`) or the
 * deck's `deck.config.ts` (`deckster`, read without running the config; a config that is more than
 * a literal declares none) is checked against this deckster, and a mismatch keeps every contract of
 * that brand or deck from loading. Then each folder is checked: both files exist, `layout.tsx`
 * names the layout, the contract's imports are allowed, it loads (never while an agent turn holds
 * it, see `importContracts`), it is named like its folder and it passes the build's contract
 * checks.
 *
 * It never fails: problems are values, so a caller can still list every other layout.
 *
 * @param options - The workspace, the brand and deck to read, and whether to load code.
 * @returns The layouts found, the contracts that loaded cleanly and every problem.
 */
export const localLayouts = Effect.fn('localLayouts')(function* (
  options: LocalLayoutsOptions,
): Effect.fn.Return<LocalLayouts, never, FileSystem.FileSystem> {
  const { root } = options;
  const found = yield* Effect.forEach(ownersOf(options), (owner) => discover(owner, root));
  const layouts = found.flatMap((discovery) => discovery.layouts);
  const files = found.flatMap((discovery) => discovery.files);
  const problems = found.flatMap((discovery) => discovery.problems);
  if (options.code === 'skip') {
    return { layouts, catalogs: [], replaced: [], files, problems };
  }

  const loadable = found.flatMap((discovery) => (discovery.loadable ? discovery.layouts : []));
  const loads = yield* importContracts(
    loadable.map((layout) => layout.contractFile),
    { root },
  );
  const catalogs: LocalCatalog[] = [];
  for (const [index, layout] of loadable.entries()) {
    const load = loads[index];
    const loadProblems = load === undefined ? [] : contractProblems(layout, load, root);
    problems.push(...loadProblems);
    const isClean = !problems.some((problem) => isProblemOf(problem, layout));
    if (load?.kind === 'loaded' && isClean) {
      catalogs.push({
        source: layout.source,
        ref: { file: layout.contractFile, displayPath: displayPath(root, layout.contractFile) },
        exported: load.exported,
      });
    }
  }

  return { layouts, catalogs, replaced: [], files, problems };
});

/**
 * Whether a problem belongs to a layout: it names the layout and one of its two files or its
 * folder.
 *
 * @param problem - A problem.
 * @param layout - A layout.
 */
function isProblemOf(problem: LayoutProblem, layout: LocalLayout): boolean {
  const folder = path.dirname(layout.contractFile);
  return (
    problem.layout === layout.name &&
    (problem.file === folder || path.dirname(problem.file) === folder)
  );
}

/**
 * The owners to read: the brand, then the deck.
 *
 * @param options - The brand and the deck, when given.
 */
function ownersOf(options: LocalLayoutsOptions): Owner[] {
  const { brand, deck } = options;
  const brandOwner: Owner[] =
    brand === undefined
      ? []
      : [
          {
            source: `${BRAND_CODE_SOURCE_PREFIX}${brand.name}`,
            label: `the ${brand.name} brand`,
            layoutsDir: path.join(brand.dir, LAYOUTS_DIR),
            versionFile: path.join(brand.dir, BRAND_MANIFEST_FILE),
            kind: 'brand',
          },
        ];
  const deckOwner: Owner[] =
    deck === undefined
      ? []
      : [
          {
            source: `${DECK_SOURCE_PREFIX}${deck.id}`,
            label: `the ${deck.id} deck`,
            layoutsDir: path.join(deck.dir, LAYOUTS_DIR),
            versionFile: deck.configFile,
            kind: 'deck',
          },
        ];
  return [...brandOwner, ...deckOwner];
}

/**
 * Lists one owner's layout folders and checks what can be checked without running code.
 *
 * @param owner - The brand or the deck.
 * @param root - The absolute workspace root, for messages.
 */
const discover = Effect.fn('discoverLayouts')(function* (
  owner: Owner,
  root: string,
): Effect.fn.Return<Discovery, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs
    .readDirectoryEntries(owner.layoutsDir)
    .pipe(Effect.orElseSucceed(() => []));
  const folders = entries
    .filter((entry) => entry.type === 'Directory')
    .map((entry) => entry.name)
    .toSorted();
  const names = folders.filter((name) => isSafeName(name));
  const shared = folders.includes(SHARED_LAYOUTS_DIR)
    ? yield* filesUnder(path.join(owner.layoutsDir, SHARED_LAYOUTS_DIR))
    : [];
  const read = yield* Effect.forEach(names, (name) => readLayoutFolder(owner, name, root));
  const layouts = read.flatMap((folder) => (folder.layout === undefined ? [] : [folder.layout]));
  const problems = read.flatMap((folder) => folder.problems);
  const files = [...shared, ...read.flatMap((folder) => folder.files)];
  if (names.length === 0) {
    return { layouts, files, problems, loadable: true };
  }

  const manifest = yield* fs.exists(owner.versionFile).pipe(Effect.orElseSucceed(() => false));
  const version = yield* versionProblem(owner, root);
  return {
    layouts,
    files: owner.kind === 'brand' && manifest ? [...files, owner.versionFile] : files,
    problems: version === undefined ? problems : [version, ...problems],
    loadable: version === undefined,
  };
});

/**
 * What one layout folder holds.
 */
type LayoutFolder = {
  /**
   * The layout, when the folder has both of its files.
   */
  readonly layout: LocalLayout | undefined;

  /**
   * The files in the folder, to watch.
   */
  readonly files: readonly string[];

  /**
   * What is wrong with the folder: a missing file, or a component under another name.
   */
  readonly problems: readonly LayoutProblem[];
};

/**
 * Reads one layout folder: its files, whether both of the layout's files are there, and whether
 * `layout.tsx` names the layout.
 *
 * @param owner - The brand or the deck.
 * @param name - The folder name, a safe kebab-case name.
 * @param root - The absolute workspace root, for messages.
 */
const readLayoutFolder = Effect.fn('readLayoutFolder')(function* (
  owner: Owner,
  name: string,
  root: string,
): Effect.fn.Return<LayoutFolder, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const folder = path.join(owner.layoutsDir, name);
  const files = yield* filesUnder(folder);
  const layout: LocalLayout = {
    name,
    source: owner.source,
    contractFile: path.join(folder, CONTRACT_FILE),
    componentFile: path.join(folder, COMPONENT_FILE),
  };
  const missing = [layout.contractFile, layout.componentFile].filter(
    (file) => !files.includes(file),
  );
  if (missing.length > 0) {
    if (missing.includes(layout.contractFile)) {
      // A contract that is gone and written again, even within one agent turn, starts afresh.
      forgetLoaded(layout.contractFile);
    }

    const problems = [incompleteFolder(layout, folder, missing, root)];
    return { layout: undefined, files, problems };
  }

  const component = yield* fs
    .readFileString(layout.componentFile)
    .pipe(Effect.orElseSucceed(() => ''));
  const problems = namesLayout(component, name) ? [] : [componentNameMismatch(layout, root)];
  return { layout, files, problems };
});

/**
 * Every file under a folder, as absolute paths, sorted. Entries whose name starts with a dot, such
 * as `.eject`, are left out with everything in them.
 *
 * @param dir - The absolute folder.
 */
const filesUnder = Effect.fn('filesUnder')(function* (
  dir: string,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectoryEntries(dir).pipe(Effect.orElseSucceed(() => []));
  const visible = entries
    .filter((entry) => !entry.name.startsWith('.'))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const nested = yield* Effect.forEach(visible, (entry) => {
    const target = path.join(dir, entry.name);
    if (entry.type === 'Directory') {
      return filesUnder(target);
    }

    return Effect.succeed(entry.type === 'File' ? [target] : []);
  });
  return nested.flat();
});

/**
 * Whether a `layout.tsx` registers a layout under a name: it has `name: '<name>'` somewhere, as a
 * `defineLayout({ name, component })` call does. The browser checks the registration itself when
 * the layout loads.
 *
 * @param text - The file's content.
 * @param name - The layout name, a safe kebab-case name.
 */
function namesLayout(text: string, name: string): boolean {
  return new RegExp(`\\bname\\s*:\\s*(['"\`])${name}\\1`).test(text);
}

/**
 * The problem for a layout folder that lacks one or both of its files.
 *
 * @param layout - The layout.
 * @param folder - Its absolute folder.
 * @param missing - The absolute files that are missing.
 * @param root - The absolute workspace root.
 */
function incompleteFolder(
  layout: LocalLayout,
  folder: string,
  missing: readonly string[],
  root: string,
): LayoutProblem {
  const names = missing.map((file) => path.basename(file));
  const adds = names.map((name) =>
    name === CONTRACT_FILE
      ? `${CONTRACT_FILE} with \`export default defineLayoutContract({ name: '${layout.name}', ... })\``
      : `${COMPONENT_FILE} with \`export default defineLayout({ name: '${layout.name}', component })\``,
  );
  return {
    code: 'layout-folder-incomplete',
    file: folder,
    layout: layout.name,
    message: `${displayPath(root, folder)}/ has no ${names.join(' and no ')}.`,
    fix:
      `Add ${adds.join(' and ')}, or move the folder out of ${LAYOUTS_DIR}/: every folder ` +
      `there is a code layout, except ${SHARED_LAYOUTS_DIR}/.`,
  };
}

/**
 * The problem for a `layout.tsx` that does not register the layout its folder names.
 *
 * @param layout - The layout.
 * @param root - The absolute workspace root.
 */
function componentNameMismatch(layout: LocalLayout, root: string): LayoutProblem {
  return {
    code: 'layout-name-mismatch',
    file: layout.componentFile,
    layout: layout.name,
    message:
      `${displayPath(root, layout.componentFile)} does not register a layout named ` +
      `"${layout.name}", the name of its folder.`,
    fix:
      `Export \`export default defineLayout({ name: '${layout.name}', component })\` from ` +
      'it, with the name written as a plain string.',
  };
}

/**
 * The problems of one contract after its load: why it did not load, or what is wrong with the
 * contract that did.
 *
 * @param layout - The layout.
 * @param load - What became of its `contract.ts`.
 * @param root - The absolute workspace root.
 */
function contractProblems(layout: LocalLayout, load: ContractLoad, root: string): LayoutProblem[] {
  const at = { file: layout.contractFile, layout: layout.name };
  const shown = displayPath(root, layout.contractFile);
  if (load.kind === 'failed') {
    const { code, message, fix } = load.problem;
    const isAboutImports = code === 'layout-contract-imports';
    return [{ ...at, code, message: isAboutImports ? message : `${shown}: ${message}`, fix }];
  }

  if (load.kind === 'held') {
    return [
      {
        ...at,
        code: 'layout-held',
        message:
          `An agent turn is in flight and ${shown} was not loaded before it began, so the ` +
          `"${layout.name}" layout is not available until the turn ends.`,
        fix: 'Wait for the turn to end; the layout is loaded again then.',
      },
    ];
  }

  const invalid = checkContract(load.exported).map((problem): LayoutProblem => ({
    ...at,
    code: 'layout-contract-invalid',
    ...problem,
  }));
  const name: unknown = Predicate.isObject(load.exported) ? load.exported.name : undefined;
  if (typeof name !== 'string' || name === layout.name) {
    return invalid;
  }

  return [
    ...invalid,
    {
      ...at,
      code: 'layout-name-mismatch',
      message: `The contract in ${shown} is named "${name}", but its folder is "${layout.name}".`,
      fix:
        `Give both one name: set \`name: '${layout.name}'\` in the contract and in ` +
        `${COMPONENT_FILE}, or rename the folder.`,
    },
  ];
}

/**
 * The problem with an owner's declared deckster version range, or `undefined` when it declares
 * none, the range includes this deckster, or this deckster's version cannot be read.
 *
 * @param owner - The brand or the deck.
 * @param root - The absolute workspace root.
 */
const versionProblem = Effect.fn('layoutVersionProblem')(function* (
  owner: Owner,
  root: string,
): Effect.fn.Return<LayoutProblem | undefined, never, FileSystem.FileSystem> {
  const shown = displayPath(root, owner.versionFile);
  const declared = yield* declaredRange(owner);
  if (declared === undefined) {
    return undefined;
  }

  const at = { code: 'layout-version', file: owner.versionFile } as const;
  if (declared.range === undefined) {
    return {
      ...at,
      message: `${shown} cannot be read as \`{ "deckster": "<range>" }\`.`,
      fix: `Write the deckster versions the layouts are for, as ${RANGE_RULE}, or remove the file.`,
    };
  }

  const installed = yield* installedVersion();
  const matches = installed === undefined ? true : satisfiesRange(installed, declared.range);
  if (matches === true) {
    return undefined;
  }

  if (matches === undefined) {
    return {
      ...at,
      message: `The deckster range "${declared.range}" in ${shown} cannot be read.`,
      fix: `Write it as ${RANGE_RULE}.`,
    };
  }

  return {
    ...at,
    message:
      `The code layouts of ${owner.label} are written for deckster ${declared.range} ` +
      `(${shown}), and this is deckster ${installed}, so they are not loaded.`,
    fix:
      'Install a deckster version in that range, or check the layouts with this version ' +
      `(\`${deckCommand()} layouts\`) and widen the range in ${shown}.`,
  };
});

/**
 * The version range an owner declares: `undefined` when it declares none, and a range of
 * `undefined` when its `brand.json` cannot be read as one.
 *
 * @param owner - The brand or the deck.
 */
const declaredRange = Effect.fn('declaredRange')(function* (
  owner: Owner,
): Effect.fn.Return<{ range: string | undefined } | undefined, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(owner.versionFile)
    .pipe(Effect.orElseSucceed(() => undefined));
  if (text === undefined) {
    return undefined;
  }

  if (owner.kind === 'brand') {
    const manifest = Schema.decodeUnknownOption(BrandManifestJson)(text);
    if (Option.isNone(manifest)) {
      return { range: undefined };
    }

    return manifest.value.deckster === undefined ? undefined : { range: manifest.value.deckster };
  }

  const config = readStaticModule(text, DECK_CONFIG_CALLEE);
  const range: unknown =
    config.ok && Predicate.isObject(config.value) ? config.value.deckster : undefined;
  return typeof range === 'string' ? { range } : undefined;
});

/**
 * This deckster's version: the published version recorded in the framework folder when installed,
 * else the version in the repository's CLI package. `undefined` when neither can be read.
 */
const installedVersion = Effect.fn('installedVersion')(function* (): Effect.fn.Return<
  string | undefined,
  never,
  FileSystem.FileSystem
> {
  if (FRAMEWORK_INSTALLED) {
    return readFrameworkManifest(FRAMEWORK_ROOT)?.version;
  }

  const fs = yield* FileSystem.FileSystem;
  const text = yield* fs
    .readFileString(path.join(FRAMEWORK_ROOT, CLI_PACKAGE_FILE))
    .pipe(Effect.orElseSucceed(() => ''));
  return Option.getOrUndefined(Schema.decodeUnknownOption(VersionedJson)(text))?.version;
});
