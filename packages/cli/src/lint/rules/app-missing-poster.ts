import type { SlideRule } from '#lint/types.ts';

/**
 * The attribute `<AppFrame>` puts on the placeholder it draws when it has no poster.
 */
const MISSING_POSTER_ATTRIBUTE = 'app-missing-poster';

/**
 * A mini app frame with no `poster`. Static mode, `deck shot`, PDF and PPTX export and offline runs
 * never load the iframe, so without a poster they show a placeholder where the demo should be.
 */
export const appMissingPosterRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'app-missing-poster',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Frames can appear on any step.
   */
  scope: 'step',

  /**
   * A demo with nothing to export fails the deck.
   */
  severity: 'error',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'An <AppFrame> has no poster to show in static mode, export and offline.',

  /**
   * Reports each frame that drew the missing-poster placeholder.
   */
  check: ({ snapshot, slide }) =>
    snapshot.elements
      .filter((element) => element.data[MISSING_POSTER_ATTRIBUTE] !== undefined)
      .map((element) => ({
        message: 'An <AppFrame> has no poster, so exports and offline runs show an empty box.',
        fix:
          `Add \`poster="./poster.png"\` to the <AppFrame> in ${slide.file}: a screenshot of the ` +
          'app, or in TSX a function that renders its final state.',
        selector: element.selector,
      })),
};
