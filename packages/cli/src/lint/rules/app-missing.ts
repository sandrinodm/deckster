import type { SlideRule } from '#lint/types.ts';

/**
 * The attribute `<AppFrame>` puts on itself when the deck answers 404 for its app.
 */
const MISSING_APP_ATTRIBUTE = 'app-missing';

/**
 * The attribute that names the app a frame asked for.
 */
const APP_NAME_ATTRIBUTE = 'app-name';

/**
 * An `<AppFrame app>` whose app the deck does not have. A literal `app="name"` already fails the
 * build; this catches a name computed at run time (TSX, or an expression in MDX), which the build
 * cannot see.
 */
export const appMissingRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'app-missing',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Frames can appear on any step.
   */
  scope: 'step',

  /**
   * A demo that cannot load fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'An <AppFrame app> names an app the deck does not have.',

  /**
   * Reports each frame the deck answered 404 for.
   */
  check: ({ snapshot, slide, deck }) =>
    snapshot.elements
      .filter((element) => element.data[MISSING_APP_ATTRIBUTE] !== undefined)
      .map((element) => {
        const name = element.data[APP_NAME_ATTRIBUTE] ?? '';
        return {
          message: `<AppFrame app="${name}"> names an app that is not in decks/${deck.id}/apps/.`,
          fix:
            `Create it with \`pnpm deck new app ${deck.id} ${name}\`, or fix the name in ` +
            `${slide.file}.`,
          selector: element.selector,
          key: name,
        };
      }),
};
