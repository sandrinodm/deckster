import { DEFAULT_BASELINE_DIR, DEFAULT_DIFF_DIR } from '#diff/diff-paths.ts';
import { DEFAULT_BASE_REF } from '#diff/run-diff.ts';

/**
 * The default `--threshold`: any visibly changed pixel counts. A pixel is visibly changed when its
 * mean channel difference is above a tenth of full scale, so anti-aliasing noise does not count.
 */
export const DEFAULT_THRESHOLD = 0;

/**
 * The text `deckster diff --help` prints.
 */
export const HELP = `Usage: deckster diff <deck> [--base <ref|dir>] [--brand <name>] [--steps] [--threshold <n>]
                 [--out <dir>] [--fail-on-change] [--json]
       deckster diff <deck> --save-baseline [dir] [--brand <name>] [--steps] [--json]

Shows which slides of a deck changed visually, for pull requests and for agents checking their
own edits. It renders the deck now and at the base, matches slides by id (so a reordered deck
reports "moved", not a change in every slide) and compares them pixel by pixel.

Statuses: unchanged, changed, added, removed, moved (same pictures, another place in the order).

Arguments:
  deck            Deck folder name under decks/.

Options:
  --base <x>      What to compare against. A folder of PNGs made by \`deckster shot\` (same names), else
                  a git ref. Default: ${DEFAULT_BASE_REF} in a git repository; outside one, the folder
                  --save-baseline writes. A ref is extracted with \`git archive\` into a temporary
                  folder that borrows this workspace's node_modules by link, so nothing is installed
                  and the repository is untouched; the folder is deleted afterwards. The ref is
                  rendered with its own packages (engine, kit, brands and Vite plugin), so a change
                  to a layout shows up too.
  --brand <name>  Render both with brands/<name> instead of the deck config's brand. The default
                  folders get an @<name> suffix.
  --steps         Compare every step, not only each slide's finished state. A baseline folder
                  must then hold step pictures (\`deckster shot <deck> --steps\`).
  --threshold <n> A picture counts as changed when more than this share of its pixels changed
                  visibly, from 0 to 1. Default: ${DEFAULT_THRESHOLD}.
  --out <dir>     Report folder. Default: ${DEFAULT_DIFF_DIR}/<deck>[@<brand>].
  --fail-on-change  Exit with 1 when any slide changed, was added, removed or moved.
  --save-baseline [dir]
                  Instead of comparing, render the deck into a baseline folder (default
                  ${DEFAULT_BASELINE_DIR}/<deck>[@<brand>]) to compare against later. This is the
                  way to use \`deckster diff\` without git.
  --json          Print the report: { ok, deck, brand, base, baseKind, steps, threshold, outDir,
                  counts, slides: [{ id, status, beforeNumber, afterNumber, moved,
                  differenceRatio, before, after, compare, steps? }] } with absolute picture
                  paths; steps are { step, status, differenceRatio, before, after, compare }.
                  Pictures exist only for slides and steps that differ; the other paths are null.
                  --save-baseline prints { ok, deck, brand, baseline, files }. A failure prints
                  { ok: false, error: { type, message } } instead.
  -h, --help      Show this help.

The report folder holds index.html (open it to see the changes), summary.md (a table for a pull
request comment, with relative picture links), report.json (the same as --json, with paths
relative to the folder) and the folders before/, after/ and compare/ with the pictures of what
differs. Exit code: 0 unless the command fails, or --fail-on-change finds a change.`;
