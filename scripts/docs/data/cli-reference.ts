import type { ChildProcessSpawner } from 'effect/process';

import { deckCommand } from '@deckster/engine/command';
import { Effect } from 'effect';

import { deckOutput, type DeckBinary } from '#data/run-deck.ts';
import { docsError, type DocsError } from '#docs-error.ts';

/**
 * The prefix of the first line of a help text.
 */
const USAGE_PREFIX = 'Usage: ';

/**
 * The line of the root `--help` that opens the command list.
 */
const COMMANDS_HEADING = 'Commands:';

/**
 * One line of the root help's command list: two spaces, the name, the padding, the summary.
 */
const COMMAND_LINE_PATTERN = /^ {2}(\S+) +(\S.*)$/;

/**
 * How many `deck <command> --help` runs go at once.
 */
const HELP_CONCURRENCY = 4;

/**
 * One `deck` command as the CLI reference shows it.
 */
export type DocsCommand = {
  /**
   * The word after `deck`, such as `lint`.
   */
  name: string;

  /**
   * The line `deck --help` shows for it.
   */
  summary: string;

  /**
   * The usage lines at the top of its help without the `Usage: ` prefix, one per form; commands
   * with subcommands, such as `brand check`, have one line per subcommand.
   */
  usage: string[];

  /**
   * The full `--help` text as the CLI that was asked prints it, without the final line break.
   * Subcommands share their command's help.
   */
  help: string;
};

/**
 * The CLI reference: the command name, its version and every command in `deck --help` order.
 */
export type DocsCli = {
  /**
   * The command the help texts name, such as `deck`.
   */
  command: string;

  /**
   * The CLI version.
   */
  version: string;

  /**
   * Every command, in the order `deck --help` lists them.
   */
  commands: DocsCommand[];
};

/**
 * Reads the CLI reference from a `deck`'s own output: the commands and summaries from `deck
 * --help`, each command's help from `deck <command> --help` and the version from `deck --version`.
 * Run against the packed CLI, the help is worded for an npm install, which is what the docs'
 * readers have.
 *
 * @param deck - The `deck` to ask.
 * @param root - The absolute workspace root.
 * @returns The reference.
 * @throws DocsError in the error channel when a run fails or the root help lists no command.
 */
export const readCliReference = Effect.fn('readCliReference')(function* (
  deck: DeckBinary,
  root: string,
): Effect.fn.Return<DocsCli, DocsError, ChildProcessSpawner.ChildProcessSpawner> {
  const listed = parseCommandList(yield* deckOutput(deck, root, ['--help']));
  if (listed.length === 0) {
    return yield* docsError('`deck --help` lists no command under "Commands:".');
  }

  const version = (yield* deckOutput(deck, root, ['--version'])).trim();
  const commands = yield* Effect.forEach(
    listed,
    ({ name, summary }) =>
      deckOutput(deck, root, [name, '--help']).pipe(
        Effect.map((output): DocsCommand => {
          const help = withoutFinalLineBreak(output);
          return { name, summary, usage: usageLines(help), help };
        }),
      ),
    { concurrency: HELP_CONCURRENCY },
  );
  return { command: deckCommand(), version, commands };
});

/**
 * The commands of the root `--help`, in order: each line between `Commands:` and the next empty
 * line, split into the name and its summary.
 *
 * @param help - The root help text.
 * @returns The commands; empty when the text has no command list.
 */
export function parseCommandList(help: string): { name: string; summary: string }[] {
  const lines = help.split('\n');
  const start = lines.indexOf(COMMANDS_HEADING);
  if (start === -1) {
    return [];
  }

  const commands: { name: string; summary: string }[] = [];
  for (const line of lines.slice(start + 1)) {
    const match = COMMAND_LINE_PATTERN.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) {
      break;
    }

    commands.push({ name: match[1], summary: match[2] });
  }

  return commands;
}

/**
 * The usage forms at the top of a help text: the `Usage: ` line and the indented lines right below
 * it, without the prefix or indent. A line that starts with the program name (`deck`) starts a new
 * form; any other line continues the form above it, as when a long form wraps.
 *
 * @param help - The whole help text.
 * @returns One line per form.
 */
export function usageLines(help: string): string[] {
  const lines = help.split('\n');
  const end = lines.findIndex((line) => line.trim() === '');
  const block = lines
    .slice(0, end === -1 ? lines.length : end)
    .map((line) => (line.startsWith(USAGE_PREFIX) ? line.slice(USAGE_PREFIX.length) : line).trim());
  const program = `${block[0]?.split(' ')[0] ?? ''} `;
  const forms: string[] = [];
  for (const line of block) {
    const last = forms.length - 1;
    if (last < 0 || line.startsWith(program)) {
      forms.push(line);
    } else {
      forms[last] = `${forms[last]} ${line}`;
    }
  }

  return forms;
}

/**
 * A command's output without the line break `console.log` ends it with.
 *
 * @param output - What the command printed.
 */
function withoutFinalLineBreak(output: string): string {
  return output.endsWith('\n') ? output.slice(0, -1) : output;
}
