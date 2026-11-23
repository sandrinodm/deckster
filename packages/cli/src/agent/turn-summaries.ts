import type { AgentEvent } from '@deckster/agent/protocol/events';
import type { AgentSessionsApi } from '@deckster/agent/sessions';

import { Console, Effect, Stream } from 'effect';

/**
 * One line for the terminal about an agent event worth seeing there, or undefined: a turn that
 * ended, what the turn wrote outside the deck's content (ignored or put back), an error.
 *
 * @param event - The event.
 */
export function turnSummary(event: AgentEvent): string | undefined {
  if (event.type === 'turn-done') {
    const files = changedFilesSummary(event.changedFiles);
    return `  Agent turn ${event.turn ?? '?'} ${event.status}: ${files}.`;
  }

  if (event.type === 'reverted') {
    const paths = event.paths.map((item) => item.path).join(', ');
    return `  Agent: ignored what the turn wrote outside the slides: ${paths}.`;
  }

  if (event.type === 'error') {
    return `  Agent: ${event.message}${event.fix === '' ? '' : ` ${event.fix}`}`;
  }

  return undefined;
}

/**
 * Prints a short line for every new turn summary, reverted change and error, for as long as the
 * caller's scope lives (`deckster present` keeps the terminal to such a status).
 *
 * @param sessions - The agent host.
 */
export const printTurnSummaries = Effect.fn('printTurnSummaries')(function* (
  sessions: AgentSessionsApi,
) {
  const seen = (yield* sessions.history).reduce((last, event) => Math.max(last, event.seq), 0);
  const events = yield* sessions.subscribe;
  yield* events.pipe(
    Stream.filter((event) => event.seq > seen),
    Stream.runForEach((event) => {
      const line = turnSummary(event);
      return line === undefined ? Effect.void : Console.log(line);
    }),
    Effect.forkScoped,
  );
});

/**
 * Describes the files changed by one turn, retaining their reported order.
 */
function changedFilesSummary(files: readonly { readonly path: string }[]): string {
  const count = files.length;
  if (count === 0) {
    return 'no files changed';
  }

  const noun = count === 1 ? 'file' : 'files';
  return `${count} ${noun} changed (${files.map((file) => file.path).join(', ')})`;
}
