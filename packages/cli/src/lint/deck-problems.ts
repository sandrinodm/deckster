import { describeProblem, type BrandError, type BrandProblem } from '@deckster/brand';
import { deckCommand } from '@deckster/engine/command';
import { DeckBuildError, type DeckLocation } from '@deckster/vite-plugin';
import { Schema } from 'effect';
import path from 'node:path';

import { LintFinding } from '#lint/types.ts';
import { collectDeckErrors } from '#report-error.ts';

/**
 * The rule id of problems found by the build pipeline.
 */
export const SCHEMA_RULE_ID = 'schema';

/**
 * The rule id of problems with the brand a deck renders in: they come from the brand file, not from
 * any slide, and `deck brand check <name>` reports the same ones without a deck.
 */
export const BRAND_RULE_ID = 'brand';

/**
 * A deck that cannot be rendered because of the findings it carries.
 */
export class DeckProblemsError extends Schema.TaggedError<DeckProblemsError>()(
  'DeckProblemsError',
  {
    /**
     * Every problem the build pipeline found, one per file and field.
     */
    findings: Schema.Array(LintFinding),

    /**
     * The deck, each finding with its file and fix, and what to run next.
     */
    message: Schema.String,
  },
) {}

/**
 * Builds a {@link DeckProblemsError} whose message lists every finding with its file and fix.
 *
 * @param findings - The problems that stop the deck from rendering.
 * @param deckId - The deck folder name.
 */
export function deckProblemsError(
  findings: readonly LintFinding[],
  deckId: string,
): DeckProblemsError {
  return new DeckProblemsError({ findings, message: formatProblems(findings, deckId) });
}

/**
 * Where problems are found: the workspace, and the deck's folders.
 */
export type DeckPlace = {
  /**
   * The absolute workspace root, for file names relative to it.
   */
  workspaceRoot: string;

  /**
   * The deck's folders, to map a slide file to its slide id.
   */
  location: DeckLocation;
};

/**
 * Turns a thrown build error into findings, one per problem, each with the file and its fix.
 *
 * @param error - What the build pipeline threw: deck errors, possibly wrapped, or anything else.
 * @param place - The deck, to map files to slide ids.
 */
export function findingsFromError(error: unknown, place: DeckPlace): LintFinding[] {
  const deckErrors = collectDeckErrors(error);
  if (deckErrors.length === 0) {
    return [unknownErrorFinding(error, place)];
  }

  return deckErrors.flatMap((deckError) => findingsFromDeckError(deckError, place));
}

/**
 * Turns manifest warnings, such as slide files the deck config does not list, into findings.
 *
 * @param warnings - The warnings from `loadDeck`.
 * @param place - The deck.
 */
export function findingsFromWarnings(warnings: readonly string[], place: DeckPlace): LintFinding[] {
  return warnings.map((warning) => ({
    slide: null,
    file: displayFile(place.workspaceRoot, place.location.configFile),
    step: null,
    rule: SCHEMA_RULE_ID,
    severity: 'warning',
    message: warning,
    fix: 'List the slide in deck.config.ts, or delete the file if it is unused.',
    selector: null,
  }));
}

/**
 * Turns a brand that does not load into findings, one per problem, at the brand file.
 *
 * @param error - The brand error.
 */
export function findingsFromBrandError(error: BrandError): LintFinding[] {
  return error.problems.map((problem) => brandFinding(error.source, problem, 'error'));
}

/**
 * Turns a brand's non-fatal problems, such as waived contrast, into warnings at the brand file,
 * each once, however many surfaces repeat it.
 *
 * @param source - The brand file as authors see it, such as `brands/acme/brand.ts`.
 * @param warnings - The brand's warnings.
 */
export function findingsFromBrandWarnings(
  source: string,
  warnings: readonly BrandProblem[],
): LintFinding[] {
  const seen = new Set<string>();
  return warnings.flatMap((warning) => {
    const key = `${warning.path}\n${warning.message}`;
    if (seen.has(key)) {
      return [];
    }

    seen.add(key);
    return [brandFinding(source, warning, 'warning')];
  });
}

/**
 * The path to show authors: relative to the workspace, with forward slashes.
 *
 * @param workspaceRoot - The absolute workspace root.
 * @param file - An absolute path.
 */
export function displayFile(workspaceRoot: string, file: string): string {
  return path.relative(workspaceRoot, file).split(path.sep).join('/');
}

/**
 * One brand problem as a finding: rule `brand`, at the brand file, with no slide or step (it holds
 * for every slide), its message naming the field at fault.
 *
 * @param source - The brand file as authors see it, such as `brands/acme/brand.ts`.
 * @param problem - The problem.
 * @param severity - Whether it fails the deck.
 */
function brandFinding(
  source: string,
  problem: BrandProblem,
  severity: 'error' | 'warning',
): LintFinding {
  return {
    slide: null,
    file: source,
    step: null,
    rule: BRAND_RULE_ID,
    severity,
    message: describeProblem(problem),
    fix: problem.fix,
    selector: null,
  };
}

/**
 * The brand folder name in a brand file path: `acme` for `brands/acme/brand.ts`.
 *
 * @param source - The brand file as authors see it.
 */
export function brandName(source: string): string {
  const parts = source.split('/');
  return parts.at(-2) ?? source;
}

/**
 * One finding per problem of a deck build error, with its file and slide.
 *
 * @param error - The deck build error.
 * @param place - The deck.
 */
function findingsFromDeckError(error: DeckBuildError, place: DeckPlace): LintFinding[] {
  const file = displayFile(place.workspaceRoot, error.id);
  const slide = slideIdForFile(error.id, place.location);
  return error.problems.map((problem) => ({
    slide,
    file,
    step: null,
    rule: SCHEMA_RULE_ID,
    severity: 'error',
    message: problem.message,
    fix: problem.fix,
    selector: null,
  }));
}

/**
 * A finding for an error that is not a deck build error: its first line, at the file it names or
 * else the deck config.
 *
 * @param error - Whatever the build pipeline threw.
 * @param place - The deck.
 */
function unknownErrorFinding(error: unknown, place: DeckPlace): LintFinding {
  const detail = error instanceof Error ? error.message : String(error);
  const file = readErrorFile(error) ?? place.location.configFile;
  return {
    slide: slideIdForFile(file, place.location),
    file: displayFile(place.workspaceRoot, file),
    step: null,
    rule: SCHEMA_RULE_ID,
    severity: 'error',
    message: detail.split('\n')[0] ?? detail,
    fix: 'Fix the error above in that file, then run the command again.',
    selector: null,
  };
}

/**
 * The file an error names in its `id`, as Vite and Rollup errors do.
 *
 * @param error - Any thrown value.
 * @returns The absolute path, or `undefined` when there is none.
 */
function readErrorFile(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('id' in error)) {
    return undefined;
  }

  return typeof error.id === 'string' ? error.id : undefined;
}

/**
 * The slide id of a file in the deck's `slides/` folder, or `null` for any other file.
 *
 * @param file - An absolute path.
 * @param location - The deck.
 */
function slideIdForFile(file: string, location: DeckLocation): string | null {
  if (path.dirname(file) !== location.slidesDir) {
    return null;
  }

  return path.basename(file, path.extname(file));
}

/**
 * The message of a {@link DeckProblemsError}: each finding with its file and fix, then what to run.
 *
 * @param findings - The problems.
 * @param deckId - The deck folder name.
 */
function formatProblems(findings: readonly LintFinding[], deckId: string): string {
  const lines = [`Deck "${deckId}" cannot be rendered:`];
  for (const finding of findings) {
    lines.push(`  ${finding.file}: ${finding.message}`, `    Fix: ${finding.fix}`);
  }

  lines.push(`Fix these, then run \`${deckCommand()} lint ${deckId}\` to check the deck.`);
  return lines.join('\n');
}
