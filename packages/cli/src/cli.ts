import type { FileSystem } from 'effect';

import { deckCommand } from '@deckster/engine/command';
import { refuseStylesheetCode } from '@deckster/vite-plugin/css-guard';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Cause, Console, Effect, Layer } from 'effect';

import { DeckBrowser } from '#browser/deck-browser.ts';
import { usageError, type CliError } from '#cli-error.ts';
import { commandHelp, EXIT_OK, type Command, type CommandError } from '#command.ts';
import { agentCommand } from '#commands/agent.ts';
import { brandCommand } from '#commands/brand.ts';
import { buildCommand } from '#commands/build.ts';
import { chartsCommand } from '#commands/charts.ts';
import { commentsCommand } from '#commands/comments.ts';
import { componentsCommand } from '#commands/components.ts';
import { devCommand } from '#commands/dev.ts';
import { diagramsCommand } from '#commands/diagrams.ts';
import { diffCommand } from '#commands/diff.ts';
import { exportCommand } from '#commands/export.ts';
import { iconsCommand } from '#commands/icons.ts';
import { layoutsCommand } from '#commands/layouts.ts';
import { lintCommand } from '#commands/lint.ts';
import { mcpCommand } from '#commands/mcp.ts';
import { newCommand } from '#commands/new.ts';
import { presentCommand } from '#commands/present.ts';
import { previewCommand } from '#commands/preview.ts';
import { shotCommand } from '#commands/shot.ts';
import { typesCommand } from '#commands/types.ts';
import { SlideComparer } from '#diff/slide-comparer.ts';
import { BrowserOpener } from '#present/browser-fallback.ts';
import { DeckShell } from '#present/deck-shell.ts';
import { reportError } from '#report-error.ts';
import { DeckServer } from '#server/deck-server.ts';
import { awaitSignal } from '#server/shutdown.ts';
import { cliVersion } from '#version.ts';
import { Workspace } from '#workspace.ts';

/**
 * Every command, in the order `deck --help` lists them.
 */
export const COMMANDS: readonly Command[] = [
  devCommand,
  presentCommand,
  buildCommand,
  previewCommand,
  shotCommand,
  diffCommand,
  exportCommand,
  lintCommand,
  layoutsCommand,
  iconsCommand,
  chartsCommand,
  diagramsCommand,
  componentsCommand,
  brandCommand,
  newCommand,
  typesCommand,
  commentsCommand,
  mcpCommand,
  agentCommand,
];

/**
 * The flags that print help, anywhere after `deck` or a command name.
 */
const HELP_FLAGS = new Set(['-h', '--help']);

/**
 * The flags that print the version, as the first argument.
 */
const VERSION_FLAGS = new Set(['-v', '--version']);

/**
 * The exit code after SIGHUP (128 + 1).
 */
const EXIT_SIGHUP = 129;

/**
 * What a CLI run needs from the outside: the workspace, Node's file system, the deck server, the
 * browser, the picture comparer, the desktop shell and the fallback browser opener.
 */
export type CliServices =
  | Workspace
  | FileSystem.FileSystem
  | DeckServer
  | DeckBrowser
  | SlideComparer
  | DeckShell
  | BrowserOpener;

/**
 * Every service a CLI run uses, for a workspace: Node's platform services, Vite deck servers,
 * headless Chromium (launched only when a command opens a page), the picture comparer, the desktop
 * shell and the fallback browser opener. Each service loads its implementation (Vite, Playwright,
 * the export package, the shell's process code) when it is first used, so a command that needs none
 * of them starts without them.
 *
 * @param workspace - The workspace layer; {@link Workspace.layer} for the real one.
 */
export function cliLayer(
  workspace: Layer.Layer<Workspace, CliError>,
): Layer.Layer<CliServices, CliError> {
  return Layer.mergeAll(
    DeckServer.layer,
    DeckBrowser.layer,
    SlideComparer.layer,
    DeckShell.layer,
    BrowserOpener.layer,
  ).pipe(Layer.provideMerge(workspace), Layer.provideMerge(NodeServices.layer));
}

/**
 * Runs one `deck` command line.
 *
 * @param argv - The arguments after `deck`, such as `['shot', 'hello', '--steps']`.
 * @returns The exit code.
 * @throws CliError in the error channel for a bad command line, and whatever the command fails
 *   with.
 */
export const runCli = Effect.fn('runCli')(function* (
  argv: readonly string[],
): Effect.fn.Return<number, CommandError, CliServices> {
  const [name, ...rest] = argv;
  if (name !== undefined && VERSION_FLAGS.has(name)) {
    yield* Console.log(yield* cliVersion());
    return EXIT_OK;
  }

  if (name === undefined || HELP_FLAGS.has(name)) {
    yield* Console.log(rootHelp());
    return EXIT_OK;
  }

  const target = name === 'help' ? rest[0] : name;
  const command = COMMANDS.find((candidate) => candidate.name === target);
  if (target === undefined) {
    yield* Console.log(rootHelp());
    return EXIT_OK;
  }

  if (command === undefined) {
    return yield* usageError(
      `Unknown command "${target}". Commands: ${COMMANDS.map((known) => known.name).join(', ')}.`,
      '',
    );
  }

  if (name === 'help' || rest.some((arg) => HELP_FLAGS.has(arg))) {
    yield* Console.log(yield* commandHelp(command));
    return EXIT_OK;
  }

  return yield* Effect.scoped(command.run(rest));
});

/**
 * The whole program for one command line: runs it with the workspace and Node's services, sets the
 * process exit code, and prints any failure without a stack trace when it already says what to do.
 * It never fails, so the process exits on its own once servers and browsers close. SIGINT and
 * SIGTERM interrupt it (`NodeRuntime.runMain`) and so does SIGHUP (a closed terminal): the
 * command's scope closes and every finalizer runs before the process exits.
 *
 * @param argv - The arguments after `deck`.
 * @param workspace - The workspace layer; {@link Workspace.layer} for the real one.
 */
export function cliProgram(
  argv: readonly string[],
  workspace: Layer.Layer<Workspace, CliError> = Workspace.layer,
): Effect.Effect<void> {
  const hangUp = awaitSignal('SIGHUP').pipe(Effect.as(EXIT_SIGHUP));
  return Effect.raceFirst(runCli(argv), hangUp).pipe(
    Effect.flatMap((code) =>
      Effect.sync(() => {
        process.exitCode = code;
        if (code === EXIT_SIGHUP) {
          process.exit(code);
        }
      }),
    ),
    Effect.provide(cliLayer(needsWorkspace(argv) ? workspace : Workspace.at(process.cwd()))),
    Effect.catchCause((cause) => reportError(Cause.squash(cause))),
  );
}

/**
 * The entry point used by `bin.ts` and the root scripts: runs a command line as the process's main
 * program and reports failures with a non-zero exit code. Before anything else, Tailwind's module
 * loader is closed for the process (`refuseStylesheetCode`), so no command, the base render of
 * `deck diff` included, can make a stylesheet load JavaScript.
 *
 * @param argv - The arguments after `deck`.
 * @param workspace - The workspace layer; {@link Workspace.layer} for the real one.
 */
export function main(
  argv: readonly string[],
  workspace: Layer.Layer<Workspace, CliError> = Workspace.layer,
): void {
  refuseStylesheetCode();
  NodeRuntime.runMain(cliProgram(argv, workspace));
}

/**
 * Whether a command line needs a workspace. Help and the version print without one, so they work in
 * a folder that is not a workspace, such as a home folder.
 *
 * @param argv - The arguments after `deck`.
 */
function needsWorkspace(argv: readonly string[]): boolean {
  const [name] = argv;
  const isInfo =
    name === undefined ||
    name === 'help' ||
    HELP_FLAGS.has(name) ||
    VERSION_FLAGS.has(name) ||
    argv.some((arg) => HELP_FLAGS.has(arg));
  return !isInfo;
}

/**
 * The root `--help` text: every command with its summary.
 */
function rootHelp(): string {
  const width = Math.max(...COMMANDS.map((command) => command.name.length));
  const lines = COMMANDS.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`);
  return [
    'Usage: ' + deckCommand() + ' <command> [options]',
    '',
    'Commands:',
    ...lines,
    '',
    'Run `' +
      deckCommand() +
      ' <command> --help` for the options of one command; `--version` prints the version.',
  ].join('\n');
}
