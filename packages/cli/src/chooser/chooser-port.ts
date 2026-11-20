import { Effect, Exit, Scope } from 'effect';

import type { CliError, ViteError } from '#cli-error.ts';

/**
 * How many times a chooser can retry when the operating system reassigns a previous deck's port.
 */
const RETRIES = 4;

/**
 * Signals that an already used origin must be rejected before publishing the new selection.
 */
export const CHOOSER_PORT_REUSED = {
  /**
   * Distinguishes a safe bind retry from a startup failure.
   */
  _tag: 'DeckPortReused',
} as const;

/**
 * Opens a chooser deck server in a child scope and retries reused ports. Every failed or
 * interrupted attempt closes its resources before another bind. Other errors propagate unchanged.
 */
export function withFreshChooserPort<A, E extends CliError | ViteError, R>(
  open: Effect.Effect<A, E | typeof CHOOSER_PORT_REUSED, R | Scope.Scope>,
  exhausted: () => E,
): Effect.Effect<A, E, R | Scope.Scope> {
  return Effect.gen(function* () {
    const owner = yield* Effect.scope;
    const attempt = Effect.gen(function* () {
      const scope = yield* Scope.fork(owner);
      return yield* open.pipe(
        Scope.provide(scope),
        Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(scope, exit) : Effect.void)),
      );
    });
    return yield* attempt.pipe(
      Effect.retry({
        times: RETRIES,
        while: (error) => error._tag === CHOOSER_PORT_REUSED._tag,
      }),
      Effect.catchTag(CHOOSER_PORT_REUSED._tag, () => Effect.fail(exhausted())),
    );
  });
}
