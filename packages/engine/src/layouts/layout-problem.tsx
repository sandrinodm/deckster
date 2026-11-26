import type { ReactNode } from 'react';

import { deckCommand } from '#contract/deck-command.ts';
import { SlideProblem } from '#deck/slide-problem.tsx';
import { useSlide } from '#steps/slide-context.ts';

/**
 * The id `data-deck-problem` carries when a layout's module failed to load or its component threw
 * while rendering.
 */
export const LAYOUT_LOAD_FAILED = 'layout-load-failed';

/**
 * Props of {@link LayoutProblem}.
 */
type LayoutProblemProps = {
  /**
   * The layout that failed.
   */
  layout: string;

  /**
   * What went wrong: loading the layout's module, or rendering its component.
   */
  stage: 'load' | 'render';

  /**
   * Why it failed, in a sentence or two.
   */
  reason: string;
};

/**
 * Shows a layout that failed in place of a slide that uses it, in the style of the engine's other
 * slide problems: "Layout `kpi-wall` failed to load: ...", with the layout's name in
 * `data-deck-problem-layout` and the id {@link LAYOUT_LOAD_FAILED} in `data-deck-problem` for tools
 * that report it. The other slides keep working.
 */
export function LayoutProblem({ layout, stage, reason }: LayoutProblemProps): ReactNode {
  const { file } = useSlide();
  const message =
    `Layout \`${layout}\` failed to ${stage}: ${reason}\n` +
    `Fix the layout's layout.tsx; \`${deckCommand()} dev\` shows the error with its stack.`;
  return (
    <SlideProblem file={file} message={message} problem={LAYOUT_LOAD_FAILED} layout={layout} />
  );
}
