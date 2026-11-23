import { lazyRun, type Command } from '#command.ts';

/**
 * `deckster export`: PDF, PNG and PPTX files of a deck.
 */
export const exportCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'export',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Export a deck to PDF, PNG and PowerPoint',

  /**
   * The text `deckster export --help` prints.
   */
  help: () => import('#commands/export-help.ts').then((module) => module.HELP),

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('export-run.ts', () => import('#commands/export-run.ts')),
};
