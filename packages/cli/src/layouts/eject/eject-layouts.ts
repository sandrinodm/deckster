import type { BrandError } from '@deckster/brand';

import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { LIMIT_CASES } from '@deckster/kit/limit-cases';
import { BRAND_CODE_SOURCE_PREFIX, deckCatalog, type DeckBuildError } from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, type CliError, type FileSystemError } from '#cli-error.ts';
import { displayPath, findOwnerFolder, type OwnerFolder } from '#layouts/eject/eject-owner.ts';
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
import { writeFiles } from '#scaffold/write-files.ts';
import { cliVersion } from '#version.ts';

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
};

/**
 * Copies kit layouts into a brand's or a deck's `layouts/` as code layouts that replace them.
 *
 * Nothing is written unless everything can be: each name is a layout of the kit's catalog that the
 * owner has no folder for, the transform places every import, and every helper already in
 * `layouts/_shared/` is the same as the one this eject would write (or `keepShared` says to keep
 * the owner's). Each layout's folder gets its files and a `.eject/` folder recording what was
 * written; helpers are written to `layouts/_shared/` once and shared by every ejected layout.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck to eject into.
 * @param request - The layouts and options.
 * @returns What was written.
 * @throws CliError in the error channel for a name that is not safe, not a kit layout, taken, or
 *   not ejectable, and for a changed shared helper; BrandError | DeckBuildError when the brand or
 *   deck does not load; FileSystemError when a file cannot be written.
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
  const requested = request.names === 'all' ? [] : request.names;
  yield* Effect.forEach(requested, checkSafeName);
  const folder = yield* findOwnerFolder(root, owner);
  const source = yield* Effect.sync(() => readEjectSource(request.srcDir));
  yield* Effect.forEach(requested, (name) => checkKitLayout(source, name));
  const existing = yield* existingFolders(folder.layoutsDir, source.names);
  const names =
    request.names === 'all' ? source.names.filter((name) => !existing.has(name)) : requested;
  const taken = names.find((name) => existing.has(name));
  if (taken !== undefined) {
    const shown = displayPath(root, path.join(folder.layoutsDir, taken));
    return yield* cliError(
      `${shown}/ already exists, and eject does not overwrite a layout.\n` +
        `To see what the kit changed since it was ejected, run \`${deckCommand()} layouts diff ` +
        `${taken} --${owner.kind} ${owner.name}\`. To start over from the kit's layout, delete ` +
        'the folder first.',
    );
  }

  yield* checkNamesFree(root, folder, names);
  const ejected = yield* Effect.sync(() =>
    names.map((name) => transformLayout(source, name, LIMIT_CASES[name] ?? [])),
  );
  yield* checkPlaced(ejected);
  const shared = yield* planShared(root, folder, ejected, request.keepShared);
  const deckster = yield* cliVersion();
  const layouts: EjectedFolder[] = [];
  for (const layout of ejected) {
    const dir = path.join(folder.layoutsDir, layout.name);
    const files = yield* writeFiles(absolute(dir, layout.files));
    yield* writeFiles(absolute(path.join(dir, PROVENANCE_DIR), provenanceFiles(layout, deckster)));
    layouts.push({ name: layout.name, dir, files });
  }

  const sharedWritten = yield* writeFiles(shared.write);
  return {
    layouts,
    sharedWritten,
    sharedReused: shared.reused,
    sharedKept: shared.kept,
    skipped: request.names === 'all' ? source.names.filter((name) => existing.has(name)) : [],
  };
});

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
 * The names among the given ones that the owner's `layouts/` already has a folder or file for.
 */
const existingFolders = Effect.fn('existingFolders')(function* (
  layoutsDir: string,
  names: readonly string[],
): Effect.fn.Return<Set<string>, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* fs.readDirectory(layoutsDir).pipe(Effect.orElseSucceed(() => []));
  return new Set(entries.filter((entry) => names.includes(entry)));
});

/**
 * Fails when a name already means something else for the owner: a data layout of the brand, or, for
 * a deck, a code layout of its brand.
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
    if (index.get(name)?.source.startsWith(BRAND_SOURCE_PREFIX) === true) {
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
 * Sorts the shared helpers the layouts need into those to write, those already there unchanged and
 * those that differ; fails for the last unless they are to be kept.
 */
const planShared = Effect.fn('planShared')(function* (
  root: string,
  folder: OwnerFolder,
  ejected: readonly EjectedLayout[],
  keepShared: boolean,
): Effect.fn.Return<
  { write: Record<string, string>; reused: string[]; kept: string[] },
  CliError,
  FileSystem.FileSystem
> {
  const fs = yield* FileSystem.FileSystem;
  const wanted = Object.assign({}, ...ejected.map((layout) => layout.shared)) as Record<
    string,
    string
  >;
  const write: Record<string, string> = {};
  const reused: string[] = [];
  const kept: string[] = [];
  for (const [file, text] of Object.entries(wanted)) {
    const target = path.join(folder.layoutsDir, SHARED_DIR, file);
    const current = yield* fs.readFileString(target).pipe(Effect.orElseSucceed(() => undefined));
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
 * Keys a folder's files by absolute path; a path with `/` names a file in a subfolder.
 */
function absolute(dir: string, files: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([file, text]) => [path.join(dir, ...file.split('/')), text]),
  );
}
