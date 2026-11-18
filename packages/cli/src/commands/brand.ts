import { lazyRun, type Command } from '#command.ts';

/**
 * `deck brand`: a brand's tokens, or its validation.
 */
export const brandCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'brand',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: "Print a brand's resolved tokens, check a brand, or add one from git",

  /**
   * The text `deck brand --help` prints.
   */
  help: () => import('#commands/brand-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('brand-run.ts', () => import('#commands/brand-run.ts')),
};
