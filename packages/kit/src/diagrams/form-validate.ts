import type { DiagramProblem } from '#diagrams/flow-validate.ts';

import { nearest } from '#diagrams/diagram-props.ts';
import { pushAll } from '#foundation/lists.ts';

/**
 * Checks a sequence diagram's cast and messages: at least one actor, no two actors with one id, and
 * messages that name actors that exist (with the nearest id for a typo). The build runs it on MDX
 * and the component on TSX.
 *
 * @param actors - The actors' ids, in order.
 * @param messages - Each message's ends.
 * @returns Every problem, as errors.
 */
export function checkSequence(
  actors: readonly string[],
  messages: readonly { from: string; to: string }[],
): DiagramProblem[] {
  const problems: DiagramProblem[] = [];
  if (actors.length === 0) {
    problems.push({
      severity: 'error',
      message: 'The <SequenceDiagram> has no <Actor>s.',
      fix: 'Add an <Actor id="..." title="..."> for each participant, before the messages.',
    });
  }

  pushAll(problems, duplicates(actors, '<Actor>'));
  for (const message of messages) {
    for (const end of [message.from, message.to]) {
      if (actors.includes(end)) {
        continue;
      }

      const near = nearest(end, actors);
      problems.push({
        severity: 'error',
        message:
          `<Message from="${message.from}" to="${message.to}"> names "${end}", which is not an ` +
          `<Actor>${near === undefined ? '.' : `; did you mean "${near}"?`}`,
        fix: `Use one of the actor ids: ${actors.map((id) => `"${id}"`).join(', ') || 'none yet'}.`,
      });
    }
  }

  return problems;
}

/**
 * Ids used more than once, as errors.
 *
 * @param ids - The ids, in order.
 * @param element - The element that carries them, for the message.
 */
export function duplicates(ids: readonly string[], element: string): DiagramProblem[] {
  const seen = new Set<string>();
  const reported = new Set<string>();
  const problems: DiagramProblem[] = [];
  for (const id of ids) {
    if (seen.has(id) && !reported.has(id)) {
      reported.add(id);
      problems.push({
        severity: 'error',
        message: `Two ${element}s have the id "${id}".`,
        fix: `Give every ${element} its own \`id\`.`,
      });
    }

    seen.add(id);
  }

  return problems;
}
