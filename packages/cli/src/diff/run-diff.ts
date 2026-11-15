import type { Scope } from 'effect';
import type { ChildProcessSpawner } from 'effect/process';

import { deckCommand } from '@deckster/engine/command';
import { findDeck } from '@deckster/vite-plugin';
import { Effect, FileSystem } from 'effect';
import os from 'node:os';
import path from 'node:path';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { DiffReport } from '#diff/diff-report.ts';
import type { DeckServer } from '#server/deck-server.ts';
import type { ShotError, ShotResult } from '#shot/take-shots.ts';

import {
  cliError,
  fileSystemError,
  usageError,
  type CliError,
  type FileSystemError,
} from '#cli-error.ts';
import { checkoutRef } from '#diff/checkout-ref.ts';
import { compareShots, type CompareError } from '#diff/compare-shots.ts';
import { DEFAULT_BASELINE_DIR, deckFolder } from '#diff/diff-paths.ts';
import { buildReport } from '#diff/diff-report.ts';
import { isGitWorkTree } from '#diff/run-git.ts';
import { SlideComparer } from '#diff/slide-comparer.ts';
import { writeReport } from '#diff/write-report.ts';
import { takeShots } from '#shot/take-shots.ts';
import { Workspace } from '#workspace.ts';

/**
 * The git revision compared against when none is named.
 */
export const DEFAULT_BASE_REF = 'HEAD';

/**
 * What to compare and where to write the report.
 */
export type DiffOptions = {
  /**
   * The deck folder name.
   */
  deck: string;

  /**
   * A brand folder that replaces the deck config's `brand`; `undefined` keeps the deck's own.
   */
  brand: string | undefined;

  /**
   * A folder of baseline pictures or a git ref; `undefined` picks `HEAD` in a git repository.
   */
  base: string | undefined;

  /**
   * Compare every step instead of each slide's finished state.
   */
  steps: boolean;

  /**
   * A picture counts as changed when its share of changed pixels is above this, from 0 to 1.
   */
  threshold: number;

  /**
   * The absolute report folder.
   */
  outDir: string;
};

/**
 * What to compare against, once resolved.
 */
type ResolvedBase =
  | {
      /**
       * A folder of pictures made by `deck shot`.
       */
      kind: 'dir';

      /**
       * The absolute folder.
       */
      dir: string;
    }
  | {
      /**
       * A git revision.
       */
      kind: 'ref';

      /**
       * The branch, tag or commit.
       */
      ref: string;
    };

/**
 * The services a diff needs.
 */
export type DiffServices =
  | Workspace
  | FileSystem.FileSystem
  | DeckServer
  | DeckBrowser
  | SlideComparer
  | ChildProcessSpawner.ChildProcessSpawner
  | Scope.Scope;

/**
 * Every way a diff can fail.
 */
export type DiffError = ShotError | CompareError | CliError | FileSystemError;

/**
 * Renders the deck now and at the base, compares the slides picture by picture and writes the
 * report folder (`index.html`, `summary.md`, `report.json` and the pictures of what differs). The
 * base is a folder of pictures from `deck shot`, or a git revision, which is extracted to a
 * temporary folder, rendered there with the workspace's installed dependencies and deleted when the
 * scope closes.
 *
 * @param options - What to compare and where to write.
 * @returns The report, with absolute picture paths.
 * @throws CliError in the error channel when no base can be chosen or it is not usable; the errors
 *   of rendering the deck at either revision; FileSystemError when the report cannot be written.
 */
export const runDiff = Effect.fn('runDiff')(function* (
  options: DiffOptions,
): Effect.fn.Return<DiffReport, DiffError, DiffServices> {
  const fs = yield* FileSystem.FileSystem;
  const { root } = yield* Workspace;
  yield* findDeck(root, options.deck);
  const base = yield* resolveBase(root, options);
  const work = yield* fs
    .makeTempDirectoryScoped({ prefix: 'deck-diff-' })
    .pipe(
      Effect.mapError((error) =>
        fileSystemError(
          'create a temporary folder in',
          os.tmpdir(),
          error,
          'Free some disk space and run the command again.',
        ),
      ),
    );
  const afterDir = path.join(work, 'after');
  const now = yield* shoot(options, afterDir, undefined);
  yield* assertRenders(options.deck, now, 'now');
  const beforeDir = yield* baseShots(options, base, root, path.join(work, 'before'));
  const slides = yield* compareShots({
    beforeDir,
    afterDir,
    outDir: options.outDir,
    steps: options.steps,
    threshold: options.threshold,
  });
  const report = buildReport(
    {
      deck: options.deck,
      brand: now.brand,
      base: base.kind === 'dir' ? base.dir : base.ref,
      baseKind: base.kind === 'dir' ? 'dir' : 'ref',
      steps: options.steps,
      threshold: options.threshold,
      outDir: options.outDir,
    },
    slides,
  );
  yield* writeReport(report);
  return report;
}, Effect.scoped);

/**
 * Renders the deck into a folder.
 *
 * @param options - The deck, brand and steps.
 * @param outDir - The folder for the pictures.
 * @param workspaceRoot - Render from this workspace instead of the current one.
 */
export const shoot = Effect.fn('shoot')(function* (
  options: Pick<DiffOptions, 'deck' | 'brand' | 'steps'>,
  outDir: string,
  workspaceRoot: string | undefined,
): Effect.fn.Return<
  ShotResult,
  ShotError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser
> {
  return yield* takeShots({
    deck: options.deck,
    slide: undefined,
    brand: options.brand,
    steps: options.steps,
    outDir,
    scale: 1,
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  });
});

/**
 * The folder of base pictures: the baseline folder itself, or a fresh render of the deck at the git
 * revision. `null` when the revision has no such deck.
 *
 * @param options - The deck, brand and steps.
 * @param base - What to compare against.
 * @param root - The current workspace root.
 * @param shotsDir - Where to put pictures rendered from a revision.
 */
const baseShots = Effect.fn('baseShots')(function* (
  options: DiffOptions,
  base: ResolvedBase,
  root: string,
  shotsDir: string,
): Effect.fn.Return<
  string | null,
  DiffError,
  | Workspace
  | FileSystem.FileSystem
  | DeckServer
  | DeckBrowser
  | ChildProcessSpawner.ChildProcessSpawner
  | Scope.Scope
> {
  if (base.kind === 'dir') {
    return base.dir;
  }

  const checkout = yield* checkoutRef(root, base.ref);
  const hasDeck = yield* findDeck(checkout, options.deck).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );
  if (!hasDeck) {
    return null;
  }

  yield* assertRenders(options.deck, yield* shoot(options, shotsDir, checkout), `at ${base.ref}`);
  return shotsDir;
});

/**
 * Chooses what to compare against: a folder that exists, else a git ref; with no `--base`, `HEAD`
 * in a git repository, else the baseline folder `--save-baseline` writes if it exists.
 *
 * @param root - The workspace root.
 * @param options - The deck, brand and `--base`.
 * @throws CliError in the error channel when nothing can be compared against.
 */
const resolveBase = Effect.fn('resolveBase')(function* (
  root: string,
  options: Pick<DiffOptions, 'deck' | 'brand' | 'base'>,
): Effect.fn.Return<
  ResolvedBase,
  CliError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> {
  const git = yield* isGitWorkTree(root);
  if (options.base !== undefined) {
    return yield* resolveNamedBase(root, options.deck, options.base, git);
  }

  if (git) {
    return { kind: 'ref', ref: DEFAULT_BASE_REF };
  }

  return yield* resolveSavedBaseline(root, options.deck, options.brand);
});

/**
 * Resolves `--base`: a folder when one exists at that path, else a git ref when the workspace is a
 * repository.
 *
 * @param root - The workspace root.
 * @param deck - The deck folder name, for the usage error.
 * @param base - The `--base` value.
 * @param git - Whether the workspace is inside a git work tree.
 * @throws CliError (usage) in the error channel when the value is neither a folder nor a ref.
 */
const resolveNamedBase = Effect.fn('resolveNamedBase')(function* (
  root: string,
  deck: string,
  base: string,
  git: boolean,
): Effect.fn.Return<ResolvedBase, CliError, FileSystem.FileSystem> {
  const dir = path.resolve(root, base);
  if (yield* isDirectory(dir)) {
    return { kind: 'dir', dir };
  }

  if (git) {
    return { kind: 'ref', ref: base };
  }

  return yield* usageError(
    `--base "${base}" is not a folder, and this workspace is not a git repository, ` +
      'so it cannot be a ref.\n' +
      `Make baseline pictures with \`deck shot ${deck} --out <dir>\` and pass that folder.`,
    'diff',
  );
});

/**
 * Resolves the default base of a workspace that is not a git repository: the baseline folder
 * `--save-baseline` writes, when it exists.
 *
 * @param root - The workspace root.
 * @param deck - The deck folder name.
 * @param brand - The `--brand` value, if any.
 * @throws CliError (usage) in the error channel when there is no baseline folder.
 */
const resolveSavedBaseline = Effect.fn('resolveSavedBaseline')(function* (
  root: string,
  deck: string,
  brand: string | undefined,
): Effect.fn.Return<ResolvedBase, CliError, FileSystem.FileSystem> {
  const saved = path.resolve(root, deckFolder(DEFAULT_BASELINE_DIR, deck, brand));
  if (yield* isDirectory(saved)) {
    return { kind: 'dir', dir: saved };
  }

  return yield* usageError(
    'This workspace is not a git repository, so there is no revision to compare against.\n' +
      `Save a baseline with \`deck diff ${deck} --save-baseline\` (or make one with ` +
      `\`deck shot ${deck} --out <dir>\`), change the deck, then run ` +
      `\`deck diff ${deck}\` (or \`deck diff ${deck} --base <dir>\`).`,
    'diff',
  );
});

/**
 * Whether a path is a folder. A path that cannot be read is not one.
 *
 * @param dir - The absolute path.
 */
const isDirectory = Effect.fn('isDirectory')(function* (
  dir: string,
): Effect.fn.Return<boolean, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.stat(dir).pipe(
    Effect.map((info) => info.type === 'Directory'),
    Effect.orElseSucceed(() => false),
  );
});

/**
 * Renders the deck into the baseline folder, replacing the pictures of an earlier baseline.
 *
 * @param options - The deck, brand and steps.
 * @param dir - The absolute baseline folder.
 * @throws CliError in the error channel when the deck has errors that make the baseline useless.
 */
export const saveBaseline = Effect.fn('saveBaseline')(function* (
  options: Pick<DiffOptions, 'deck' | 'brand' | 'steps'>,
  dir: string,
): Effect.fn.Return<
  ShotResult,
  DiffError,
  Workspace | FileSystem.FileSystem | DeckServer | DeckBrowser
> {
  const result = yield* shoot(options, dir, undefined);
  yield* assertRenders(options.deck, result, 'for the baseline');
  return result;
});

/**
 * Fails when a render is not trustworthy: the page threw while the deck loaded, or a slide shows an
 * error. Comparing it, or saving it as a baseline, would hide the problem.
 *
 * @param deck - The deck folder name.
 * @param result - What the render wrote and which errors it saw.
 * @param when - Which render this is, such as `now` or `at HEAD`, for the message.
 * @throws CliError in the error channel when the render has errors.
 */
const assertRenders = Effect.fn('assertRenders')(function* (
  deck: string,
  result: ShotResult,
  when: string,
): Effect.fn.Return<void, CliError> {
  const broken = result.files.filter((file) => file.error !== null);
  if (broken.length === 0 && result.pageErrors.length === 0) {
    return;
  }

  const lines = [
    ...result.pageErrors.map((error) => `the page threw while the deck loaded: ${error}`),
    ...broken.map((file) => `slide ${file.number} "${file.slide}" shows an error: ${file.error}`),
  ];
  return yield* cliError(
    `Deck "${deck}" does not render cleanly ${when}, so a comparison or baseline would hide it:\n` +
      `${lines.map((line) => `  ${line}`).join('\n')}\n` +
      `Run \`${deckCommand()} lint ${deck}\`, fix the problems and run the command again.`,
  );
});
