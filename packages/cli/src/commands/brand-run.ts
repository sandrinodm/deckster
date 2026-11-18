import {
  DEFAULT_BRAND,
  DEFAULT_SURFACE,
  describeProblem,
  STANDARD_CARDS,
  TEXT_TONES,
  type BrandProblem,
  type BrandTokens,
  type CardSurfaceTokens,
  type CardTokens,
  type SurfaceTokens,
} from '@deckster/brand';
import { brandTokensJson, loadBrand } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { checkBrandLayouts } from '@deckster/kit/catalog';
import { loadLayoutCatalog } from '@deckster/vite-plugin';
import { Console, Effect } from 'effect';
import path from 'node:path';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { runBrandAdd } from '#commands/brand-add-run.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The subcommand word that validates a brand instead of printing it.
 */
const CHECK = 'check';

/**
 * The start of a problem path inside `layouts.ts`.
 */
const LAYOUTS_PATH_PREFIX = 'layouts[';

/**
 * The subcommand word that adds a brand from a git repository.
 */
const ADD = 'add';

/**
 * What `deck brand check` found: the brand file, and its problems by severity.
 */
type BrandCheck = {
  /**
   * The brand file as authors see it.
   */
  file: string;

  /**
   * The brand's `layouts.ts` as authors see it, or `undefined` when the brand has none. Problems
   * with a path under `layouts[` belong to it.
   */
  layoutsFile?: string;

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
  if (argv.find((argument) => !argument.startsWith('-')) === ADD) {
    const at = argv.indexOf(ADD);
    return yield* runBrandAdd([...argv.slice(0, at), ...argv.slice(at + 1)]);
  }

  const { values, positionals } = yield* parseCommandArgs('brand', argv, {
    json: { type: 'boolean', default: false },
  });
  const [first, second] = positionals;
  if (first === CHECK) {
    if (second === undefined) {
      return yield* usageError(
        'Which brand? Name one, for example `' + deckCommand() + ' brand check default`.',
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
  const base = yield* loadLayoutCatalog();
  const result = yield* loadBrand(root, name).pipe(
    Effect.map((brand): BrandCheck => {
      const layouts = checkBrandLayouts(
        brand.tokens.layouts,
        [...base.values()].map((layout) => layout.contract),
      );
      return {
        file: brand.location.displayPath,
        ...(brand.layoutsFile === undefined
          ? {}
          : { layoutsFile: path.relative(root, brand.layoutsFile) }),
        errors: layouts.errors,
        warnings: [...brand.warnings, ...layouts.warnings],
      };
    }),
    Effect.catchTag('BrandError', (error) =>
      Effect.succeed<BrandCheck>({ file: error.source, errors: error.problems, warnings: [] }),
    ),
  );
  const ok = result.errors.length === 0;
  if (json) {
    yield* printJson({
      brand: name,
      ok,
      ...result,
      errors: result.errors.map((problem) => ({ ...problem, file: fileOf(problem, result) })),
      warnings: result.warnings.map((problem) => ({ ...problem, file: fileOf(problem, result) })),
    });
  } else {
    yield* Console.log(formatCheck(name, result));
  }

  return ok ? EXIT_OK : EXIT_FAILED;
});

/**
 * The file a problem is in: layout problems (paths such as `layouts[2].regions[0].box`) are in
 * `layouts.ts`, every other problem in the brand file.
 *
 * @param problem - One problem.
 * @param check - The check, for its files.
 */
function fileOf(problem: BrandProblem, check: BrandCheck): string {
  return problem.path.startsWith(LAYOUTS_PATH_PREFIX) && check.layoutsFile !== undefined
    ? check.layoutsFile
    : check.file;
}

/**
 * The plain-text report `deck brand check` prints: each file with its problems and their fixes, and
 * a verdict line.
 *
 * @param name - The brand folder name.
 * @param check - What the check found.
 */
function formatCheck(name: string, check: BrandCheck): string {
  const { errors, warnings } = check;
  const lines: string[] = [];
  const files = [check.file, ...(check.layoutsFile === undefined ? [] : [check.layoutsFile])];
  for (const file of files) {
    lines.push(file);
    for (const [severity, problems] of [
      ['error', errors],
      ['warning', warnings],
    ] as const) {
      for (const problem of problems.filter((entry) => fileOf(entry, check) === file)) {
        lines.push(`  ${severity.padEnd('warning'.length)} ${describeProblem(problem)}`);
        lines.push(`          Fix: ${problem.fix}`);
      }
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
    layoutsLine(tokens),
    'Surfaces:',
    ...Object.values(tokens.surfaces).map(
      (surface) =>
        `  ${surface.name} (${surface.scheme}): ${Object.entries(surface.roles)
          .map(([role, color]) => `${role} ${color}`)
          .join(', ')}${smallTextNote(surface)}`,
    ),
    ...diagramLines(tokens),
  ];
  if (warnings.length > 0) {
    lines.push(
      `${count(warnings.length, 'warning')}; run \`${deckCommand()} brand check ${tokens.name}\`.`,
    );
  }

  lines.push(`Run \`${deckCommand()} brand ${tokens.name} --json\` for every token.`);
  return lines.join('\n');
}

/**
 * The summary line for the brand's own layouts: how many and their names, or that it has none.
 *
 * @param tokens - The resolved tokens.
 */
function layoutsLine(tokens: BrandTokens): string {
  const { layouts } = tokens;
  if (layouts.length === 0) {
    return "Layouts: none (layouts.ts adds the brand's own slide layouts)";
  }

  return `Layouts: ${layouts.length} (${layouts.map((layout) => layout.name).join(', ')})`;
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

/**
 * The diagram look for the summary: edges, groups, labels and the kinds the brand maps to a card,
 * then each card with its colors on the default surface and its geometry. The brand's own cards are
 * marked; the standard ones exist in every brand.
 *
 * @param tokens - The resolved tokens.
 */
function diagramLines(tokens: BrandTokens): string[] {
  const { edges, groups, labels, kinds, cards } = tokens.diagram;
  const kindLine = Object.entries(kinds)
    .map(([kind, card]) => `${kind} ${card}`)
    .join(', ');
  const outline = groups.dashed ? `${groups.stroke}px dashed` : `${groups.stroke}px`;
  const surface = tokens.surfaces[DEFAULT_SURFACE] ?? Object.values(tokens.surfaces)[0];
  return [
    `Diagrams: edges ${edges.stroke}px, ${edges.corners} corners, ${edges.arrow} arrowheads; ` +
      `groups ${groups.stroke === 0 ? 'no outline' : outline}, radius ${groups.radius}px; ` +
      `${labels.style} edge labels${labels.type === 'label' ? ' in the label step' : ''}` +
      (kindLine === '' ? '' : `; kinds: ${kindLine}`),
    `Cards (colors on the ${surface?.name ?? DEFAULT_SURFACE} surface):`,
    ...Object.entries(cards).map(([name, card]) => {
      const own = (STANDARD_CARDS as readonly string[]).includes(name) ? '' : " (the brand's own)";
      return `  ${name}${own}: ${cardSummary(card, surface?.diagramCards[name])}`;
    }),
  ];
}

/**
 * One card for the summary: its fill, outline, corner radius, shape, shadow, icon, accent stripe
 * and title type.
 *
 * @param card - The card's geometry and title type.
 * @param colors - Its colors on the surface shown, if the surface has it.
 */
function cardSummary(card: CardTokens, colors: CardSurfaceTokens | undefined): string {
  const { title, accent } = card;
  const fill = colors?.fill === null ? 'no fill' : `fill ${colors?.fill ?? '?'}`;
  const border =
    colors?.border === null ? 'no border' : `border ${colors?.border ?? '?'} ${card.stroke}px`;
  const parts = [
    ...(colors === undefined ? [] : [fill, border]),
    `radius ${card.radius}px`,
    ...(card.shape === 'kind' ? [] : [`${card.shape} shape`]),
    ...(card.shadow === 'none' ? [] : [`${card.shadow} shadow`]),
    `${card.icon} icon`,
    ...(accent.side === 'none' ? [] : [`${accent.side} accent ${accent.width}px`]),
    `title ${title.family} ${title.weight}${title.case === 'upper' ? ' upper' : ''}`,
  ];
  return parts.join(', ');
}
