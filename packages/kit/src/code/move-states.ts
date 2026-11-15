import { Children, isValidElement, type ReactNode } from 'react';

import { CodeStep } from '#code/code-step.tsx';

/**
 * One state of a `CodeMove` that still needs highlighting.
 */
export type MoveSource = {
  /**
   * The code.
   */
  code: string;

  /**
   * The state's own language, if it has one.
   */
  lang?: string;
};

/**
 * What a `CodeMove` can be given instead of build-time data: a list of strings or `{ code, lang }`
 * objects, or `<CodeStep>` children.
 */
export type MoveInput = {
  /**
   * The states as a list.
   */
  steps: readonly (string | MoveSource)[] | undefined;

  /**
   * `<CodeStep>` elements.
   */
  children: ReactNode;
};

/**
 * The states a `CodeMove` was given, in order.
 *
 * @param input - The `steps` prop and the children.
 * @returns The sources; empty when the component got neither.
 */
export function moveSources(input: MoveInput): MoveSource[] {
  if (input.steps !== undefined) {
    return input.steps.map((step) => (typeof step === 'string' ? { code: step } : step));
  }

  const sources: MoveSource[] = [];
  for (const child of Children.toArray(input.children)) {
    if (!isValidElement<{ code?: string; lang?: string; children?: ReactNode }>(child)) {
      continue;
    }

    if (child.type === CodeStep) {
      const text = child.props.code ?? textOf(child.props.children);
      sources.push(
        child.props.lang === undefined ? { code: text } : { code: text, lang: child.props.lang },
      );
    }
  }

  return sources;
}

/**
 * The slide step at which each state after the first appears: `first`, `first + 1`, and so on.
 *
 * @param count - The number of states.
 * @param first - The step of the second state, defaults to 1.
 * @returns One step per state after the first; empty for fewer than two states.
 */
export function moveAts(count: number, first = 1): number[] {
  return Array.from({ length: Math.max(0, count - 1) }, (_, index) => first + index);
}

/**
 * The index of the state to show at a slide step: how many of the component's own steps have been
 * reached. Steps of other components in between do not count.
 *
 * @param ats - The component's steps, from {@link moveAts}.
 * @param current - The slide's current step value, 0 before any step.
 */
export function moveIndexAt(ats: readonly number[], current: number): number {
  return ats.filter((at) => at <= current).length;
}

/**
 * The text of a node that is a string, or the strings in a list of them.
 *
 * @param node - A React node.
 */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .filter((child) => typeof child === 'string')
    .join('');
}
