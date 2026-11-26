import { deckCommand } from '@deckster/engine/command';

import type { SlideRule } from '#lint/types.ts';

import { firstLine } from '#cli-error.ts';

/**
 * A slide whose code layout failed: the layout's `layout.tsx` threw while it loaded or rendered,
 * and the engine drew the problem in place of the slide (`data-deck-problem="layout-load-failed"`).
 * Only the slides on that layout are broken.
 */
export const layoutLoadFailedRule: SlideRule = {
  /**
   * The rule id shown in findings, the same as the engine's problem id.
   */
  id: 'layout-load-failed',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * A step can fail on its own, as with `render-error`.
   */
  scope: 'step',

  /**
   * A slide that does not render fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deckster lint --help` lists for the rule.
   */
  description: "A code layout's layout.tsx threw while loading or rendering the slide.",

  /**
   * Reports the layout that failed, by name.
   */
  check: ({ snapshot }) => {
    const layout = snapshot.renderError?.failedLayout;
    if (snapshot.renderError === null || layout === undefined) {
      return [];
    }

    return [
      {
        message:
          `The layout "${layout}" failed, so the slide shows an error instead of its content: ` +
          firstLine(snapshot.renderError.message),
        fix:
          `Fix layouts/${layout}/layout.tsx in the deck or its brand; ` +
          '`' +
          deckCommand() +
          ' dev` shows the error with its stack. Only slides on this layout are affected.',
        selector: '[data-slide-error]',
      },
    ];
  },
};
