import { Schema } from 'effect';

/**
 * One thing wrong with a brand: where, what, and how to fix it.
 */
export const BrandProblem = Schema.Struct({
  /**
   * The field at fault, such as `color.surfaces.inverse.muted`; empty for the brand as a whole.
   */
  path: Schema.String,

  /**
   * What is wrong, as a sentence.
   */
  message: Schema.String,

  /**
   * What to change to fix it, as a sentence.
   */
  fix: Schema.String,
});

/**
 * One thing wrong with a brand: where, what, and how to fix it.
 */
export type BrandProblem = typeof BrandProblem.Type;

/**
 * Options for {@link brandError}.
 */
export type BrandErrorOptions = {
  /**
   * What went wrong overall, such as "Invalid brand".
   */
  summary: string;

  /**
   * The brand file as shown to authors, such as `brands/acme/brand.ts`.
   */
  source: string;

  /**
   * The absolute path of the brand file, when there is one.
   */
  file?: string | undefined;

  /**
   * Every problem found, in the order the checks found them.
   */
  problems: readonly BrandProblem[];
};

/**
 * A brand the build cannot use. The message names the brand file and lists every problem with its
 * field and fix, so one run reports all of them. {@link brandError} builds it and writes the
 * message.
 */
export class BrandError extends Schema.TaggedError<BrandError>()('BrandError', {
  /**
   * What went wrong overall, such as "Invalid brand".
   */
  summary: Schema.String,

  /**
   * The brand file as shown to authors, such as `brands/acme/brand.ts`.
   */
  source: Schema.String,

  /**
   * The absolute path of the brand file, when there is one.
   */
  file: Schema.optional(Schema.String),

  /**
   * Every problem found, in the order the checks found them.
   */
  problems: Schema.Array(BrandProblem),

  /**
   * The summary, the brand file, and every problem with its fix, one per line.
   */
  message: Schema.String,
}) {}

/**
 * Builds a {@link BrandError} whose message lists every problem with its field and fix.
 *
 * @param options - The summary, the brand file and the problems.
 */
export function brandError(options: BrandErrorOptions): BrandError {
  return new BrandError({
    summary: options.summary,
    source: options.source,
    file: options.file,
    problems: options.problems,
    message: formatMessage(options),
  });
}

/**
 * A problem's field and message as one sentence, such as `color.roles.fg: Expected a color`.
 *
 * @param problem - A brand problem.
 */
export function describeProblem(problem: BrandProblem): string {
  return problem.path === '' ? problem.message : `${problem.path}: ${problem.message}`;
}

/**
 * The error message: the summary and the brand file, then each problem and its fix.
 *
 * @param options - The summary, the brand file and the problems.
 */
function formatMessage(options: BrandErrorOptions): string {
  const lines = [`${options.summary} in ${options.source}:`];
  for (const problem of options.problems) {
    lines.push(`  - ${describeProblem(problem)}`, `    Fix: ${problem.fix}`);
  }

  return lines.join('\n');
}
