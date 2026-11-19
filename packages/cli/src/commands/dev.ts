import { lazyRun, type Command } from '#command.ts';

/**
 * `deck dev`: the dev server for a deck or the workspace chooser.
 */
export const devCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'dev',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Serve a deck with hot reload',

  /**
   * The text `deck dev --help` prints.
   */
  help: () => import('#commands/dev-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('dev-run.ts', () => import('#commands/dev-run.ts')),
};
