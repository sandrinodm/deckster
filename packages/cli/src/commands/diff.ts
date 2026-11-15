import { lazyRun, type Command } from '#command.ts';

/**
 * `deck diff`: what changed visually between two versions of a deck.
 */
export const diffCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'diff',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Show which slides changed visually against a git ref or baseline',

  /**
   * The text `deck diff --help` prints.
   */
  help: () => import('#commands/diff-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('diff-run.ts', () => import('#commands/diff-run.ts')),
};
