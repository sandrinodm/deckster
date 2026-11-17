import { deckCommand } from '@deckster/engine/command';
import {
  EXPORT_MODES,
  formatDryRun,
  RENDERER_IDS,
  type ExportMode,
  type RendererId,
} from '@deckster/export';
import { Console, Effect } from 'effect';

import type { ExportFormat, ExportOptions } from '#export/export-options.ts';
import type { ExportResult } from '#export/run-export.ts';

import { checkDeckName } from '#choose-deck.ts';
import { usageError, type CliError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { DEFAULT_MAX_MEDIA_MB, DEFAULT_RENDERERS, SCALE_RANGE } from '#commands/export-help.ts';
import { runExport } from '#export/run-export.ts';
import { formatVerify } from '#export/verify-export.ts';
import { printJson, withJsonErrors, wantsJson } from '#json-output.ts';
import { parseCommandArgs, readBrandName } from '#parse-command-args.ts';

/**
 * The largest value `--max-media-mb` accepts, in megabytes.
 */
const MAX_MEDIA_MB = 4096;

/**
 * Bytes per megabyte.
 */
const BYTES_PER_MB = 1024 * 1024;

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runExportCommand(argv));

/**
 * Parses the arguments, exports and prints the result.
 *
 * @param argv - The arguments after `export`.
 */
const runExportCommand = Effect.fn('deck.export')(function* (argv: readonly string[]) {
  const options = yield* readOptions(argv);
  const result = yield* runExport(options);
  const verifyOk = verificationPassed(result.verify, options.strict);
  if (wantsJson(argv)) {
    yield* printJson({ ok: verifyOk, ...result });
  } else {
    yield* printResult(result);
  }

  return verifyOk ? EXIT_OK : EXIT_FAILED;
});

/**
 * Whether the verification passed: always when there was none. With `--strict` the whole check must
 * hold (a valid file, pictures rendered and no region differing); otherwise only the Open XML
 * validator's verdict counts.
 *
 * @param verify - The verification, or `null` when `--verify` was not given.
 * @param strict - Whether `--strict` was given.
 */
function verificationPassed(verify: ExportResult['verify'], strict: boolean): boolean {
  if (verify === null) {
    return true;
  }

  if (strict) {
    return verify.ok;
  }

  return 'ok' in verify.validation && verify.validation.ok;
}

/**
 * Reads and checks the command line.
 *
 * @param argv - The arguments after `export`.
 * @throws CliError in the error channel for a bad command line.
 */
const readOptions = Effect.fn('readOptions')(function* (
  argv: readonly string[],
): Effect.fn.Return<ExportOptions, CliError> {
  const { values, positionals } = yield* parseCommandArgs('export', argv, {
    pdf: { type: 'boolean', default: false },
    png: { type: 'boolean', default: false },
    pptx: { type: 'boolean', default: false },
    steps: { type: 'boolean', default: false },
    slides: { type: 'string' },
    brand: { type: 'string' },
    out: { type: 'string' },
    notes: { type: 'boolean', default: false },
    scale: { type: 'string' },
    mode: { type: 'string' },
    'no-animations': { type: 'boolean', default: false },
    'outline-text': { type: 'boolean', default: false },
    'no-embed-media': { type: 'boolean', default: false },
    'no-embed-fonts': { type: 'boolean', default: false },
    fonts: { type: 'string' },
    'max-media-mb': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    verify: { type: 'boolean', default: false },
    renderer: { type: 'string' },
    strict: { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  });
  const [deck] = positionals;
  if (deck === undefined) {
    return yield* usageError(
      'Which deck? Name one, for example `' + deckCommand() + ' export hello --pdf`.',
      'export',
    );
  }

  yield* checkDeckName(deck);
  const formats = new Set<ExportFormat>();
  if (values.pdf) {
    formats.add('pdf');
  }

  if (values.png) {
    formats.add('png');
  }

  if (values.pptx || values.verify) {
    formats.add('pptx');
  }

  if (formats.size === 0 && !values['dry-run']) {
    formats.add('pdf');
    formats.add('pptx');
  }

  const brand = yield* readBrandName('export', values.brand);
  const scale = yield* readNumber('scale', values.scale, 1, SCALE_RANGE);
  return {
    deck,
    brand,
    formats,
    steps: values.steps,
    slides: values.slides,
    notes: values.notes,
    scale,
    mode: yield* readMode(values.mode),
    out: values.out,
    dryRun: values['dry-run'],
    verify: values.verify,
    renderers: yield* readRenderers(values.renderer),
    strict: values.strict,
    animate: !values['no-animations'],
    outlineText: values['outline-text'],
    embedMedia: !values['no-embed-media'],
    pictureScale: values.scale === undefined ? null : scale,
    embedFonts: !values['no-embed-fonts'] && values.fonts !== 'system',
    fonts: yield* readFonts(values.fonts),
    maxMediaBytes:
      (yield* readNumber('max-media-mb', values['max-media-mb'], DEFAULT_MAX_MEDIA_MB, {
        min: 0,
        max: MAX_MEDIA_MB,
      })) * BYTES_PER_MB,
  };
});

/**
 * Reads `--fonts`.
 *
 * @param value - The raw value.
 * @throws CliError in the error channel for an unknown font set.
 */
const readFonts = Effect.fn('readFonts')(function* (
  value: string | undefined,
): Effect.fn.Return<'brand' | 'system', CliError> {
  if (value === undefined || value === 'brand' || value === 'system') {
    return value ?? 'brand';
  }

  return yield* usageError(`--fonts takes brand or system, got "${value}".`, 'export');
});

/**
 * Reads `--mode`.
 *
 * @param value - The raw value.
 * @throws CliError in the error channel for an unknown mode.
 */
const readMode = Effect.fn('readMode')(function* (
  value: string | undefined,
): Effect.fn.Return<ExportMode, CliError> {
  if (value === undefined) {
    return 'hybrid';
  }

  const mode = EXPORT_MODES.find((candidate) => candidate === value);
  if (mode === undefined) {
    return yield* usageError(
      `--mode must be one of ${EXPORT_MODES.join(', ')}, got "${value}".`,
      'export',
    );
  }

  return mode;
});

/**
 * Reads `--renderer`.
 *
 * @param value - The raw value.
 * @throws CliError in the error channel for an unknown renderer.
 */
const readRenderers = Effect.fn('readRenderers')(function* (
  value: string | undefined,
): Effect.fn.Return<RendererId[], CliError> {
  if (value === undefined) {
    return [...DEFAULT_RENDERERS];
  }

  const ids: RendererId[] = [];
  for (const part of value.split(',').map((item) => item.trim())) {
    const id = RENDERER_IDS.find((candidate) => candidate === part);
    if (id === undefined) {
      return yield* usageError(
        `--renderer takes ${RENDERER_IDS.join(', ')}, got "${part}".`,
        'export',
      );
    }

    ids.push(id);
  }

  return ids;
});

/**
 * Reads a number option within a range.
 *
 * @param name - The option name without dashes.
 * @param value - The raw value.
 * @param fallback - The value when it is not given.
 * @param range - The allowed range.
 * @param range.min - The smallest value.
 * @param range.max - The largest value.
 * @throws CliError in the error channel for a value out of range or not a number.
 */
const readNumber = Effect.fn('readNumber')(function* (
  name: string,
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number },
): Effect.fn.Return<number, CliError> {
  if (value === undefined) {
    return fallback;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < range.min || number > range.max) {
    return yield* usageError(
      `--${name} must be a number from ${range.min} to ${range.max}, got "${value}".`,
      'export',
    );
  }

  return number;
});

/**
 * Prints what was written, the plan for a dry run, and the verification.
 *
 * @param result - The export's result.
 */
const printResult = Effect.fn('printResult')(function* (result: ExportResult) {
  if (result.pdf !== null) {
    const pdf = result.pdf;
    yield* Console.log(
      `${pdf.path} (${pdf.pages} pages, ${pdf.outline.length} bookmarks, ` +
        `${pdf.internalLinks} slide links, ${pdf.externalLinks} external links)`,
    );
  }

  if (result.pptx !== null) {
    const pptx = result.pptx;
    const embedded = pptx.embeddedFonts.length === 0 ? 'none' : pptx.embeddedFonts.join(', ');
    yield* Console.log(
      `${pptx.path} (${pptx.slides.length} slides, ${pptx.mode} mode, ` +
        `masters: ${pptx.masters.join(', ')}, fonts embedded: ${embedded})`,
    );
    if (result.pptx.fonts !== null) {
      yield* Console.log(result.pptx.fonts.note);
    }
  }

  for (const file of result.png ?? []) {
    yield* Console.log(file.path);
  }

  if (result.dryRun !== null && result.pptx === null) {
    yield* Console.log(formatDryRun(result.dryRun));
  }

  for (const warning of result.warnings) {
    yield* Console.error(`warning: ${warning}`);
  }

  if (result.verify !== null) {
    yield* printVerify(result.verify);
  }
});

/**
 * Prints the verification: the validator's verdict, the renderers with the fonts they had, and per
 * slide the worst regions that differ.
 *
 * @param verify - The verification.
 */
const printVerify = Effect.fn('printVerify')(function* (
  verify: NonNullable<ExportResult['verify']>,
) {
  for (const line of formatVerify(verify)) {
    yield* line.error ? Console.error(line.text) : Console.log(line.text);
  }
});
