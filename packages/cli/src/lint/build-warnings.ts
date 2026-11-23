import type { LoadedSlide, MdxWarning } from '@deckster/vite-plugin';

import type { LintFinding } from '#lint/types.ts';

import { displayFile, type DeckPlace } from '#lint/deck-problems.ts';

/**
 * The rule id of a build warning whose plugin named no kind.
 */
export const BUILD_WARNING_RULE_ID = 'build-warning';

/**
 * The kinds of build warning the kit's MDX extension reports, with how much each matters in `deck
 * lint`. A missing file is an error: the slide shows a placeholder where the picture should be.
 */
export const BUILD_WARNING_SEVERITY: Readonly<Record<string, LintFinding['severity']>> = {
  /**
   * An `<Image>`, `<Video>`, `<Lottie>` or poster path that does not exist.
   */
  'media-missing': 'error',

  /**
   * A GIF that could not be converted to video.
   */
  'media-gif': 'warning',

  /**
   * A code block in a language Shiki does not know, shown as plain text.
   */
  'code-unknown-language': 'warning',

  /**
   * A highlight step that names lines the block does not have.
   */
  'code-step-range': 'warning',

  /**
   * A `<Cmd>` or `<Out>` tone the terminal does not have.
   */
  'terminal-tone': 'warning',

  /**
   * An image treatment the brand does not have, so the picture is drawn as it is. A warning, as
   * treatment names differ between brands and a deck may be linted in another one.
   */
  'treatment-unknown': 'warning',
};

/**
 * The fix of a warning whose plugin gave none.
 */
const DEFAULT_FIX = 'Change the slide as the message says, then run `deckster lint` again.';

/**
 * Turns the warnings the MDX extensions reported for one slide file into findings, each with the
 * rule id its plugin named and its fix.
 *
 * @param warnings - The warnings of the file, from the deck server's compile.
 * @param slide - The slide the file is.
 * @param place - The deck, to name the file.
 */
export function findingsFromBuildWarnings(
  warnings: readonly MdxWarning[],
  slide: Pick<LoadedSlide, 'id' | 'file'>,
  place: DeckPlace,
): LintFinding[] {
  return warnings.map((warning) => {
    const rule = warning.ruleId ?? BUILD_WARNING_RULE_ID;
    const line = warning.line === null ? '' : `Line ${warning.line}: `;
    return {
      slide: slide.id,
      file: displayFile(place.workspaceRoot, slide.file),
      step: null,
      rule,
      severity:
        (Object.hasOwn(BUILD_WARNING_SEVERITY, rule) ? BUILD_WARNING_SEVERITY[rule] : undefined) ??
        'warning',
      message: `${line}${warning.reason}`,
      fix: warning.fix ?? DEFAULT_FIX,
      selector: null,
    };
  });
}
