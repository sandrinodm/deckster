import type { BrandError } from '@deckster/brand';

import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { LIMIT_CASES, type LimitCase } from '@deckster/kit/limit-cases';
import {
  BRAND_CODE_SOURCE_PREFIX,
  CONTRACT_FILE,
  deckCatalog,
  type DeckBuildError,
} from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, fileSystemError, type CliError, type FileSystemError } from '#cli-error.ts';
import {
  checkDeckLayoutsFree,
  checkWriteTargets,
  displayPath,
  existingEntries,
  findDeckClashes,
  findOwnerFolder,
  type OwnerFolder,
} from '#layouts/eject/eject-owner.ts';
import {
  DATA_LAYOUT_RENDERER,
  readEjectSource,
  SHARED_DIR,
  transformLayout,
  type EjectedLayout,
  type EjectSource,
} from '#layouts/eject/eject-transform.ts';
import { PROVENANCE_DIR, provenanceFiles } from '#layouts/eject/provenance.ts';
import { BRAND_SOURCE_PREFIX } from '#layouts/list-layouts.ts';
import { nearestName } from '#lint/rules/nearest-name.ts';
import { createNewDirectory, writeNewFiles } from '#scaffold/write-files.ts';
import { cliVersion } from '#version.ts';

/**
 * The fix for a shared helper that exists but cannot be read.
 */
const UNREADABLE_HELPER_FIX =
  "Eject does not overwrite a helper it cannot compare with the kit's. Make the file readable, " +
  'then run the command again. Nothing was written.';

/**
 * What `deckster layouts eject` is asked to do.
 */
export type EjectRequest = {
  /**
   * The kit layouts to eject, or `all` for every layout of the catalog that the owner has no folder
   * for yet.
   */
  readonly names: readonly string[] | 'all';

  /**
   * Whether a helper in `layouts/_shared/` that differs from the kit's is kept as it is. Without
   * it, such a helper stops the eject.
   */
  readonly keepShared: boolean;

  /**
   * The kit's `src` folder to eject from; the running CLI's unless a test passes a copy.
   */
  readonly srcDir?: string;
};

/**
 * One layout `deckster layouts eject` wrote.
 */
export type EjectedFolder = {
  /**
   * The layout's name.
   */
  readonly name: string;

  /**
   * The absolute path of its folder.
   */
  readonly dir: string;

  /**
   * The absolute paths of the files written into it, without the provenance folder's.
   */
  readonly files: readonly string[];
};

/**
 * What `deckster layouts eject` did.
 */
export type EjectResult = {
  /**
   * The layouts written, in the order asked for (catalog order for `all`).
   */
  readonly layouts: readonly EjectedFolder[];

  /**
   * The absolute paths of the shared helpers written to `layouts/_shared/`.
   */
  readonly sharedWritten: readonly string[];

  /**
   * The absolute paths of the shared helpers that were there already, the same as the kit's.
   */
  readonly sharedReused: readonly string[];

  /**
   * The absolute paths of the shared helpers that differ from the kit's and were kept
   * (`keepShared`).
   */
  readonly sharedKept: readonly string[];

  /**
   * With `all`, the layouts left out because the owner already has a folder of that name.
   */
  readonly skipped: readonly string[];

  /**
   * With `all`, the layouts left out because a deck of the brand has a layout folder of that name,
   * which a brand layout would clash with, each with the deck.
   */
  readonly skippedForDecks: readonly SkippedForDeck[];
};

/**
 * A layout `all` left out because a deck of the brand has a folder of its name.
 */
export type SkippedForDeck = {
  /**
   * The layout's name.
   */
  readonly name: string;

  /**
   * The deck's id.
   */
  readonly deck: string;
};

/**
 * Copies kit layouts into a brand's or a deck's `layouts/` as code layouts that replace them.
 *
 * Nothing is written unless everything can be: each name is a layout of the kit's catalog that the
 * owner has no folder for (in any letter case) and, for a brand, that none of the brand's decks has
 * a layout folder of (with `all`, a name a deck has is left out and listed instead), a name asked
 * for twice counts once, the transform places every import, no path to write runs through a link,
 * and every helper already in `layouts/_shared/` is the same as the one this eject would write (or
 * `keepShared` says to keep the owner's). Each layout's folder gets its files and a `.eject/`
 * folder recording what was written; helpers are written to `layouts/_shared/` once and shared by
 * every ejected layout. Every file is created new, and a write that fails midway removes what this
 * run created, the `layouts/` folder included when this run made it.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck to eject into.
 * @param request - The layouts and options.
 * @returns What was written.
 * @throws CliError in the error channel for a name that is not safe, not a kit layout, taken, or
 *   not ejectable, for a link on the way to a file, and for a changed shared helper; BrandError |
 *   DeckBuildError when the brand or deck does not load; FileSystemError when a helper cannot be
 *   read or a file cannot be written.
 */
export const ejectLayouts = Effect.fn('ejectLayouts')(function* (
  root: string,
  owner: LayoutsOwner,
  request: EjectRequest,
): Effect.fn.Return<
  EjectResult,
  BrandError | CliError | DeckBuildError | FileSystemError,
  FileSystem.FileSystem
> {
  const requested = request.names === 'all' ? [] : [...new Set(request.names)];
  yield* Effect.forEach(requested, checkSafeName);
  const folder = yield* findOwnerFolder(root, owner);
  const source = yield* Effect.sync(() => readEjectSource(request.srcDir));
  yield* Effect.forEach(requested, (name) => checkKitLayout(source, name));
  const existing = yield* existingEntries(folder.layoutsDir, source.names);
  const unowned =
    request.names === 'all' ? source.names.filter((name) => !existing.has(name)) : requested;
  const clashes = request.names === 'all' ? yield* findDeckClashes(root, folder, unowned) : [];
  const clashing = new Set(clashes.map((clash) => clash.name));
  const names = unowned.filter((name) => !clashing.has(name));
  const taken = names.find((name) => existing.has(name));
  if (taken !== undefined) {
    const shown = displayPath(root, path.join(folder.layoutsDir, existing.get(taken) ?? taken));
    return yield* cliError(
      `${shown}/ already exists, and eject does not overwrite a layout.\n` +
        `To see what the kit changed since it was ejected, run \`${deckCommand()} layouts diff ` +
        `${taken} --${owner.kind} ${owner.name}\`. To start over from the kit's layout, delete ` +
        'the folder first.',
    );
  }

  yield* checkNamesFree(root, folder, names);
  if (request.names !== 'all') {
    yield* checkDeckLayoutsFree(root, folder, names);
  }

  const ejected = yield* Effect.sync(() =>
    names.map((name) => transformLayout(source, name, limitCasesOf(name), owner.kind)),
  );
  yield* checkPlaced(ejected);
  const helpers = sharedHelpers(folder, ejected);
  const layoutDirs = names.map((name) => path.join(folder.layoutsDir, name));
  yield* checkWriteTargets(root, folder, [...layoutDirs, ...Object.keys(helpers)]);
  const shared = yield* planShared(root, folder, helpers, request.keepShared);
  const deckster = yield* cliVersion();
  const written = yield* writeEjected(folder, ejected, shared.write, deckster);
  return {
    ...written,
    sharedReused: shared.reused,
    sharedKept: shared.kept,
    skipped: request.names === 'all' ? source.names.filter((name) => existing.has(name)) : [],
    skippedForDecks: clashes.map((clash) => ({ name: clash.name, deck: clash.deck.id })),
  };
});

/**
 * The kit's limit cases of a layout, read as the layout's own entry only: a name such as
 * `constructor` gets none rather than something from the object's prototype.
 */
function limitCasesOf(name: string): readonly LimitCase[] {
  return Object.hasOwn(LIMIT_CASES, name) ? (LIMIT_CASES[name] ?? []) : [];
}

/**
 * Fails for a name that cannot be a layout folder.
 */
function checkSafeName(name: string): Effect.Effect<void, CliError> {
  if (isSafeName(name)) {
    return Effect.void;
  }

  return Effect.fail(
    cliError(
      `"${name}" is not a layout name: a layout is named by its folder, in ${SAFE_NAME_RULE}.\n` +
        `Name a layout of the kit, such as \`title\`; \`${deckCommand()} layouts\` lists them.`,
    ),
  );
}

/**
 * Fails for a name that is not a layout of the kit's catalog, with the closest name that is.
 */
function checkKitLayout(source: EjectSource, name: string): Effect.Effect<void, CliError> {
  if (source.names.includes(name)) {
    return Effect.void;
  }

  if (name === DATA_LAYOUT_RENDERER) {
    return Effect.fail(
      cliError(
        `"${DATA_LAYOUT_RENDERER}" is the renderer of a brand's data layouts (layouts.ts), not a ` +
          'layout a slide names, so it cannot be ejected.\n' +
          "To change one data layout, edit it in the brand's layouts.ts; to write a layout in " +
          `code, run \`${deckCommand()} layouts new <name> --brand <brand>\`.`,
      ),
    );
  }

  const closest = nearestName(name, source.names);
  return Effect.fail(
    cliError(
      `"${name}" is not a layout of the kit, so there is nothing to eject.\n` +
        (closest === undefined ? '' : `Did you mean "${closest}"? `) +
        `\`${deckCommand()} layouts\` lists the layouts; only those with the source ` +
        '@deckster/kit can be ejected.',
    ),
  );
}

/**
 * Fails when a name already means something else for the owner: a data layout of the brand (also
 * one the catalog leaves out because its fallback is a code layout that is not loaded), or, for a
 * deck, a code layout of its brand.
 */
const checkNamesFree = Effect.fn('checkNamesFree')(function* (
  root: string,
  folder: OwnerFolder,
  names: readonly string[],
): Effect.fn.Return<void, CliError | DeckBuildError, FileSystem.FileSystem> {
  const { brand, deck } = folder;
  const { index, local } = yield* deckCatalog({ root, brand, deck, code: 'skip' });
  const brandCode = `${BRAND_CODE_SOURCE_PREFIX}${brand.tokens.name}`;
  for (const name of names) {
    const isBrandDataLayout =
      index.get(name)?.source.startsWith(BRAND_SOURCE_PREFIX) === true ||
      brand.tokens.layouts.some((layout) => layout.name === name);
    if (isBrandDataLayout) {
      return yield* cliError(
        `"${name}" is a data layout of the ${brand.tokens.name} brand (its layouts.ts), so a ` +
          'code layout of that name would clash with it.\n' +
          'Remove or rename the data layout first: one brand gives a name one meaning.',
      );
    }

    const code = local.layouts.find(
      (layout) => layout.name === name && layout.source === brandCode,
    );
    if (code !== undefined && deck !== undefined) {
      return yield* cliError(
        `The ${brand.tokens.name} brand already replaces "${name}" ` +
          `(${displayPath(root, code.contractFile)}), and a deck cannot replace a layout of its ` +
          'brand.\n' +
          "Change the brand's layout, or give the deck a layout with a new name: " +
          `\`${deckCommand()} layouts new <name> --deck ${deck.id}\`.`,
      );
    }
  }
});

/**
 * Fails when the transform could not make a layout a working copy.
 */
function checkPlaced(ejected: readonly EjectedLayout[]): Effect.Effect<void, CliError> {
  const broken = ejected.filter((layout) => layout.problems.length > 0);
  if (broken.length === 0) {
    return Effect.void;
  }

  const lines = broken.flatMap((layout) =>
    layout.problems.map((problem) => `  ${layout.name}: ${problem}`),
  );
  return Effect.fail(
    cliError(
      `The kit's source does not eject cleanly:\n${lines.join('\n')}\n` +
        'This is a bug in deckster, not in your workspace: nothing was written. Report it with ' +
        'the message above, and eject the other layouts on their own meanwhile.',
    ),
  );
}

/**
 * The shared helpers the layouts need, by absolute path in the owner's `layouts/_shared/`.
 */
function sharedHelpers(
  folder: OwnerFolder,
  ejected: readonly EjectedLayout[],
): Record<string, string> {
  const helpers: Record<string, string> = {};
  for (const layout of ejected) {
    for (const [file, text] of Object.entries(layout.shared)) {
      helpers[path.join(folder.layoutsDir, SHARED_DIR, file)] = text;
    }
  }

  return helpers;
}

/**
 * Sorts the shared helpers the layouts need into those to write, those already there unchanged and
 * those that differ; fails for the last unless they are to be kept. Only a missing helper counts as
 * absent: one that cannot be read stops the eject rather than being overwritten.
 */
const planShared = Effect.fn('planShared')(function* (
  root: string,
  folder: OwnerFolder,
  helpers: Readonly<Record<string, string>>,
  keepShared: boolean,
): Effect.fn.Return<
  { write: Record<string, string>; reused: string[]; kept: string[] },
  CliError | FileSystemError,
  FileSystem.FileSystem
> {
  const write: Record<string, string> = {};
  const reused: string[] = [];
  const kept: string[] = [];
  for (const [target, text] of Object.entries(helpers)) {
    const current = yield* readHelper(target);
    if (current === undefined) {
      write[target] = text;
    } else if (current === text) {
      reused.push(target);
    } else {
      kept.push(target);
    }
  }

  if (kept.length === 0 || keepShared) {
    return { write, reused, kept };
  }

  const { owner } = folder;
  return yield* cliError(
    `${kept.map((file) => displayPath(root, file)).join(', ')} ` +
      `${kept.length === 1 ? 'differs' : 'differ'} from the helper this eject would write: it ` +
      'was edited, or an earlier deckster wrote it. Layouts share these helpers, and eject does ' +
      'not overwrite them.\n' +
      'Pass `--keep-shared` to keep your version, which the new layout then uses as well; or ' +
      `restore the helper first (\`${deckCommand()} layouts diff <name> --${owner.kind} ` +
      `${owner.name}\` on a layout that uses it shows the kit's version). Nothing was written.`,
  );
});

/**
 * A shared helper's text; `undefined` when there is no file at its path.
 */
const readHelper = Effect.fn('readHelper')(function* (
  target: string,
): Effect.fn.Return<string | undefined, FileSystemError, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .readFileString(target)
    .pipe(
      Effect.catch((error) =>
        error.reason._tag === 'NotFound'
          ? Effect.succeed(undefined)
          : Effect.fail(fileSystemError('read', target, error, UNREADABLE_HELPER_FIX)),
      ),
    );
});

/**
 * Writes the shared helpers, then each layout: its folder, created exclusively, its `.eject/`
 * record and its files with `contract.ts` last, since the contract is what makes a folder a
 * replacement. Every file is new, so nothing is written through a link or over a file another
 * command wrote meanwhile. When any write fails, the folders and helpers this run created are
 * removed again, so a retry starts from where the eject began.
 */
const writeEjected = Effect.fn('writeEjected')(function* (
  folder: OwnerFolder,
  ejected: readonly EjectedLayout[],
  helpers: Readonly<Record<string, string>>,
  deckster: string,
): Effect.fn.Return<
  Pick<EjectResult, 'layouts' | 'sharedWritten'>,
  FileSystemError,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem;
  const created: string[] = [];
  const parents = yield* missingParents(folder);
  const write = Effect.gen(function* () {
    for (const [file, text] of Object.entries(helpers)) {
      yield* writeNewFiles({ [file]: text });
      created.push(file);
    }

    const layouts: EjectedFolder[] = [];
    for (const layout of ejected) {
      const dir = path.join(folder.layoutsDir, layout.name);
      yield* createNewDirectory(dir);
      created.push(dir);
      const record = provenanceFiles(layout, deckster);
      yield* writeNewFiles(absolute(path.join(dir, PROVENANCE_DIR), record));
      const files = absolute(dir, layout.files);
      yield* writeNewFiles(contractLast(files));
      layouts.push({ name: layout.name, dir, files: Object.keys(files) });
    }

    return { layouts, sharedWritten: Object.keys(helpers) };
  });
  const undo = Effect.suspend(() =>
    Effect.forEach(created.toReversed(), (file) =>
      fs.remove(file, { recursive: true, force: true }).pipe(Effect.ignore),
    ).pipe(Effect.andThen(Effect.forEach(parents, removeIfEmpty))),
  );
  return yield* write.pipe(Effect.onError(() => undo));
});

/**
 * The folders a write needs that do not exist yet, innermost first: `layouts/_shared/` and
 * `layouts/`. A failed run removes them again when it left them empty.
 */
const missingParents = Effect.fn('missingParents')(function* (
  folder: OwnerFolder,
): Effect.fn.Return<string[], never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const missing: string[] = [];
  for (const dir of [folder.layoutsDir, path.join(folder.layoutsDir, SHARED_DIR)]) {
    const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => true));
    if (!exists) {
      missing.push(dir);
    }
  }

  return missing.toReversed();
});

/**
 * Removes a folder this run made when nothing is in it; a folder with files in it, such as one
 * another command wrote into meanwhile, is left alone.
 */
const removeIfEmpty = Effect.fn('removeIfEmpty')(function* (dir: string) {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => ['kept']));
  if (entries.length === 0) {
    yield* fs.remove(dir, { recursive: true }).pipe(Effect.ignore);
  }
});

/**
 * The same files with the contract moved to the end, the order they are written in.
 */
function contractLast(files: Readonly<Record<string, string>>): Record<string, string> {
  const entries = Object.entries(files);
  /**
   * Whether a file is the layout's contract.
   */
  const isContract = ([file]: [string, string]): boolean => path.basename(file) === CONTRACT_FILE;
  return Object.fromEntries([
    ...entries.filter((entry) => !isContract(entry)),
    ...entries.filter(isContract),
  ]);
}

/**
 * Keys a folder's files by absolute path; a path with `/` names a file in a subfolder.
 */
function absolute(dir: string, files: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([file, text]) => [path.join(dir, ...file.split('/')), text]),
  );
}
