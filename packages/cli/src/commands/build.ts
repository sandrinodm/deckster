import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deck build --help` prints.
 */
const HELP = `Usage: deck build [deck] [--with-exports] [--all] [--out <dir>] [--include-scratch]

Builds a deck to decks/<deck>/dist as static files that can be hosted under any path.

With --out, builds decks into one site folder instead: <dir>/<deck>/ for each deck, with a
thumbnail.png of its first slide, and <dir>/index.html, a gallery of the decks (title, brand,
slide count, thumbnail, links to each deck and to its PDF and PPTX). Everything is relative, so
the folder can be hosted under any path. The entire destination folder is replaced with the
selected decks and their gallery. The site leaves out scratch decks, whose folder name
starts with zz- (throwaway decks such as trial runs), unless --include-scratch is given or the deck is named.

Arguments:
  deck          Deck folder name under decks/. Default: $DECK, else every deck.

Options:
  --all           Build every deck, ignoring $DECK. Cannot be combined with a deck name.
  --out <dir>     Write a site folder (see above) instead of decks/<deck>/dist only. The
                  per-deck builds are still written to decks/<deck>/dist first.
  --include-scratch
                  With --out, also build zz- decks into the site. Without --out every deck,
                  zz- ones included, is built already.
  --with-exports  Also export the deck to <deck>.pdf and <deck>.pptx beside index.html, so a
                  <Download file="<deck>.pdf"> button on a slide can link to them; with --out
                  the gallery links to them.
  -h, --help      Show this help.`;

/**
 * `deck build`: a production build of one deck, or of every deck.
 */
export const buildCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'build',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Build a deck (or every deck) to decks/<deck>/dist',

  /**
   * The text `deck build --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('build-run.ts', () => import('#commands/build-run.ts')),
};
