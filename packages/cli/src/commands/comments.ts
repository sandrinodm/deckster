import { lazyRun, type Command } from '#command.ts';

/**
 * The text `deck comments --help` prints.
 */
const HELP = `Usage: deck comments <deck> [--open | --resolved | --all] [--slide <id>] [--json]
       deck comments resolve <deck> <id> [--note <text>] [--json]
       deck comments reopen <deck> <id> [--json]
       deck comments add <deck> <slide> --text <text> [--line <n>] [--step <n>] [--type <type>]
       deck comments prune <deck> [--json]

Review comments on a deck: left in the browser in comment mode (press c in \`pnpm deck dev\`) or
by agents, stored in decks/<deck>/.feedback/<slide-id>.json and committed with the deck. Each
comment names the file, line and column to edit, so it can be fixed without the browser.

  deck comments <deck>          Lists open comments with file:line:column, anchor status, text and
                                screenshot (--resolved or --all for the others).
  resolve <deck> <id>           Marks a comment resolved, signed with $DECK_AUTHOR, else git's
                                user.name; --note says what changed. An already resolved
                                comment keeps its note.
  reopen <deck> <id>            Opens a resolved comment again; an open one is left as it is.
  add <deck> <slide>            Adds a comment on a slide, or with --line on that line of the slide
                                file, so agents can leave comments too.
  prune <deck>                  Removes the comments of slides the deck config does not list.

Anchor status: ok (the line still reads as it did), moved (found elsewhere: line is the new
place), guessed (the line was reworded: line is the nearby line most like it; check it), lost
(nothing matches: line is null and location names only the file; read the excerpt around
anchor.originalLine and the screenshot), none (a comment on a whole slide).

box and region are in canvas pixels of the 1920x1080 slide (origin top left), not screen pixels;
the JSON says so in units.

Options:
  --open, --resolved, --all  Which comments to list. Default: --open.
  --slide <id>      Only this slide's comments; an id the deck does not have is a usage error
                    naming its slides.
  --note <text>     What changed, for resolve.
  --text <text>     The comment, for add.
  --line <n>        The line of the slide file the comment is about, for add.
  --step <n>        The step the comment is about, for add. Default: 0.
  --type <type>     fix, question or idea, for add.
  --json            Print JSON. The list is { deck, deckDir, counts: { open, resolved },
                    units: { box: "canvas-px", canvasWidth, canvasHeight }, comments }, each
                    comment with id, number, slide, slideNumber, step, status, type, target,
                    text, author, createdAt, updatedAt, location (file:line:column to edit; just
                    the file when line is null), file, line, column, anchor { status (ok, moved,
                    guessed, lost, none), originalLine, stamp, element
                    { tag, text, cssPath } }, excerpt { startLine, lines }, screenshot, box,
                    region, resolution { note, by, at } and hash. resolve, reopen and add print
                    { ok: true, changed, comment }, where changed is false when the comment was
                    already resolved (resolve) or open (reopen) and nothing was written; prune
                    prints { deck, removed: [{ slide, comments }] }.
                    A failure prints { ok: false, error: { type, message } }.
  -h, --help        Show this help.`;

/**
 * `deck comments`: list, resolve, reopen, add and prune review comments.
 */
export const commentsCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'comments',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'List, resolve, reopen, add and prune review comments',

  /**
   * The text `deck comments --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('comments-run.ts', () => import('#commands/comments-run.ts')),
};
