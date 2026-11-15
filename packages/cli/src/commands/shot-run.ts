import { Console, Effect } from 'effect';
import path from 'node:path';

import { usageError, type CliError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { BRAND_FOLDER_SEPARATOR, MAX_SCALE, MIN_SCALE } from '#commands/shot.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs, readBrandName } from '#parse-command-args.ts';
import { takeShots, type ShotResult } from '#shot/take-shots.ts';
import { DEFAULT_SHOT_DIR, Workspace } from '#workspace.ts';

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runShot(argv));

/**
 * Parses the arguments, takes the screenshots and prints them.
 *
 * @param argv - The arguments after `shot`.
 */
const runShot = Effect.fn('deck.shot')(function* (argv: readonly string[]) {
  const { root: workspaceRoot } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('shot', argv, {
    steps: { type: 'boolean', default: false },
    brand: { type: 'string' },
    out: { type: 'string' },
    scale: { type: 'string' },
    json: { type: 'boolean', default: false },
  });
  const [deck, slide] = positionals;
  if (deck === undefined) {
    return yield* usageError('Which deck? Name one, for example `pnpm deck shot hello`.', 'shot');
  }

  const brand = yield* readBrandName('shot', values.brand);
  const outDir = path.resolve(workspaceRoot, values.out ?? defaultOutDir(deck, brand));
  const scale = yield* readScale(values.scale);
  const result = yield* takeShots({
    deck,
    slide,
    brand,
    steps: values.steps,
    outDir,
    scale,
  });
  const ok = result.pageErrors.length === 0 && result.files.every((file) => file.error === null);
  if (values.json) {
    yield* printJson({
      deck,
      brand: result.brand,
      outDir,
      ok,
      files: result.files,
      pageErrors: result.pageErrors,
    });
  } else {
    yield* printResult(result);
  }

  return ok ? EXIT_OK : EXIT_FAILED;
});

/**
 * The default output folder: `.deck/shots/<deck>`, or `.deck/shots/<deck>@<brand>` for a run in
 * another brand, so the two never overwrite each other.
 *
 * @param deck - The deck folder name.
 * @param brand - The `--brand` value, if any.
 */
function defaultOutDir(deck: string, brand: string | undefined): string {
  const folder = brand === undefined ? deck : `${deck}${BRAND_FOLDER_SEPARATOR}${brand}`;
  return path.join(DEFAULT_SHOT_DIR, folder);
}

/**
 * Prints each file on standard output, and each broken slide and load error on standard error.
 *
 * @param result - What the run wrote.
 */
const printResult = Effect.fn('printResult')(function* (result: ShotResult) {
  for (const file of result.files) {
    yield* Console.log(file.path);
    if (file.error !== null) {
      yield* Console.error(
        `  render-error: slide ${file.number} "${file.slide}" shows an error: ${file.error}`,
      );
    }
  }

  for (const error of result.pageErrors) {
    yield* Console.error(`render-error: the page threw while the deck loaded: ${error}`);
  }

  if (result.pageErrors.length > 0 || result.files.some((file) => file.error !== null)) {
    yield* Console.error('Run `pnpm deck lint <deck>` for every problem with its fix.');
  }
});

/**
 * Reads `--scale`: a number from 0.25 to 4, or 1 when it is not given.
 *
 * @param value - The raw option value.
 * @throws CliError in the error channel for a value out of range or not a number.
 */
const readScale = Effect.fn('readScale')(function* (
  value: string | undefined,
): Effect.fn.Return<number, CliError> {
  if (value === undefined) {
    return 1;
  }

  const scale = Number(value);
  if (!Number.isFinite(scale) || scale < MIN_SCALE || scale > MAX_SCALE) {
    return yield* usageError(
      `--scale must be a number from ${MIN_SCALE} to ${MAX_SCALE}, got "${value}".`,
      'shot',
    );
  }

  return scale;
});
