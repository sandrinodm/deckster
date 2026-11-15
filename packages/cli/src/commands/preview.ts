import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_DECK } from '#workspace.ts';

/**
 * The text `deck preview --help` prints.
 */
const HELP = `Usage: deck preview [deck] [--port <n>] [--host]

Serves the built output of a deck from decks/<deck>/dist until you press Ctrl+C. Run
\`deck build <deck>\` first.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else "${DEFAULT_DECK}".

Options:
  --port <n>    Use this port and fail if it is taken.
  --host        Listen on all network interfaces.
  -h, --help    Show this help.`;

/**
 * `deck preview`: serves a deck's production build.
 */
export const previewCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'preview',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Serve the built output of a deck',

  /**
   * The text `deck preview --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('preview-run.ts', () => import('#commands/preview-run.ts')),
};
