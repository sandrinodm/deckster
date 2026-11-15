import {
  DEFAULT_BRAND,
  describeProblem,
  TEXT_TONES,
  type BrandProblem,
  type BrandTokens,
  type SurfaceTokens,
} from '@deckster/brand';
import { brandTokensJson, loadBrand } from '@deckster/brand/node';
import { Console, Effect } from 'effect';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The subcommand word that validates a brand instead of printing it.
 */
const CHECK = 'check';

/**
 * What `deck brand check` found: the brand file, and its problems by severity.
 */
type BrandCheck = {
  /**
   * The brand file as authors see it.
   */
  file: string;

  /**
   * The problems that stop the brand from loading.
   */
  errors: readonly BrandProblem[];

  /**
   * The problems that do not.
   */
  warnings: readonly BrandProblem[];
};

/**
 * Parses the arguments and runs the command; succeeds with the process exit code.
 */
export const run: Command['run'] = (argv): ReturnType<Command['run']> =>
  withJsonErrors(argv, runBrand(argv));

/**
 * Parses the arguments and prints or checks the brand.
 *
 * @param argv - The arguments after `brand`.
 */
const runBrand = Effect.fn('deck.brand')(function* (argv: readonly string[]) {
  const { values, positionals } = yield* parseCommandArgs('brand', argv, {
    json: { type: 'boolean', default: false },
  });
  const [first, second] = positionals;
  if (first === CHECK) {
    if (second === undefined) {
      return yield* usageError(
        'Which brand? Name one, for example `pnpm deck brand check default`.',
        'brand',
      );
    }

    return yield* checkBrand(second, values.json);
  }

  return yield* printBrand(first ?? DEFAULT_BRAND, values.json);
});

/**
 * Prints a brand's tokens, as JSON or as a summary.
 *
 * @param name - The brand folder name.
 * @param json - Whether to print every token as JSON.
 * @throws BrandError in the error channel when the brand does not exist or is invalid.
 */
const printBrand = Effect.fn('printBrand')(function* (name: string, json: boolean) {
  const { root } = yield* Workspace;
  if (json) {
    yield* Console.log((yield* brandTokensJson(root, name)).trimEnd());
    return EXIT_OK;
  }

  const brand = yield* loadBrand(root, name);
  yield* Console.log(summarize(brand.tokens, brand.location.displayPath, brand.warnings));
  return EXIT_OK;
});

/**
 * Validates a brand and prints its errors and warnings with their fixes.
 *
 * @param name - The brand folder name.
 * @param json - Whether to print JSON.
 */
const checkBrand = Effect.fn('checkBrand')(function* (name: string, json: boolean) {
  const { root } = yield* Workspace;
  const result = yield* loadBrand(root, name).pipe(
    Effect.map((brand): BrandCheck => ({
      file: brand.location.displayPath,
      errors: [],
      warnings: brand.warnings,
    })),
    Effect.catchTag('BrandError', (error) =>
      Effect.succeed<BrandCheck>({ file: error.source, errors: error.problems, warnings: [] }),
    ),
  );
  const ok = result.errors.length === 0;
  if (json) {
    yield* printJson({ brand: name, ok, ...result });
  } else {
    yield* Console.log(formatCheck(name, result.file, result.errors, result.warnings));
  }

  return ok ? EXIT_OK : EXIT_FAILED;
});

/**
 * The plain-text report `deck brand check` prints: the file, each problem with its fix, and a
 * verdict line.
 *
 * @param name - The brand folder name.
 * @param file - The brand file as authors see it.
 * @param errors - The problems that stop the brand from loading.
 * @param warnings - The problems that do not.
 */
function formatCheck(
  name: string,
  file: string,
  errors: readonly BrandProblem[],
  warnings: readonly BrandProblem[],
): string {
  const lines = [file];
  for (const [severity, problems] of [
    ['error', errors],
    ['warning', warnings],
  ] as const) {
    for (const problem of problems) {
      lines.push(`  ${severity.padEnd('warning'.length)} ${describeProblem(problem)}`);
      lines.push(`          Fix: ${problem.fix}`);
    }
  }

  const verdict = errors.length === 0 ? 'is valid' : 'cannot be used';
  lines.push(
    `${name}: ${verdict} (${count(errors.length, 'error')}, ${count(warnings.length, 'warning')}).`,
  );
  return lines.join('\n');
}

/**
 * A readable summary of a brand's tokens.
 *
 * @param tokens - The resolved tokens.
 * @param file - The brand file as authors see it.
 * @param warnings - The brand's warnings.
 */
function summarize(tokens: BrandTokens, file: string, warnings: readonly BrandProblem[]): string {
  const { families, scale } = tokens.typography;
  const lines = [
    `${tokens.label} (${file})`,
    `Fonts: ${Object.entries(families)
      .map(([role, family]) => `${role} ${family.family}`)
      .join(', ')}`,
    `Type: ${Object.entries(scale)
      .map(([step, type]) => `${step} ${type.size}px`)
      .join(', ')}`,
    `Spacing: ${Object.entries(tokens.spacing.scale)
      .map(([step, size]) => `${step} ${size}px`)
      .join(', ')}; margins ${tokens.spacing.margin.x}x${tokens.spacing.margin.y}px`,
    'Surfaces:',
    ...Object.values(tokens.surfaces).map(
      (surface) =>
        `  ${surface.name} (${surface.scheme}): ${Object.entries(surface.roles)
          .map(([role, color]) => `${role} ${color}`)
          .join(', ')}${smallTextNote(surface)}`,
    ),
  ];
  if (warnings.length > 0) {
    lines.push(
      `${count(warnings.length, 'warning')}; run \`pnpm deck brand check ${tokens.name}\`.`,
    );
  }

  lines.push(`Run \`pnpm deck brand ${tokens.name} --json\` for every token.`);
  return lines.join('\n');
}

/**
 * The text colors of a surface that differ from their roles, for the summary: small text in a role
 * held only to 3:1 is set in a darker or lighter shade of it.
 *
 * @param surface - The resolved surface.
 * @returns `; small text: accent #4967f1` or an empty string when every role reads as it is.
 */
function smallTextNote(surface: SurfaceTokens): string {
  const moved = TEXT_TONES.filter((tone) => surface.text[tone] !== surface.roles[tone]);
  return moved.length === 0
    ? ''
    : `; small text: ${moved.map((tone) => `${tone} ${surface.text[tone]}`).join(', ')}`;
}
