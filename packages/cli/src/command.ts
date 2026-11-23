import type { BrandError } from '@deckster/brand';
import type { DeckBuildError } from '@deckster/vite-plugin';
import type { FileSystem, Scope } from 'effect';

import { Effect } from 'effect';

import type { DeckBrowser } from '#browser/deck-browser.ts';
import type { CliError, ReadableError, ViteError } from '#cli-error.ts';
import type { SlideComparer } from '#diff/slide-comparer.ts';
import type { DeckProblemsError } from '#lint/deck-problems.ts';
import type { BrowserOpener } from '#present/browser-fallback.ts';
import type { DeckShell } from '#present/deck-shell.ts';
import type { DeckServer } from '#server/deck-server.ts';
import type { Workspace } from '#workspace.ts';

import { cliError } from '#cli-error.ts';

/**
 * Everything a command can fail with. The CLI prints each one's message without a stack trace,
 * except a {@link ViteError} that wraps something other than deck build errors.
 */
export type CommandError =
  | ReadableError
  | BrandError
  | DeckBuildError
  | DeckProblemsError
  | ViteError;

/**
 * The services a command runs with: the workspace, Node's file system, the deck server, the browser
 * the picture comparer, the desktop shell and the fallback browser opener, and the scope that
 * closes servers and pages when the command ends.
 */
export type CommandServices =
  | Workspace
  | FileSystem.FileSystem
  | DeckServer
  | DeckBrowser
  | SlideComparer
  | DeckShell
  | BrowserOpener
  | Scope.Scope;

/**
 * One `deckster` subcommand.
 */
export type Command = {
  /**
   * The word after `deckster`, such as `shot`.
   */
  name: string;

  /**
   * One line for the command list.
   */
  summary: string;

  /**
   * The full `--help` text, or a loader for a text that needs heavy modules to write (a list of
   * rules, a default another package owns), so listing commands loads none of them.
   */
  help: string | (() => Promise<string>);

  /**
   * Runs the command on the arguments after its name and succeeds with the process exit code.
   */
  run: (argv: readonly string[]) => Effect.Effect<number, CommandError, CommandServices>;
};

/**
 * The process exit code for success.
 */
export const EXIT_OK = 0;

/**
 * The process exit code when a command ran but found problems.
 */
export const EXIT_FAILED = 1;

/**
 * The module a command's body lives in: it exports the command's `run`.
 */
export type CommandBody = {
  /**
   * Runs the command on the arguments after its name.
   */
  run: Command['run'];
};

/**
 * A command's `run` that loads its body module on first use, so listing the commands or printing
 * help imports none of the heavy packages the bodies need. A body that fails to load (a broken
 * file, a missing export) fails with a readable error that names the module and keeps the original
 * message.
 *
 * @param module - The body's file name, such as `present-run.ts`, for the error message.
 * @param load - Imports the body: `() => import('#commands/present-run.ts')`.
 */
export function lazyRun(module: string, load: () => Promise<CommandBody>): Command['run'] {
  const loadBody = Effect.fn('deck.loadBody')(function* (): Effect.fn.Return<
    CommandBody,
    CliError
  > {
    const body = yield* Effect.tryPromise({
      try: load,
      catch: (cause) =>
        cliError(
          `Could not load ${module}: ${cause instanceof Error ? cause.message : String(cause)}`,
        ),
    });
    if (typeof body.run !== 'function') {
      return yield* cliError(`Could not load ${module}: it does not export \`run\`.`);
    }

    return body;
  });
  return Effect.fn('deck.lazyRun')(function* (argv) {
    return yield* loadBody().pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          argv.includes(JSON_FLAG) ? printJsonFailure(argv, error) : Effect.fail(error),
        onSuccess: (body) => body.run(argv),
      }),
    );
  });
}

/**
 * The flag that makes a command print JSON, spelled here so this module needs no other.
 */
const JSON_FLAG = '--json';

/**
 * Reports a body that failed to load the way the body would have reported its own failure under
 * `--json`: `{ ok: false, error }` on standard output, succeeding with the failing exit code. The
 * JSON module is loaded only now; when it cannot load either, the original error is the failure.
 *
 * @param argv - The arguments after the command name.
 * @param error - Why the body did not load.
 */
const printJsonFailure = Effect.fn('deck.printJsonFailure')(function* (
  argv: readonly string[],
  error: CliError,
): Effect.fn.Return<number, CliError> {
  const json = yield* Effect.tryPromise({
    try: () => import('#json-output.ts'),
    catch: () => error,
  });
  return yield* json.withJsonErrors(argv, Effect.fail(error));
});

/**
 * The `--help` text of a command, loading it first when the command keeps it in a module of its
 * own.
 *
 * @param command - The command.
 * @throws CliError in the error channel when the module that holds the text does not load.
 */
export const commandHelp = Effect.fn('commandHelp')(function* (
  command: Command,
): Effect.fn.Return<string, CliError> {
  const { help } = command;
  if (typeof help === 'string') {
    return help;
  }

  return yield* Effect.tryPromise({
    try: help,
    catch: (cause) =>
      cliError(
        `Could not load the help of "${command.name}": ` +
          `${cause instanceof Error ? cause.message : String(cause)}`,
      ),
  });
});
