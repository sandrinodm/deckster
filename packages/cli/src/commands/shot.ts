import { lazyRun, type Command } from '#command.ts';
import { DEFAULT_SHOT_DIR } from '#workspace.ts';

/**
 * The smallest `--scale`: quarter-size images, 480x270.
 */
export const MIN_SCALE = 0.25;

/**
 * The largest `--scale`: 7680x4320 images.
 */
export const MAX_SCALE = 4;

/**
 * Joins the deck and the brand in the default output folder of a run with `--brand`.
 */
export const BRAND_FOLDER_SEPARATOR = '@';

/**
 * The text `deck shot --help` prints.
 */
const HELP = `Usage: deck shot <deck> [slide] [--steps] [--brand <name>] [--out <dir>] [--scale <n>] [--json]

Renders a deck in static mode and writes a 1920x1080 PNG per slide, so you can look at the
slides, hidden ones included. Open the files to inspect them; --json lists them for scripts. A
slide that throws is still captured, showing its error, and the command exits with 1.

Arguments:
  deck            Deck folder name under decks/.
  slide           One slide, by id or 1-based number. Default: every slide, hidden ones too.

Options:
  --steps         One PNG per step instead of one per slide, named NN-id.stepK.png (K from 0).
                  Without it each slide is captured at its last step, with everything shown.
  --brand <name>  Render with brands/<name> instead of the deck config's brand.
  --out <dir>     Output folder. Default: ${DEFAULT_SHOT_DIR}/<deck>, or
                  ${DEFAULT_SHOT_DIR}/<deck>${BRAND_FOLDER_SEPARATOR}<brand> with --brand.
  --scale <n>     Pixel density from ${MIN_SCALE} to ${MAX_SCALE}; 2 writes 3840x2160 images. Default: 1.
  --json          Print { deck, brand, outDir, ok, files: [{ path, slide, number, step, hidden,
                  width, height, error }], pageErrors }. hidden is true for a slide with
                  \`hidden: true\`. error is what a broken slide threw, else null; pageErrors
                  are errors thrown while the deck loaded. A failure prints
                  { ok: false, error: { type, message } } instead.
  -h, --help      Show this help.

Files are named 03-request-flow.png and 03-request-flow.step2.png. A run over the whole deck
removes older screenshots with that naming from the output folder first.`;

/**
 * `deck shot`: PNGs of the slides, for agents and authors to look at.
 */
export const shotCommand: Command = {
  /**
   * The word after `deck` that selects this command.
   */
  name: 'shot',

  /**
   * The line `deck --help` shows for this command.
   */
  summary: 'Write PNG screenshots of slides (and steps)',

  /**
   * The text `deck shot --help` prints.
   */
  help: HELP,

  /**
   * Loads the command's body on first use and runs it.
   */
  run: lazyRun('shot-run.ts', () => import('#commands/shot-run.ts')),
};
