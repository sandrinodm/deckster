import { lazyRun, type Command } from '#command.ts';

/**
 * `deckster diff`: what changed visually between two versions of a deck.
 */
export const diffCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'diff',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Show which slides changed visually against a git ref or baseline',

  /**
   * The text `deckster diff --help` prints.
   */
  help: () => import('#commands/diff-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('diff-run.ts', () => import('#commands/diff-run.ts')),
};
