import { defineLayoutContract, type FieldProblem } from '@deckster/engine/layout';
import { Schema } from 'effect';

import { textField } from '#layout-fields.ts';
import { patternFields, patternFootnote, patternHints } from '#layouts/pattern-slide.contract.ts';

/**
 * The length of an offer name.
 */
const PROFILE_MAX_CHARS = 24;

/**
 * The length of a buyer factor name.
 */
const FACTOR_MAX_CHARS = 22;

/**
 * The length of a focus or tradeoff line.
 */
const CHOICE_MAX_CHARS = 64;

/**
 * The fewest factors that distinguish the offer.
 */
const FACTOR_MIN = 4;

/**
 * The most factors given equal room on the x axis.
 */
const FACTOR_MAX = 6;

/**
 * A named offer scored against the same ordered factors on a common 1–5 scale.
 */
const Profile = Schema.Struct({
  name: textField(PROFILE_MAX_CHARS, 'a profile name'),
  levels: Schema.Array(Schema.Literals([1, 2, 3, 4, 5])),
});

/**
 * The factors and alternative value curves of one strategic choice.
 */
const Canvas = Schema.Struct({
  ...patternFields,
  factors: Schema.Array(textField(FACTOR_MAX_CHARS, 'a factor name')).check(
    Schema.isMinLength(FACTOR_MIN),
    Schema.isMaxLength(FACTOR_MAX),
  ),
  alternatives: Schema.Tuple([Profile, Profile]),
  offer: Profile,
  emphasize: textField(CHOICE_MAX_CHARS, 'the basis for a stronger offer'),
  tradeoff: textField(CHOICE_MAX_CHARS, 'what the strategy deliberately gives up'),
});

/**
 * Compares relative offering levels across buyer factors and names one tradeoff.
 */
export const strategyCanvasLayoutContract = defineLayoutContract({
  name: 'strategy-canvas',
  description:
    'Plot two alternatives and one chosen offer across shared buyer factors, then state the emphasis and tradeoff.',
  schema: Canvas,
  checks: ({ factors, alternatives, offer }): FieldProblem[] => {
    const profiles = [
      { path: 'alternatives.0.levels', levels: alternatives[0].levels },
      { path: 'alternatives.1.levels', levels: alternatives[1].levels },
      { path: 'offer.levels', levels: offer.levels },
    ];
    return profiles.flatMap(({ path, levels }) =>
      levels.length === factors.length
        ? []
        : [
            {
              path,
              message: `This value curve has ${levels.length} scores for ${factors.length} factors.`,
              fix: 'Write one score from 1 to 5 per factor, in the same order.',
            },
          ],
    );
  },
  hints: {
    ...patternHints,
    factors: `Give ${FACTOR_MIN} to ${FACTOR_MAX} ordered buyer factors up to ${FACTOR_MAX_CHARS} characters each, with a clear positive direction.`,
    alternatives: `Write 2 profiles with names up to ${PROFILE_MAX_CHARS} characters and one score 1–5 per factor, in order.`,
    offer: `Give a name up to ${PROFILE_MAX_CHARS} characters and one score 1–5 per factor, using the same assumptions.`,
    emphasize: `Describe the stronger offering in up to ${CHOICE_MAX_CHARS} characters.`,
    tradeoff: `Describe the sacrifice in up to ${CHOICE_MAX_CHARS} characters.`,
    reveal:
      'Show the alternative curves first, then the featured curve, then the strategic choices.',
  },
  title: { required: true, maxChars: 76 },
  slots: patternFootnote,
  budget: { footnote: { maxWords: 24 } },
  example: {
    frontmatter: {
      title: 'Same-day lamp repair serves the neighborhood',
      reveal: true,
      factors: [
        'Fast turnaround',
        'Walk-in access',
        'Rare parts',
        'Wide coverage',
        'Lower quote',
        'Home pickup',
      ],
      alternatives: [
        { name: 'Mail-in repair', levels: [2, 1, 5, 5, 4, 5] },
        { name: 'General workshop', levels: [3, 3, 4, 2, 3, 3] },
      ],
      offer: { name: 'Local lamp shop', levels: [5, 5, 2, 1, 5, 2] },
      emphasize: 'Fast repairs within walking distance',
      tradeoff: 'Rare parts go to a specialist',
    },
    body: '<Footnote>Illustrative qualitative assessments.</Footnote>\n\n<Notes>Read the alternatives. [click] Compare the local offer. [click] Explain its tradeoff.</Notes>\n',
  },
});
