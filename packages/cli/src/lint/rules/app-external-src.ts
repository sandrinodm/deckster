import type { SlideRule } from '#lint/types.ts';

/**
 * The attribute `<AppFrame>` puts on a frame that loads a page from another origin.
 */
const EXTERNAL_ATTRIBUTE = 'app-external';

/**
 * The attribute `<AppFrame>` puts on a frame that has a recorded `fallback` video.
 */
const FALLBACK_ATTRIBUTE = 'app-has-fallback';

/**
 * An `<AppFrame src>` that loads a page from another origin. It needs network at the venue, and
 * venue Wi-Fi fails more often than anything else in a talk; a recorded `fallback` video keeps the
 * slide working offline and silences the warning.
 */
export const appExternalSrcRule: SlideRule = {
  /**
   * The rule id shown in findings.
   */
  id: 'app-external-src',

  /**
   * A slide rule.
   */
  kind: 'slide',

  /**
   * Frames can appear on any step.
   */
  scope: 'step',

  /**
   * The slide works with the network; the risk is the venue's.
   */
  severity: 'warning',

  /**
   * The sentence `deck lint --help` lists for the rule.
   */
  description: 'An <AppFrame src> loads an external page and has no recorded fallback video.',

  /**
   * Reports each external frame without a fallback.
   */
  check: ({ snapshot, slide }) =>
    snapshot.elements
      .filter(
        (element) =>
          element.data[EXTERNAL_ATTRIBUTE] !== undefined &&
          element.data[FALLBACK_ATTRIBUTE] === undefined,
      )
      .map((element) => ({
        message: 'An <AppFrame src> loads an external page, which fails when the venue Wi-Fi does.',
        fix:
          `Add \`fallback="./demo.mp4"\` to the <AppFrame> in ${slide.file}: a screen recording ` +
          'that plays when the page cannot load. Or bundle the demo as an app with `deck new app`.',
        selector: element.selector,
      })),
};
