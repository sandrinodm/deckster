import { Cause, Effect, Exit, Scope, Semaphore } from 'effect';
import { randomUUID } from 'node:crypto';

import type { ChooserLink } from '#chooser/chooser-link.ts';
import type { CommandError } from '#command.ts';

/**
 * A selected deck and an optional account of whether its agent has work in progress.
 */
export type ChooserDeck = {
  /**
   * The origin used to serve the selected deck.
   */
  readonly url: string;

  /**
   * Checks for running or queued turns. Omission means the deck has no active agent.
   */
  readonly busy?: Effect.Effect<boolean>;

  /**
   * Keeps the launcher open when the deck uses a separate operator window.
   */
  readonly stayOnChooser?: boolean;
};

/**
 * Starts one deck in the selection's scope. The chooser closes that scope on a switch.
 */
export type OpenChooserDeck<R> = (
  deck: string,
  launcher: ChooserLink,
) => Effect.Effect<ChooserDeck, CommandError, R | Scope.Scope>;

/**
 * An open deck and the resources that must close before another deck opens.
 */
type Selection = {
  /**
   * The selected deck folder name.
   */
  readonly name: string;

  /**
   * The identifier used to reject stale confirmations and return actions.
   */
  readonly key: string;

  /**
   * The scope that closes the deck server and its tools.
   */
  readonly scope: Scope.Closeable;

  /**
   * The deck URL and its operator state.
   */
  readonly deck: ChooserDeck;
};

/**
 * The outcome of a requested deck switch or close.
 */
type Change =
  | { readonly kind: 'opened'; readonly deck: ChooserDeck }
  | { readonly kind: 'closed' }
  | { readonly kind: 'busy'; readonly key: string }
  | { readonly kind: 'stale' }
  | { readonly kind: 'failed'; readonly cause: unknown };

/**
 * An operator request to change the active deck.
 */
type DeckChange = {
  /**
   * The deck folder to open. Undefined closes the active deck.
   */
  readonly name: string | undefined;

  /**
   * The selection a Back to decks navigation came from, if given.
   */
  readonly expected: string | undefined;

  /**
   * The selection the operator confirmed may stop its running agent, if given.
   */
  readonly confirmation: string | undefined;
};

/**
 * The operations on the chooser’s single active selection.
 */
type SelectionApi<R> = {
  /**
   * Reads the active deck without interrupting a switch or opening a new deck.
   */
  readonly current: () => Omit<Selection, 'scope'> | undefined;

  /**
   * Closes the current scope during launcher shutdown.
   */
  readonly close: Effect.Effect<void>;

  /**
   * Serializes requests so simultaneous tabs cannot keep two decks active.
   */
  readonly change: (request: DeckChange) => Effect.Effect<Change, never, R>;
};

/**
 * Owns the active deck. A changed selection closes the old scope before opening the next. Busy
 * agents require confirmation of the current selection; stale confirmations never stop a different
 * deck.
 */
export const makeChooserSelection = Effect.fn('makeChooserSelection')(function* <R>(
  open: OpenChooserDeck<R>,
  getPort: () => number,
): Effect.fn.Return<SelectionApi<R>> {
  const queue = yield* Semaphore.make(1);
  const usedPorts = new Set<number>();
  let active: Selection | undefined;

  const close = Effect.suspend(() => {
    const previous = active;
    active = undefined;
    return previous === undefined ? Effect.void : Scope.close(previous.scope, Exit.void);
  }).pipe(Effect.uninterruptible);
  return {
    current: () => active,
    close,
    change: (request) => queue.withPermits(1)(change(request)),
  };

  /**
   * Checks that the action still applies to the same deck before closing it.
   */
  function change({ name, expected, confirmation }: DeckChange): Effect.Effect<Change, never, R> {
    return Effect.gen(function* () {
      if (expected !== undefined && expected !== active?.key) {
        return { kind: 'stale' };
      }

      if (confirmation !== undefined && confirmation !== active?.key) {
        return { kind: 'stale' };
      }

      if (active !== undefined) {
        if (active.name === name) {
          return { kind: 'opened', deck: active.deck };
        }

        const busy = yield* active.deck.busy ?? Effect.succeed(false);
        if (busy && confirmation !== active.key) {
          return { kind: 'busy', key: active.key };
        }

        yield* close;
      }

      return name === undefined ? { kind: 'closed' } : yield* start(name);
    });
  }

  /**
   * Opens a new deck and retires its scope if startup fails or is interrupted.
   */
  function start(name: string): Effect.Effect<Change, never, R> {
    return Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const scope = yield* Scope.make();
        const key = randomUUID();
        const launch = open(name, { port: getPort(), key, claimPort }).pipe(Scope.provide(scope));
        const result = yield* restore(launch).pipe(Effect.exit);
        if (Exit.isFailure(result)) {
          yield* Scope.close(scope, result);
          if (Cause.hasInterruptsOnly(result.cause)) {
            return yield* Effect.interrupt;
          }

          return { kind: 'failed', cause: Cause.squash(result.cause) };
        }

        active = { name, key, scope, deck: result.value };
        return { kind: 'opened', deck: result.value };
      }),
    );
  }

  /**
   * Rejects ports already used by this chooser to isolate previous deck origins.
   */
  function claimPort(port: number): boolean {
    if (usedPorts.has(port)) {
      return false;
    }

    usedPorts.add(port);
    return true;
  }
});
