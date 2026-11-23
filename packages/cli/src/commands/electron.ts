import { lazyRun, type Command } from '#command.ts';

/**
 * `deckster electron install|update|status`: the Electron binary `deckster present` uses.
 */
export const electronCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'electron',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Download, update or check the Electron binary deckster present uses',

  /**
   * The text `deckster electron --help` prints.
   */
  help: () => import('#commands/electron-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('electron-run.ts', () => import('#commands/electron-run.ts')),
};
