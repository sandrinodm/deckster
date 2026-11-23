import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deckster components --help` prints.
 */
const HELP = `Usage: deckster components [--json]

Lists the MDX components a slide can use besides charts (deckster charts) and diagrams (deck
diagrams): code, terminals, media, icons, links, live demos, steps and notes.

Options:
  --json        Print { shared, components, insight }, shaped like deckster charts and deck
                diagrams: shared is empty (no props are shared between these components). Each
                component has name (the tag, such as "Code"), kind (code, media, icon, link,
                app, motion or notes), useWhen, avoid, shared (always []), props (by name:
                { type, required, default, description }) and example (MDX). A prop name a component
                does not list is refused with the closest one, at build time in MDX and when
                the slide renders in TSX, and so is a missing required prop. insight explains
                props, files, static mode, steps and the build warnings deckster lint reports.
  -h, --help    Show this help.`;

/**
 * `deckster components`: the catalog of the kit's MDX components, for writing a slide with them.
 */
export const componentsCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'components',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'List the code, media, link and demo components with their props',

  /**
   * The text `deckster components --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('components-run.ts', () => import('#commands/components-run.ts')),
};
