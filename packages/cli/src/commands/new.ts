import { FRAMEWORK_INSTALLED } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';

import { lazyRun, type Command } from '#command.ts';

/**
 * The files `deck new <deck>` writes besides the config and the first slide: a workspace package in
 * the repository, nothing in a published CLI's workspace.
 */
const DECK_FILES = FRAMEWORK_INSTALLED ? '' : 'package.json, tsconfig.json ';

/**
 * What to do after `deck new <deck>`.
 */
const AFTER_NEW = FRAMEWORK_INSTALLED
  ? ''
  : ` Then run \`pnpm install\`: the deck is a
                              workspace package, and until it is linked every command on it
                              fails with "Cannot find package '@deckster/engine'".`;

/**
 * The text `deck new --help` prints.
 */
const HELP = `Usage: deck new <deck> [--title <text>] [--brand <name>] [--duration <length>]
       deck new slide <deck> <id> [--layout <name>]
       deck new app <deck> <name>

Scaffolds a deck, adds a slide to one, or adds a mini app to one.

  deck new <deck>             Creates decks/<deck>/ with deck.config.ts (title, brand,
                              optional duration), ${DECK_FILES}and a first slide
                              that uses the title layout, from that layout's example. It passes
                              \`deck lint\` as created.${AFTER_NEW}
  deck new slide <deck> <id>  Creates slides/<id>.mdx from the layout's example (see
                              \`${deckCommand()} layouts --json\`) with the slide's own title, and
                              appends <id> to the slide list in deck.config.ts.
  deck new app <deck> <name>  Creates apps/<name>/ (index.html, main.tsx, app.tsx, app.css,
                              error-boundary.tsx), a React mini app wired to
                              @deckster/app-bridge, and prepares the deck
                              to build it. Show it with <AppFrame app="<name>" poster="..." />.
                              The deck builds it as an extra entry served at apps/<name>/.

Names are kebab-case: lowercase words joined by hyphens.

Options:
  --title <text>    The deck title for \`deck new <deck>\`. Default: the name as a sentence. At most
                    as long as the title layout allows (the error says how many characters).
  --brand <name>    The brand folder under brands/ the deck uses, written to deck.config.ts.
                    Default: default.
  --duration <len>  The talk length, such as 20m, 90s or 1m30s, written to deck.config.ts as
                    \`duration\` (the presenter's pacing and the time-budget lint rule).
  --layout <name>   The layout for the new slide, from the layout catalog. Run
                    \`${deckCommand()} layouts\` to list them. Default: default.
  -h, --help        Show this help.`;

/**
 * `deck new`: scaffold a deck or append a slide.
 */
export const newCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'new',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Create a deck, or add a slide to one',

  /**
   * The text `deck new --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('new-run.ts', () => import('#commands/new-run.ts')),
};
