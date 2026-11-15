import { lazyRun, type Command } from '#command.ts';

/**
 * `deck present`: a deck in its own window.
 */
export const presentCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'present',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Open a deck in its own window, with displays and presenter view',

  /**
   * The text `deck present --help` prints.
   */
  help: () => import('#commands/present-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('present-run.ts', () => import('#commands/present-run.ts')),
};
