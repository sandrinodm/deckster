import { deckCommand } from '@deckster/engine/command';

import type { DeckRule, SlideRule } from '#lint/types.ts';

import { firstLine } from '#cli-error.ts';

/**
 * The rule id shared by both halves of the check.
 */
const RULE_ID = 'render-error';

/**
 * The sentence `deck lint --help` lists for the rule.
 */
const DESCRIPTION = 'A slide threw while rendering, or the page threw an uncaught error.';

/**
 * A slide that threw: the engine shows the error in place of its content (marked with
 * `data-slide-error`), or the page threw an uncaught error while the slide was on screen.
 */
export const renderErrorRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: RULE_ID,

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * A step can throw on its own.
   */
  scope: 'step',

  /**
   * A broken slide fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: DESCRIPTION,

  /**
   * Reports the slide's error and every uncaught page error at this step.
   */
  check: ({ snapshot, slide }) => [
    ...(snapshot.renderError === null
      ? []
      : [
          {
            message:
              'The slide shows an error instead of its content: ' +
              firstLine(snapshot.renderError.message),
            fix:
              `Fix the error in ${slide.file}; ` +
              '`' +
              deckCommand() +
              ' dev` shows it with its stack in the browser.',
            selector: '[data-slide-error]',
          },
        ]),
    ...snapshot.pageErrors.map((error) => ({
      message: `The page threw while this slide was shown: ${firstLine(error)}`,
      fix:
        `Fix the code that throws, usually an effect or event handler in ${slide.file} ` +
        'or a component it uses.',
      selector: null,
    })),
  ],
};

/**
 * Uncaught errors the page threw while the deck loaded, before any slide was shown. In static mode
 * every slide mounts at once, so these cannot be tied to one slide.
 */
export const loadErrorRule: DeckRule = {
  /**
   * The rule id shown in findings, the same as {@link renderErrorRule}'s.
   */
  id: RULE_ID,

  /**
   * A deck rule.
   */
  kind: 'deck',

  /**
   * A broken page fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: DESCRIPTION,

  /**
   * Reports each error the page threw while loading.
   */
  check: ({ deck }) =>
    deck.pageErrors.map((error) => ({
      slide: null,
      message: `The page threw while the deck loaded: ${firstLine(error)}`,
      fix:
        'Run `' +
        deckCommand() +
        ' dev` and open the browser console ' +
        'to find the slide or plugin that throws.',
      selector: null,
    })),
};
