import { lazyRun, type Command } from '#command.ts';

/**
 * `deckster dev`: the dev server for a deck or the workspace chooser.
 */
export const devCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'dev',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Serve a deck with hot reload',

  /**
   * The text `deckster dev --help` prints.
   */
  help: () => import('#commands/dev-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('dev-run.ts', () => import('#commands/dev-run.ts')),
};
