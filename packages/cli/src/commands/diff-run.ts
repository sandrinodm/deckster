import { deckCommand } from '@deckster/engine/command';
import * as NodeServices from '@effect/platform-node/NodeServices';
import { Console, Effect } from 'effect';
import path from 'node:path';

import { usageError, type CliError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { DEFAULT_THRESHOLD } from '#commands/diff-help.ts';
import { DEFAULT_BASELINE_DIR, DEFAULT_DIFF_DIR, deckFolder } from '#diff/diff-paths.ts';
import {
  describePlace,
  describeSteps,
  formatRatio,
  hasChanges,
  type DiffReport,
} from '#diff/diff-report.ts';
import { runDiff, saveBaseline } from '#diff/run-diff.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { parseCommandArgs, readBrandName } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The width of the status column in the printed list, in characters.
 */
const STATUS_COLUMN_WIDTH = 8;

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runDiffCommand(argv));

/**
 * Parses the arguments, then either saves a baseline or compares and prints the report.
 *
 * @param argv - The arguments after `diff`.
 */
const runDiffCommand = Effect.fn('deck.diff')(function* (argv: readonly string[]) {
  const { root } = yield* Workspace;
  const { values, positionals } = yield* parseCommandArgs('diff', argv, {
    base: { type: 'string' },
    brand: { type: 'string' },
    steps: { type: 'boolean', default: false },
    threshold: { type: 'string' },
    out: { type: 'string' },
    'fail-on-change': { type: 'boolean', default: false },
    'save-baseline': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });
  const [deck, baselineDir, ...extra] = positionals;
  if (deck === undefined) {
    return yield* usageError(
      'Which deck? Name one, for example `' + deckCommand() + ' diff hello`.',
      'diff',
    );
  }

  if (extra.length > 0 || (baselineDir !== undefined && !values['save-baseline'])) {
    return yield* usageError(
      `Unexpected argument "${baselineDir ?? ''}". Name the base with \`--base <ref|dir>\`.`,
      'diff',
    );
  }

  const brand = yield* readBrandName('diff', values.brand);
  if (values['save-baseline']) {
    const dir = path.resolve(root, baselineDir ?? deckFolder(DEFAULT_BASELINE_DIR, deck, brand));
    const saved = yield* saveBaseline({ deck, brand, steps: values.steps }, dir);
    if (values.json) {
      yield* printJson({
        ok: true,
        deck,
        brand: saved.brand,
        baseline: dir,
        files: saved.files.length,
      });
    } else {
      yield* Console.log(`Saved ${saved.files.length} pictures of "${deck}" to ${dir}`);
    }

    return EXIT_OK;
  }

  const threshold = yield* readThreshold(values.threshold);
  const report = yield* runDiff({
    deck,
    brand,
    base: values.base,
    steps: values.steps,
    threshold,
    outDir: path.resolve(root, values.out ?? deckFolder(DEFAULT_DIFF_DIR, deck, brand)),
  }).pipe(Effect.provide(NodeServices.layer));
  yield* values.json ? printJson(report) : printReport(report);
  return values['fail-on-change'] && hasChanges(report) ? EXIT_FAILED : EXIT_OK;
});

/**
 * Prints the statuses and where the report is.
 *
 * @param report - The report with absolute paths.
 */
const printReport = Effect.fn('printReport')(function* (report: DiffReport) {
  const target = report.brand === '' ? report.deck : `${report.deck} (${report.brand})`;
  const counts = Object.entries(report.counts)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${status}`)
    .join(', ');
  yield* Console.log(`${target} against ${report.base}: ${counts}`);
  for (const slide of report.slides.filter((entry) => entry.status !== 'unchanged')) {
    const steps = describeSteps(slide);
    const ratio = slide.status === 'changed' ? `  ${formatRatio(slide.differenceRatio)}` : '';
    const stepNote = steps === '' ? '' : `  ${steps}`;
    const place = describePlace(slide);
    yield* Console.log(
      `  ${slide.status.padEnd(STATUS_COLUMN_WIDTH)} ${slide.id}  (slide ${place})${ratio}${stepNote}`,
    );
  }

  if (hasChanges(report)) {
    yield* Console.log(`Report: ${path.join(report.outDir, 'index.html')}`);
    yield* Console.log(`Summary for a pull request: ${path.join(report.outDir, 'summary.md')}`);
  } else {
    yield* Console.log(`Nothing changed. Report: ${path.join(report.outDir, 'index.html')}`);
  }
});

/**
 * Reads `--threshold`: a number from 0 up to but not including 1, or the default.
 *
 * @param value - The raw option value.
 * @throws CliError in the error channel for a value out of range or not a number.
 */
const readThreshold = Effect.fn('readThreshold')(function* (
  value: string | undefined,
): Effect.fn.Return<number, CliError> {
  if (value === undefined) {
    return DEFAULT_THRESHOLD;
  }

  const threshold = Number(value);
  const isBlank = value.trim() === '';
  const isShare = Number.isFinite(threshold) && threshold >= 0 && threshold < 1;
  if (isBlank || !isShare) {
    return yield* usageError(
      `--threshold must be a share of pixels from 0 up to (not including) 1, ` +
        `such as 0.001, got "${value}".`,
      'diff',
    );
  }

  return threshold;
});
