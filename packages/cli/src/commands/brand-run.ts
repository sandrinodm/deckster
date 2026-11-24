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
  type DiagramLineStyle,
  type DiagramTextTokens,
  type SurfaceTokens,
} from '@deckster/brand';
import { brandTokensJson, loadBrand } from '@deckster/brand/node';
import { deckCommand } from '@deckster/engine/command';
import { localLayouts } from '@deckster/vite-plugin';
import { Console, Effect } from 'effect';

import { usageError } from '#cli-error.ts';
import { EXIT_FAILED, EXIT_OK, type Command } from '#command.ts';
import { runBrandAdd } from '#commands/brand-add-run.ts';
import { printJson, withJsonErrors } from '#json-output.ts';
import {
  brandProblemWithFile,
  checkCatalogLayouts,
  layoutProblemWithFile,
  layoutsDisplayPath,
  type BrandFileProblem,
} from '#layouts/check-brand-layouts.ts';
import { count } from '#lint/format-report.ts';
import { parseCommandArgs } from '#parse-command-args.ts';
import { Workspace } from '#workspace.ts';

/**
 * The subcommand word that validates a brand instead of printing it.
 */
const CHECK = 'check';

/**
 * The subcommand word that adds a brand from a git repository.
 */
const ADD = 'add';

/**
 * What `deckster brand check` found: the brand file, and its problems by severity.
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
  errors: readonly BrandFileProblem[];

  /**
   * The problems that do not.
   */
  warnings: readonly BrandFileProblem[];
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
  const { layouts: codeLayouts } = yield* localLayouts({
    root,
    brand: brand.location,
    code: 'skip',
  });
  yield* Console.log(
    summarize(brand.tokens, {
      file: brand.location.displayPath,
      warnings: brand.warnings,
      codeLayouts: codeLayouts.map((layout) => layout.name),
    }),
  );
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
    Effect.flatMap((brand) =>
      Effect.map(checkCatalogLayouts(root, brand, 'load'), (layouts): BrandCheck => {
        const file = brand.location.displayPath;
        const files = {
          file,
          ...(brand.layoutsFile === undefined ? {} : { layoutsFile: layoutsDisplayPath(file) }),
        };
        return {
          ...files,
          errors: [
            ...layouts.errors.map((problem) => brandProblemWithFile(problem, files)),
            ...layouts.local.problems.map((problem) => layoutProblemWithFile(brand, problem)),
          ],
          warnings: [...brand.warnings, ...layouts.warnings].map((problem) =>
            brandProblemWithFile(problem, files),
          ),
        };
      }),
    ),
    Effect.catchTag('BrandError', (error) => {
      const file = error.source;
      const errors = error.problems.map((problem) => brandProblemWithFile(problem, { file }));
      return Effect.succeed<BrandCheck>({ file, errors, warnings: [] });
    }),
  );
  const ok = result.errors.length === 0;
  if (json) {
    yield* printJson({ brand: name, ok, ...result });
  } else {
    yield* Console.log(formatCheck(name, result));
  }

  return ok ? EXIT_OK : EXIT_FAILED;
});

/**
 * The plain-text report `deckster brand check` prints: each file with its problems and their fixes,
 * and a verdict line.
 *
 * @param name - The brand folder name.
 * @param check - What the check found.
 */
function formatCheck(name: string, check: BrandCheck): string {
  const { errors, warnings } = check;
  const lines: string[] = [];
  const files = new Set([
    check.file,
    ...(check.layoutsFile === undefined ? [] : [check.layoutsFile]),
    ...[...errors, ...warnings].map((problem) => problem.file),
  ]);
  for (const file of files) {
    lines.push(file);
    for (const [severity, problems] of [
      ['error', errors],
      ['warning', warnings],
    ] as const) {
      for (const problem of problems.filter((entry) => entry.file === file)) {
        const id = problem.code === undefined ? '' : `${problem.code}: `;
        lines.push(`  ${severity.padEnd('warning'.length)} ${id}${describeProblem(problem)}`);
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
 * What the brand summary shows besides the tokens.
 */
type SummaryFacts = {
  /**
   * The brand file as authors see it.
   */
  file: string;

  /**
   * The brand's warnings.
   */
  warnings: readonly BrandProblem[];

  /**
   * The names of the brand's code layouts.
   */
  codeLayouts: readonly string[];
};

/**
 * A readable summary of a brand's tokens.
 *
 * @param tokens - The resolved tokens.
 * @param facts - The brand file, its warnings and its code layouts.
 */
function summarize(tokens: BrandTokens, { file, warnings, codeLayouts }: SummaryFacts): string {
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
    codeLayoutsLine(codeLayouts),
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
 * The summary line for the brand's code layouts: how many and their names, or that it has none.
 *
 * @param names - The names of the code layouts found in the brand's `layouts/` folder.
 */
function codeLayoutsLine(names: readonly string[]): string {
  if (names.length === 0) {
    return 'Code layouts: none (a layouts/<name>/ folder with contract.ts and layout.tsx adds one)';
  }

  return `Code layouts: ${names.length} (${names.join(', ')})`;
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
  const { align, edges, groups, labels, kinds, cards, nodes, notes } = tokens.diagram;
  const kindLine = Object.entries(kinds)
    .map(([kind, card]) => `${kind} ${card}`)
    .join(', ');
  const groupStyle = groups.lineStyle ?? (groups.dashed ? 'dashed' : undefined);
  const outline = groups.stroke === 0 ? 'no outline' : strokeSummary(groups.stroke, groupStyle);
  const surface = tokens.surfaces[DEFAULT_SURFACE] ?? Object.values(tokens.surfaces)[0];
  const geometry = [
    align === undefined ? undefined : `align ${align}`,
    nodes.width === 0 ? undefined : `node width ${nodes.width}px`,
    nodes.height === 0 ? undefined : `node minimum height ${nodes.height}px`,
    textSummary('subtitle', nodes.subtitle),
    textSummary('notes', notes),
  ].filter((part) => part !== undefined);
  const summary =
    `Diagrams: edges ${strokeSummary(edges.stroke, edges.lineStyle)}, ` +
    `${edges.corners} corners, ${edges.arrow} arrowheads; ` +
    `groups ${outline}, radius ${groups.radius}px; ` +
    `${labels.style} edge labels${labels.type === 'label' ? ' in the label step' : ''}` +
    (kindLine === '' ? '' : `; kinds: ${kindLine}`);
  return [
    summary,
    ...(geometry.length === 0 ? [] : [`  ${geometry.join(', ')}`]),
    `Cards (colors on the ${surface?.name ?? DEFAULT_SURFACE} surface):`,
    ...Object.entries(cards).map(([name, card]) => {
      const own = (STANDARD_CARDS as readonly string[]).includes(name) ? '' : " (the brand's own)";
      return `  ${name}${own}: ${cardSummary(card, surface?.diagramCards[name])}`;
    }),
  ];
}

/**
 * One card for the summary: its fill, outline, corner radius, shape, shadow, icon, accent stripe
 * and title and subtitle typography.
 *
 * @param card - The card's geometry and title type.
 * @param colors - Its colors on the surface shown, if the surface has it.
 */
function cardSummary(card: CardTokens, colors: CardSurfaceTokens | undefined): string {
  const { title, accent } = card;
  const fill = colors?.fill === null ? 'no fill' : `fill ${colors?.fill ?? '?'}`;
  const borderPattern = card.borderStyle === undefined ? '' : ` ${card.borderStyle}`;
  const border =
    colors?.border === null
      ? 'no border'
      : `border ${colors?.border ?? '?'} ${card.stroke}px${borderPattern}`;
  const iconBorder = iconBorderSummary(card, colors?.iconBorder);
  const subtitle = textSummary('subtitle', card.subtitle);
  const parts = [
    ...(colors === undefined ? [] : [fill, border]),
    `radius ${card.radius}px`,
    ...(card.shape === 'kind' ? [] : [`${card.shape} shape`]),
    ...(card.shadow === 'none' ? [] : [`${card.shadow} shadow`]),
    `${card.icon} icon`,
    iconBorder,
    ...(accent.side === 'none' ? [] : [`${accent.side} accent ${accent.width}px`]),
    `title ${title.family} ${title.weight}${title.case === 'upper' ? ' upper' : ''}`,
    subtitle,
  ];
  return parts.filter((part) => part !== undefined).join(', ');
}

/**
 * Shows the pattern only when it changes the usual solid stroke.
 */
function strokeSummary(width: number, style: DiagramLineStyle | undefined): string {
  return style === undefined || style === 'solid' ? `${width}px` : `${width}px ${style}`;
}

/**
 * Reports only icon border overrides written by the brand.
 */
function iconBorderSummary(card: CardTokens, color: string | undefined): string | undefined {
  const { iconBorderStyle: style, iconBorderWidth: width } = card;
  const parts = [color, width === undefined ? undefined : `${width}px`, style].filter(
    (part) => part !== undefined,
  );
  return parts.length === 0 ? undefined : `icon border ${parts.join(' ')}`;
}

/**
 * Reports only typography overrides written by the brand.
 */
function textSummary(name: string, text: DiagramTextTokens): string | undefined {
  const { type, family, weight, tracking } = text;
  const parts = [
    type,
    family?.name,
    weight,
    tracking === undefined ? undefined : `${tracking}em`,
    text.case,
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : `${name} ${parts.join(' ')}`;
}
