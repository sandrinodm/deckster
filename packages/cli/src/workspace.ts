import { FRAMEWORK_INSTALLED, FRAMEWORK_ROOT } from '@deckster/brand/node';
import * as NodeFileSystem from '@effect/platform-node/NodeFileSystem';
import { Config, Console, Context, Effect, FileSystem, Layer, Option } from 'effect';
import os from 'node:os';
import path from 'node:path';

import { cliError, type CliError } from '#cli-error.ts';

/**
 * The deck `preview`, `present`, `layouts` and `mcp` use when no deck is named and `DECK` is unset.
 */
export const DEFAULT_DECK = 'hello';

/**
 * The environment variable that names the workspace folder, for running `deck` from outside it.
 */
export const WORKSPACE_ENV = 'DECK_ROOT';

/**
 * The folder every workspace has, which marks a folder as one.
 */
const DECKS_DIR = 'decks';

/**
 * The workspace root as an environment variable gives it. An empty value counts as unset.
 */
const ROOT_FROM_ENV = Config.option(Config.String(WORKSPACE_ENV));

/**
 * The folder `deck shot` writes to by default, relative to the workspace root.
 */
export const DEFAULT_SHOT_DIR = path.join('.deck', 'shots');

/**
 * The logical slide size in canvas pixels, which every screenshot and lint check assumes.
 */
export const CANVAS_SIZE = {
  /**
   * The canvas width in canvas pixels.
   */
  width: 1920,

  /**
   * The canvas height in canvas pixels.
   */
  height: 1080,
} as const;

/**
 * The workspace a command works in: the folder with `decks/`, `brands/` and `packages/`. Tests
 * provide a scratch workspace instead of the real one.
 */
export class Workspace extends Context.Service<
  Workspace,
  {
    /**
     * The absolute workspace root.
     */
    readonly root: string;
  }
>()('cli/Workspace') {
  /**
   * The workspace the command runs in: `DECK_ROOT` when set, else the nearest folder at or above
   * the current one that contains `decks/`. When there is none, a published CLI works in the
   * current folder (so `deck new talk` can start a workspace) and the repository checkout works in
   * itself. A home folder or the filesystem root is never chosen implicitly, and a published CLI
   * says on standard error when the workspace is not the current folder.
   */
  static readonly layer: Layer.Layer<Workspace, CliError> = Layer.effect(
    Workspace,
    Effect.suspend(() => {
      const cwd = process.cwd();
      return discoverWorkspace(cwd).pipe(
        Effect.tap((root) =>
          FRAMEWORK_INSTALLED && root !== cwd
            ? Console.error(`Using the workspace ${root}`)
            : Effect.void,
        ),
        Effect.map((root) => Workspace.of({ root })),
      );
    }),
  ).pipe(Layer.provide(NodeFileSystem.layer));

  /**
   * A workspace at another folder, such as a test's scratch folder.
   *
   * @param root - The absolute workspace root.
   */
  static at(root: string): Layer.Layer<Workspace> {
    return Layer.succeed(Workspace, Workspace.of({ root }));
  }
}

/**
 * Finds the workspace for a folder.
 *
 * @param cwd - The absolute folder the command runs in.
 * @param home - The user's home folder, which is never an implicit workspace.
 * @returns The absolute workspace root with symbolic links resolved when it exists; see
 *   {@link Workspace.layer} for the rules. If the path cannot be resolved, keeps the absolute path
 *   so commands can create a workspace or report their own file system errors.
 * @throws CliError in the error channel when the implicit choice is the home folder or the
 *   filesystem root; a `DECK_ROOT` naming either is taken as meant.
 */
export const discoverWorkspace = Effect.fn('discoverWorkspace')(function* (
  cwd: string,
  home: string = os.homedir(),
): Effect.fn.Return<string, CliError, FileSystem.FileSystem> {
  const fromEnv = yield* Effect.orElseSucceed(ROOT_FROM_ENV, () => Option.none<string>());
  if (Option.isSome(fromEnv) && fromEnv.value !== '') {
    return yield* canonicalPath(path.resolve(cwd, fromEnv.value));
  }

  const fs = yield* FileSystem.FileSystem;
  const canonicalHome = yield* canonicalPath(home);
  for (let dir = cwd; ; dir = path.dirname(dir)) {
    if (yield* Effect.orElseSucceed(fs.exists(path.join(dir, DECKS_DIR)), () => false)) {
      const root = yield* canonicalPath(dir);
      return yield* assertSafeRoot(root, canonicalHome);
    }

    if (path.dirname(dir) === dir) {
      if (FRAMEWORK_INSTALLED) {
        const root = yield* canonicalPath(cwd);
        return yield* assertSafeRoot(root, canonicalHome);
      }

      return yield* canonicalPath(FRAMEWORK_ROOT);
    }
  }
});

/**
 * Refuses the home folder and the filesystem root as a workspace. A dev server serves the
 * workspace's decks and brands, and a workspace that is a home folder holds keys and tokens next to
 * them.
 *
 * @param root - The folder discovery chose.
 * @param home - The user's home folder.
 * @throws CliError in the error channel for either.
 */
export const assertSafeRoot = Effect.fn('assertSafeRoot')(function* (
  root: string,
  home: string,
): Effect.fn.Return<string, CliError> {
  const isUnsafe = path.resolve(root) === path.resolve(home) || path.dirname(root) === root;
  if (isUnsafe) {
    return yield* cliError(
      `${root} is a home or root folder, so deck will not use it as a workspace: a deck's dev ` +
        'server would sit next to your keys and tokens.\n' +
        `Make a project folder (\`mkdir talks && cd talks\`) and run the command there, or set ${WORKSPACE_ENV} ` +
        'to the folder you mean.',
    );
  }

  return root;
});

/**
 * Uses the same paths as Vite's module resolution, while allowing workspace creation and leaving
 * unreadable paths to the command's existing file system error handling.
 *
 * @param root - An absolute folder path that need not exist yet.
 */
const canonicalPath = Effect.fn('canonicalPath')(function* (
  root: string,
): Effect.fn.Return<string, never, FileSystem.FileSystem> {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.realPath(root).pipe(Effect.orElseSucceed(() => root));
});
