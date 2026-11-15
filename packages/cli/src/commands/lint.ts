import { lazyRun, type Command } from '#command.ts';

/**
 * `deck lint`: schema, rendered and deck checks.
 */
export const lintCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'lint',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Check a deck for schema errors, overflow, contrast and off-brand values',

  /**
   * The text `deck lint --help` prints.
   */
  help: () => import('#commands/lint-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('lint-run.ts', () => import('#commands/lint-run.ts')),
};
