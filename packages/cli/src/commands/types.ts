import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deckster types --help` prints.
 */
const HELP = `Usage: deckster types

Makes the workspace type-check in your editor and with \`tsc\`, without installing anything in it.
It writes tsconfig.json at the workspace root, and .deck/env.d.ts beside it:
  - \`@deckster/*\` imports map to the framework's source files in this install;
  - every other package a deck or brand imports (effect, react) resolves from the framework's own
    dependencies;
  - \`*.mdx\`, Node, Vite client and icon declarations are included.
Settings you already have in tsconfig.json are kept; only the paths \`deckster types\` manages are
replaced: \`@deckster/*\`, \`effect\`, \`react\` and \`react-dom\` (with their subpaths), and \`*\`. A
tsconfig.json that \`extends\` another keeps its own compiler options. A tsconfig.json with
comments, or one that is a symbolic link, is left alone: remove the comments or replace the link.

The paths name this install's folders. Run \`deckster types\` again after upgrading @deckster/cli, and
do not commit the result to a repository others install differently.

In the framework's own repository the packages are linked by the workspace and this does nothing.

Options:
  -h, --help  Show this help.`;

/**
 * `deckster types`: the workspace's editor settings.
 */
export const typesCommand: Command = {
  /**
   * The word after `deckster` that selects this command.
   */
  name: 'types',

  /**
   * The line `deckster --help` shows for this command.
   */
  summary: 'Write tsconfig.json so editors and tsc resolve @deckster imports',

  /**
   * The text `deckster types --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('types-run.ts', () => import('#commands/types-run.ts')),
};
