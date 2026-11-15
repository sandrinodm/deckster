import { Schema } from 'effect';

/**
 * A failure of the turn guard: a snapshot that could not be taken, a restore that did not finish,
 * an agent turn still running in another process, or a deck path that leads outside the deck. The
 * message says what went wrong and what to do next.
 */
export class TurnGuardError extends Schema.TaggedError<TurnGuardError>()('TurnGuardError', {
  /**
   * What went wrong and what to do next.
   */
  message: Schema.String,
}) {}

/**
 * Builds a {@link TurnGuardError} from what went wrong and how to fix it.
 *
 * @param problem - What went wrong.
 * @param fix - What to do next.
 */
export function turnGuardError(problem: string, fix: string): TurnGuardError {
  return new TurnGuardError({ message: `${problem}\n${fix}` });
}
