import type { BrandError } from '@deckster/brand';
import type { DeckBuildError } from '@deckster/vite-plugin';

import { isSafeName, SAFE_NAME_RULE } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { LIMIT_CASES } from '@deckster/kit/limit-cases';
import { Effect, FileSystem } from 'effect';
import path from 'node:path';

import type { LayoutsOwner } from '#layouts/layouts-owner.ts';

import { cliError, type CliError } from '#cli-error.ts';
import { displayPath, findOwnerFolder } from '#layouts/eject/eject-owner.ts';
import { readEjectSource, transformLayout } from '#layouts/eject/eject-transform.ts';
import { PROVENANCE_DIR, provenancePaths, readProvenance } from '#layouts/eject/provenance.ts';
import { unifiedDiff } from '#layouts/eject/unified-diff.ts';
import { cliVersion } from '#version.ts';

/**
 * How one file of an ejected layout compares with what the kit gives today.
 */
export type FileChange = {
  /**
   * The file's provenance path: a file of the layout by name, a helper as `_shared/<file>`.
   */
  readonly path: string;

  /**
   * `changed` when the kit's file differs from the ejected one, `added` when the kit's layout now
   * needs a file it did not, `removed` when it needs one less, `unchanged` otherwise.
   */
  readonly status: 'unchanged' | 'changed' | 'added' | 'removed';

  /**
   * The unified diff from the ejected file to the kit's; empty when unchanged.
   */
  readonly diff: string;
};

/**
 * What the kit changed in a layout since it was ejected.
 */
export type LayoutDiff = {
  /**
   * The layout's name.
   */
  readonly layout: string;

  /**
   * The layout's folder, relative to the workspace.
   */
  readonly dir: string;

  /**
   * The version of the CLI that ejected the layout.
   */
  readonly ejectedWith: string;

  /**
   * The version of the running CLI, whose kit it is compared with.
   */
  readonly current: string;

  /**
   * Whether any file changed, was added or was removed.
   */
  readonly changed: boolean;

  /**
   * Every file of the eject then and now, sorted by path.
   */
  readonly files: readonly FileChange[];

  /**
   * Why the kit's layout does not eject cleanly, such as a private import the transform cannot
   * place; empty when it does. The diff is still what the transform produced.
   */
  readonly problems: readonly string[];

  /**
   * The files under `.eject/` that are missing or were changed after the eject, so the diff for
   * them does not start from what was ejected.
   */
  readonly provenanceEdited: readonly string[];
};

/**
 * Options of {@link diffLayout}.
 */
export type DiffOptions = {
  /**
   * The kit's `src` folder to compare with; the running CLI's unless a test passes a copy.
   */
  readonly srcDir?: string;
};

/**
 * Compares an ejected layout's starting point with what ejecting it today would give: it runs the
 * eject transform on the kit's current files and diffs the result against the files recorded in the
 * layout's `.eject/` folder. The layout's own edits play no part, and nothing is written.
 *
 * @param root - The absolute workspace root.
 * @param owner - The brand or deck that holds the layout.
 * @param name - The layout.
 * @param options - Where the kit's source is.
 * @returns The kit's changes, file by file.
 * @throws CliError in the error channel when the name is not safe or the layout has no provenance
 *   record; BrandError | DeckBuildError when the brand or deck does not load.
 */
export const diffLayout = Effect.fn('diffLayout')(function* (
  root: string,
  owner: LayoutsOwner,
  name: string,
  options: DiffOptions = {},
): Effect.fn.Return<LayoutDiff, BrandError | CliError | DeckBuildError, FileSystem.FileSystem> {
  if (!isSafeName(name)) {
    return yield* cliError(
      `"${name}" is not a layout name: a layout is named by its folder, in ${SAFE_NAME_RULE}.\n` +
        `Name an ejected layout, as in \`${deckCommand()} layouts diff title --brand acme\`.`,
    );
  }

  const folder = yield* findOwnerFolder(root, owner);
  const dir = path.join(folder.layoutsDir, name);
  const shown = displayPath(root, dir);
  const stored = yield* readProvenance(dir, shown);
  const today = yield* Effect.sync(() => {
    const source = readEjectSource(options.srcDir);
    return transformLayout(source, stored.record.layout, LIMIT_CASES[stored.record.layout] ?? []);
  });
  const now = provenancePaths(today);
  const paths = [...new Set([...Object.keys(stored.record.files), ...Object.keys(now)])].sort();
  const files = paths.map((file) => fileChange(file, shown, stored.files[file], now[file]));
  return {
    layout: name,
    dir: shown,
    ejectedWith: stored.record.deckster,
    current: yield* cliVersion(),
    changed: files.some((file) => file.status !== 'unchanged'),
    files,
    problems: today.problems,
    provenanceEdited: stored.changed,
  };
});

/**
 * Compares one file as it was ejected with the kit's file today.
 */
function fileChange(
  file: string,
  dir: string,
  before: string | undefined,
  after: string | undefined,
): FileChange {
  const diff = unifiedDiff(before ?? '', after ?? '', {
    before: before === undefined ? '/dev/null' : `${dir}/${PROVENANCE_DIR}/${file}`,
    after: after === undefined ? '/dev/null' : `kit/${file}`,
  });
  if (before === undefined && after !== undefined) {
    return { path: file, status: 'added', diff };
  }

  if (after === undefined) {
    return { path: file, status: 'removed', diff };
  }

  return { path: file, status: diff === '' ? 'unchanged' : 'changed', diff };
}
