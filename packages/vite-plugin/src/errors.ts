import { Effect, Schema } from 'effect';

/**
 * One thing wrong with a file, and how to fix it.
 */
export const Problem = Schema.Struct({
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
 * One thing wrong with a file, and how to fix it.
 */
export type Problem = typeof Problem.Type;

/**
 * A deck or slide the build cannot use. The message names the file (relative to the workspace) and
 * lists every problem with its fix, so one build run reports everything wrong with a file. Build it
 * with {@link deckBuildError}, which writes the message.
 */
export class DeckBuildError extends Schema.TaggedError<DeckBuildError>()('DeckBuildError', {
  /**
   * Absolute path of the file at fault; Vite's error overlay links to it.
   */
  id: Schema.String,

  /**
   * Every problem found in the file.
   */
  problems: Schema.Array(Problem),

  /**
   * The summary, the file, and every problem with its fix, one per line.
   */
  message: Schema.String,
}) {}

/**
 * What {@link deckBuildError} needs: the file, what went wrong overall and every problem.
 */
export type DeckBuildErrorOptions = FileRef & {
  /**
   * What went wrong overall, such as "Invalid frontmatter".
   */
  summary: string;

  /**
   * Every problem found in the file.
   */
  problems: readonly Problem[];
};

/**
 * Builds a {@link DeckBuildError} whose message names the file and lists every problem and fix.
 *
 * @param options - The file, the summary and the problems.
 */
export function deckBuildError(options: DeckBuildErrorOptions): DeckBuildError {
  return new DeckBuildError({
    id: options.file,
    problems: options.problems,
    message: formatMessage(options.displayPath, options.summary, options.problems),
  });
}

/**
 * Where a problem was found: the absolute path and the path to show to the author.
 */
export type FileRef = {
  /**
   * The absolute path of the file.
   */
  file: string;

  /**
   * The file relative to the workspace root, with forward slashes, for messages.
   */
  displayPath: string;
};

/**
 * Frontmatter or a deck config that does not match its schema.
 */
export function invalidFields(
  ref: FileRef,
  what: string,
  problems: readonly Problem[],
): DeckBuildError {
  return deckBuildError({ ...ref, summary: `Invalid ${what}`, problems });
}

/**
 * A frontmatter block or deck config that could not be parsed at all.
 */
export function unreadableFile(ref: FileRef, what: string, problem: Problem): DeckBuildError {
  return deckBuildError({ ...ref, summary: `Could not read the ${what}`, problems: [problem] });
}

/**
 * A deck whose manifest and slide files disagree.
 */
export function invalidSlideList(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({
    ...ref,
    summary: 'The slide list does not match the slide files',
    problems,
  });
}

/**
 * A deck whose every slide is hidden, so a talk would have nothing to show.
 */
export function noShownSlide(ref: FileRef, deckId: string): DeckBuildError {
  return deckBuildError({
    ...ref,
    summary: 'Every slide of the deck is hidden',
    problems: [
      {
        message: `Every slide of the deck "${deckId}" has \`hidden: true\`, so there is nothing to show.`,
        fix: 'Show at least one slide: remove `hidden: true` from one of them.',
      },
    ],
  });
}

/**
 * MDX that does not compile.
 */
export function invalidMdx(ref: FileRef, problem: Problem): DeckBuildError {
  return deckBuildError({ ...ref, summary: 'The slide is not valid MDX', problems: [problem] });
}

/**
 * A slide whose exports the build cannot accept: a missing default export, a reserved name, or
 * metadata exported in a form the build does not read.
 */
export function invalidExports(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({ ...ref, summary: "The slide's exports are not valid", problems });
}

/**
 * A slide that fills its layout's slots wrongly: a missing required slot, a slot tag the layout
 * does not have, a slot used twice or nested inside another element.
 */
export function invalidSlots(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({ ...ref, summary: "The slide does not fit its layout's slots", problems });
}

/**
 * A layout catalog that cannot be loaded, or whose contracts are invalid.
 */
export function invalidLayoutCatalog(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({ ...ref, summary: 'Invalid layout catalog', problems });
}

/**
 * A brand's `layouts.ts` whose layouts do not fit the layouts they fall back to, or clash with a
 * layout in the catalog.
 */
export function invalidBrandLayouts(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({ ...ref, summary: 'Invalid brand layouts', problems });
}

/**
 * An MDX extension that cannot be loaded, or whose default export is not an extension.
 */
export function invalidMdxExtension(ref: FileRef, problems: readonly Problem[]): DeckBuildError {
  return deckBuildError({ ...ref, summary: 'Invalid MDX extension', problems });
}

/**
 * A deck name that matches no folder under `decks/`.
 */
export function deckNotFound(ref: FileRef, problem: Problem): DeckBuildError {
  return deckBuildError({ ...ref, summary: 'No such deck', problems: [problem] });
}

/**
 * A runtime plugin specifier the build cannot resolve.
 */
export function unresolvedRuntimePlugin(ref: FileRef, problem: Problem): DeckBuildError {
  return deckBuildError({
    ...ref,
    summary: 'A runtime plugin could not be found',
    problems: [problem],
  });
}

/**
 * Runs a synchronous parser that throws {@link DeckBuildError}s, moving them into the error channel.
 * Anything else it throws is a bug and becomes a defect.
 *
 * @param evaluate - The parser call.
 */
export function tryDeckBuild<A>(evaluate: () => A): Effect.Effect<A, DeckBuildError> {
  return Effect.try({ try: evaluate, catch: (error) => error }).pipe(
    Effect.catch((error) =>
      error instanceof DeckBuildError ? Effect.fail(error) : Effect.die(error),
    ),
  );
}

/**
 * The error message: the summary and the file, then each problem and its fix.
 *
 * @param displayPath - The file as shown to authors.
 * @param summary - What went wrong overall.
 * @param problems - Every problem found.
 */
function formatMessage(displayPath: string, summary: string, problems: readonly Problem[]): string {
  const lines = [`${summary} in ${displayPath}:`];
  for (const problem of problems) {
    lines.push(`  - ${problem.message}`, `    Fix: ${problem.fix}`);
  }

  return lines.join('\n');
}
